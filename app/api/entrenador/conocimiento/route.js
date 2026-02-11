import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConocimientoMarca, obtenerReglasPropuestas } from '@/lib/supabase'

/**
 * GET /api/entrenador/conocimiento
 * Retorna mapa de conocimiento + reglas propuestas de la marca
 * Query params: ?estado=pendiente|aprobado|rechazado|editado
 */
export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado')
    const idMarca = auth.usuario.id_marca

    const [conocimientoResult, reglasResult] = await Promise.all([
      obtenerConocimientoMarca(idMarca, estado),
      obtenerReglasPropuestas(idMarca)
    ])

    // Agrupar conocimiento por categoría
    const conocimientoPorCategoria = {}
    for (const item of (conocimientoResult.data || [])) {
      if (!conocimientoPorCategoria[item.categoria]) {
        conocimientoPorCategoria[item.categoria] = []
      }
      conocimientoPorCategoria[item.categoria].push(item)
    }

    return NextResponse.json({
      success: true,
      conocimiento: conocimientoResult.data || [],
      conocimiento_por_categoria: conocimientoPorCategoria,
      reglas_propuestas: reglasResult.data || [],
      total_conocimiento: (conocimientoResult.data || []).length,
      total_reglas: (reglasResult.data || []).length
    })
  } catch (error) {
    console.error('Error en GET conocimiento entrenador:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
