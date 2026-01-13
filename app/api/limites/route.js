import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerUsoMarca, verificarOnboarding, sincronizarUso } from '@/lib/supabase'
import { LIMITES, obtenerLimitesRestantes, puedeRealizarAccion } from '@/lib/limites'

/**
 * GET /api/limites
 * Obtiene los límites y uso actual del usuario
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Query params:
 * - sync: boolean (opcional) - Si es true, sincroniza contadores antes de retornar
 *
 * Response:
 * {
 *   success: true,
 *   plan: string,
 *   limites: { ... definición de límites del plan },
 *   uso: { comentarios_usados, datos_usados, tareas_usadas },
 *   restantes: { ... límites restantes calculados }
 * }
 */
export async function GET(request) {
  try {
    // Verificar autenticación
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const usuario = auth.usuario
    const { searchParams } = new URL(request.url)
    const sync = searchParams.get('sync') === 'true'

    // Sincronizar uso si se solicita
    if (sync) {
      await sincronizarUso(usuario.id_marca)
    }

    // Obtener plan del usuario
    const onboardingResult = await verificarOnboarding(usuario.id)
    const plan = onboardingResult.plan || 'gratuito'

    // Obtener uso actual
    const usoResult = await obtenerUsoMarca(usuario.id_marca)
    const uso = usoResult.data || {
      comentarios_usados: 0,
      datos_usados: 0,
      tareas_usadas: 0
    }

    // Calcular límites restantes
    const restantes = obtenerLimitesRestantes(plan, uso)

    return NextResponse.json({
      success: true,
      plan,
      limites: LIMITES[plan] || LIMITES.gratuito,
      uso: {
        comentarios_usados: uso.comentarios_usados || 0,
        datos_usados: uso.datos_usados || 0,
        tareas_usadas: uso.tareas_usadas || 0
      },
      restantes,
      puede: {
        agregar_dato: puedeRealizarAccion(plan, 'datos', uso.datos_usados || 0),
        crear_tarea: puedeRealizarAccion(plan, 'tareas', uso.tareas_usadas || 0),
        procesar_comentario: puedeRealizarAccion(plan, 'comentarios', uso.comentarios_usados || 0)
      }
    })

  } catch (error) {
    console.error('Error en GET /api/limites:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener límites' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/limites/sync
 * Sincroniza los contadores de uso con los datos reales de la BD
 */
export async function POST(request) {
  try {
    // Verificar autenticación
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const usuario = auth.usuario

    // Sincronizar uso
    const resultado = await sincronizarUso(usuario.id_marca)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 500 }
      )
    }

    // Retornar uso actualizado
    const usoResult = await obtenerUsoMarca(usuario.id_marca)

    return NextResponse.json({
      success: true,
      message: 'Uso sincronizado correctamente',
      uso: usoResult.data
    })

  } catch (error) {
    console.error('Error en POST /api/limites/sync:', error)
    return NextResponse.json(
      { success: false, error: 'Error al sincronizar uso' },
      { status: 500 }
    )
  }
}
