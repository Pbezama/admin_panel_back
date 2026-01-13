import { NextResponse } from 'next/server'
import { loginUsuario, obtenerEstadoUsuario } from '@/lib/supabase'
import { crearToken } from '@/lib/auth'

export async function POST(request) {
  try {
    const { usuario, contrasena } = await request.json()

    // Validar inputs
    if (!usuario || !contrasena) {
      return NextResponse.json(
        { success: false, error: 'Usuario y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Intentar login
    const resultado = await loginUsuario(usuario, contrasena)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 401 }
      )
    }

    // Crear token JWT
    const tokenResult = await crearToken(resultado.usuario)

    if (!tokenResult.success) {
      return NextResponse.json(
        { success: false, error: 'Error al generar token' },
        { status: 500 }
      )
    }

    // Excluir contraseña del usuario retornado
    const { contrasena: _, ...usuarioSinPassword } = resultado.usuario

    // Obtener estado de onboarding y límites
    const estado = await obtenerEstadoUsuario(
      resultado.usuario.id,
      resultado.usuario.id_marca
    )

    return NextResponse.json({
      success: true,
      token: tokenResult.token,
      usuario: {
        ...usuarioSinPassword,
        plan: estado.plan || 'gratuito',
        onboarding_completado: estado.onboarding_completado || false
      },
      onboarding: {
        completado: estado.onboarding_completado || false,
        requiere_onboarding: !estado.onboarding_completado,
        tiene_facebook: estado.tiene_facebook || false
      }
    })

  } catch (error) {
    console.error('Error en /api/auth/login:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
