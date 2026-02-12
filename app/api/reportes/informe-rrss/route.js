import { verificarAutenticacion } from '@/lib/auth'
import { generarInformeRRSS } from '@/lib/informe-rrss'

/**
 * POST /api/reportes/informe-rrss
 * Genera un informe completo de Instagram/RRSS para la marca del usuario
 *
 * Body: { periodo_desde, periodo_hasta, guardar? }
 * - periodo_desde: "YYYY-MM-DD"
 * - periodo_hasta: "YYYY-MM-DD"
 * - guardar: boolean (default true) - si guardar en Supabase
 *
 * Response: { success, html, resumen, marca, instagram_name, periodo }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return Response.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = auth.usuario.id_marca
    if (!idMarca) {
      return Response.json({ error: 'No se encontró marca asociada al usuario' }, { status: 400 })
    }

    const body = await request.json()
    const { periodo_desde, periodo_hasta, guardar = true } = body

    if (!periodo_desde || !periodo_hasta) {
      return Response.json({ error: 'Se requieren periodo_desde y periodo_hasta (YYYY-MM-DD)' }, { status: 400 })
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(periodo_desde) || !dateRegex.test(periodo_hasta)) {
      return Response.json({ error: 'Formato de fecha invalido. Use YYYY-MM-DD' }, { status: 400 })
    }

    // Validate date range (max 90 days)
    const desde = new Date(periodo_desde)
    const hasta = new Date(periodo_hasta)
    const diffDays = Math.round((hasta - desde) / 86400000)
    if (diffDays < 0) {
      return Response.json({ error: 'periodo_desde debe ser anterior a periodo_hasta' }, { status: 400 })
    }
    if (diffDays > 90) {
      return Response.json({ error: 'El rango maximo es de 90 dias' }, { status: 400 })
    }

    console.log(`[Informe RRSS] Marca ${idMarca} | ${periodo_desde} → ${periodo_hasta}`)

    const resultado = await generarInformeRRSS(idMarca, periodo_desde, periodo_hasta, guardar)

    if (!resultado.success) {
      return Response.json({ error: resultado.error }, { status: 400 })
    }

    return Response.json({
      success: true,
      html: resultado.html,
      resumen: resultado.resumen,
      marca: resultado.marca,
      instagram_name: resultado.instagram_name,
      periodo: resultado.periodo,
      guardado: resultado.guardado || false,
      htmlGuardado: resultado.htmlGuardado || false,
      guardarError: resultado.guardarError || null
    })

  } catch (error) {
    console.error('Error en POST /api/reportes/informe-rrss:', error)
    return Response.json(
      { error: error.message || 'Error interno generando informe' },
      { status: 500 }
    )
  }
}
