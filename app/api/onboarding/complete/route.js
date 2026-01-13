import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { completarOnboarding, obtenerCuentasFacebook } from '@/lib/supabase'

/**
 * POST /api/onboarding/complete
 * Marca el onboarding como completado
 * REQUISITO: El usuario debe tener al menos una cuenta de Facebook conectada
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Response:
 * {
 *   success: true/false,
 *   error?: string
 * }
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

    // Verificar que tiene cuenta Facebook conectada
    const cuentas = await obtenerCuentasFacebook(usuario.id_marca)
    if (!cuentas.success || !cuentas.data || cuentas.data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Debes conectar una cuenta de Facebook/Instagram para continuar',
          requiere_facebook: true
        },
        { status: 400 }
      )
    }

    // Completar onboarding
    const resultado = await completarOnboarding(usuario.id, usuario.id_marca)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Onboarding completado exitosamente'
    })

  } catch (error) {
    console.error('Error en POST /api/onboarding/complete:', error)
    return NextResponse.json(
      { success: false, error: 'Error al completar onboarding' },
      { status: 500 }
    )
  }
}
