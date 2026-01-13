import { NextResponse } from 'next/server'
import { registrarUsuario } from '@/lib/supabase'
import { crearToken } from '@/lib/auth'

/**
 * POST /api/auth/register
 * Registra un nuevo usuario
 *
 * Body:
 * - nombre: string - Nombre completo
 * - email: string - Email (será el usuario para login)
 * - empresa: string - Nombre de la empresa/marca
 * - password: string - Contraseña (mínimo 8 caracteres)
 *
 * Response:
 * {
 *   success: true,
 *   usuario: { id, nombre, email, ... },
 *   token: string (JWT)
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { nombre, email, empresa, password } = body

    // Validaciones básicas
    if (!nombre || !email || !empresa || !password) {
      return NextResponse.json(
        { success: false, error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Email inválido' },
        { status: 400 }
      )
    }

    // Validar contraseña
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      )
    }

    // Registrar usuario
    const resultado = await registrarUsuario({
      nombre,
      email,
      empresa,
      password
    })

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 400 }
      )
    }

    // Crear token JWT para el nuevo usuario
    const tokenResult = await crearToken(resultado.usuario)

    if (!tokenResult.success) {
      // Usuario creado pero error al generar token
      // El usuario podrá hacer login manualmente
      return NextResponse.json({
        success: true,
        usuario: resultado.usuario,
        token: null,
        message: 'Usuario creado. Por favor inicia sesión.'
      })
    }

    return NextResponse.json({
      success: true,
      usuario: resultado.usuario,
      token: tokenResult.token,
      onboarding: {
        completado: false,
        requiere_onboarding: true
      }
    })

  } catch (error) {
    console.error('Error en POST /api/auth/register:', error)
    return NextResponse.json(
      { success: false, error: 'Error al registrar usuario' },
      { status: 500 }
    )
  }
}
