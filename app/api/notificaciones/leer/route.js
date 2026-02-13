import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { marcarNotificacionesLeidas } from '@/lib/supabase'

/**
 * POST /api/notificaciones/leer
 * Marcar notificaciones como leídas
 * Body: { ids: [1, 2, 3] }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere un array de ids' },
        { status: 400 }
      )
    }

    const resultado = await marcarNotificacionesLeidas(ids)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en POST /api/notificaciones/leer:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
