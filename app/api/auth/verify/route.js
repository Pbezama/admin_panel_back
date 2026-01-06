import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)

    if (!auth.autenticado) {
      return NextResponse.json(
        { valid: false, error: auth.error },
        { status: 401 }
      )
    }

    return NextResponse.json({
      valid: true,
      usuario: auth.usuario
    })

  } catch (error) {
    console.error('Error en /api/auth/verify:', error)
    return NextResponse.json(
      { valid: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
