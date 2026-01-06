import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { guardarLogAccion } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { log } = await request.json()

    if (!log) {
      return NextResponse.json(
        { success: false, error: 'Log es requerido' },
        { status: 400 }
      )
    }

    // Agregar info del usuario
    const logConUsuario = {
      ...log,
      usuario_id: auth.usuario.id
    }

    const resultado = await guardarLogAccion(logConUsuario)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/logs/action:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
