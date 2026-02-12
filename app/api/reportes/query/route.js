import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { queryReporte, TIPOS_REPORTE } from '@/lib/reportes'

/**
 * POST /api/reportes/query
 * Consulta datos para un reporte con filtros
 * Body: { tipo, filtros: { fechaDesde, fechaHasta, ...}, limite, offset }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { tipo, filtros = {} } = body

    if (!tipo) {
      return NextResponse.json({ success: false, error: 'Tipo de reporte es requerido' }, { status: 400 })
    }

    // Verificar que el tipo existe
    const config = TIPOS_REPORTE[tipo]
    if (!config) {
      return NextResponse.json({ success: false, error: `Tipo de reporte no valido: ${tipo}` }, { status: 400 })
    }

    // Verificar permisos admin-only
    if (config.adminOnly && !esAdmin(auth.usuario)) {
      return NextResponse.json({ success: false, error: 'Permisos insuficientes para este tipo de reporte' }, { status: 403 })
    }

    const idMarca = auth.usuario.id_marca
    const resultado = await queryReporte(tipo, filtros, idMarca)

    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Error en POST /api/reportes/query:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}

/**
 * GET /api/reportes/query
 * Retorna los tipos de reportes disponibles para el usuario
 */
export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const isAdmin = esAdmin(auth.usuario)
    const tipos = Object.values(TIPOS_REPORTE)
      .filter(t => !t.adminOnly || isAdmin)
      .map(t => ({ id: t.id, label: t.label, adminOnly: t.adminOnly }))

    return NextResponse.json({ success: true, tipos })
  } catch (error) {
    console.error('Error en GET /api/reportes/query:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}
