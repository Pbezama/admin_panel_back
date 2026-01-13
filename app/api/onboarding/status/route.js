import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerEstadoUsuario } from '@/lib/supabase'

/**
 * GET /api/onboarding/status
 * Obtiene el estado de onboarding y límites del usuario
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Response:
 * {
 *   success: true,
 *   onboarding_completado: boolean,
 *   requiere_onboarding: boolean,
 *   tiene_facebook: boolean,
 *   plan: string,
 *   uso: { comentarios_usados, datos_usados, tareas_usadas }
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

    // Obtener estado completo
    const estado = await obtenerEstadoUsuario(usuario.id, usuario.id_marca)

    if (!estado.success) {
      return NextResponse.json(
        { success: false, error: estado.error || 'Error al obtener estado' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      onboarding_completado: estado.onboarding_completado,
      requiere_onboarding: !estado.onboarding_completado,
      tiene_facebook: estado.tiene_facebook,
      cuentas_facebook: estado.cuentas_facebook,
      plan: estado.plan,
      uso: estado.uso
    })

  } catch (error) {
    console.error('Error en GET /api/onboarding/status:', error)
    return NextResponse.json(
      { success: false, error: 'Error al verificar estado de onboarding' },
      { status: 500 }
    )
  }
}
