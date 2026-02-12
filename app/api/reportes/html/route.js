import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { queryReporte, generarHTMLInteractivo, TIPOS_REPORTE } from '@/lib/reportes'

// Simple in-memory cache (1 hour TTL)
const htmlCache = new Map()

function limpiarCacheExpirado() {
  const ahora = Date.now()
  for (const [key, entry] of htmlCache.entries()) {
    if (ahora - entry.timestamp > 3600000) { // 1 hora
      htmlCache.delete(key)
    }
  }
}

/**
 * POST /api/reportes/html
 * Genera reporte HTML interactivo con Chart.js
 * Body: { tipo, filtros, guardar: boolean }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { tipo, filtros = {}, guardar = false } = body

    if (!tipo) {
      return NextResponse.json({ success: false, error: 'Tipo es requerido' }, { status: 400 })
    }

    const config = TIPOS_REPORTE[tipo]
    if (!config) {
      return NextResponse.json({ success: false, error: 'Tipo no valido' }, { status: 400 })
    }

    if (config.adminOnly && !esAdmin(auth.usuario)) {
      return NextResponse.json({ success: false, error: 'Permisos insuficientes' }, { status: 403 })
    }

    const idMarca = auth.usuario.id_marca
    const nombreMarca = auth.usuario.nombre_marca || 'Marca'

    // Query data
    const exportFiltros = { ...filtros, limite: 5000 }
    const resultado = await queryReporte(tipo, exportFiltros, idMarca)

    if (!resultado.success) {
      return NextResponse.json(resultado, { status: 500 })
    }

    // Generate HTML
    const html = generarHTMLInteractivo(tipo, resultado.data, {
      nombreMarca,
      filtros
    })

    let cacheId = null

    if (guardar) {
      limpiarCacheExpirado()
      cacheId = `${idMarca}_${tipo}_${Date.now()}`
      htmlCache.set(cacheId, {
        html,
        timestamp: Date.now(),
        tipo,
        nombreMarca,
        idMarca
      })
    }

    return NextResponse.json({
      success: true,
      html,
      cacheId,
      total: resultado.total
    })
  } catch (error) {
    console.error('Error en POST /api/reportes/html:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}

// Export cache for use by the cache route
export { htmlCache }
