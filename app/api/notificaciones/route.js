import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerNotificacionesUsuario } from '@/lib/supabase'

/**
 * GET /api/notificaciones
 * Obtener notificaciones del usuario autenticado
 * Query params: solo_no_leidas (default true)
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
    const soloNoLeidas = searchParams.get('solo_no_leidas') !== 'false'

    const resultado = await obtenerNotificacionesUsuario(auth.usuario.id, soloNoLeidas)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/notificaciones:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
