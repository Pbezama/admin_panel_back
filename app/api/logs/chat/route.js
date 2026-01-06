import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { guardarMensajeChat, obtenerHistorialChat } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { mensaje } = await request.json()

    if (!mensaje) {
      return NextResponse.json(
        { success: false, error: 'Mensaje es requerido' },
        { status: 400 }
      )
    }

    // Agregar info del usuario
    const mensajeConUsuario = {
      ...mensaje,
      usuario_id: auth.usuario.id
    }

    const resultado = await guardarMensajeChat(mensajeConUsuario)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/logs/chat:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

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
    const sesionId = searchParams.get('sesionId')
    const limite = parseInt(searchParams.get('limite')) || 50

    if (!sesionId) {
      return NextResponse.json(
        { success: false, error: 'sesionId es requerido' },
        { status: 400 }
      )
    }

    const resultado = await obtenerHistorialChat(sesionId, limite)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/logs/chat GET:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
