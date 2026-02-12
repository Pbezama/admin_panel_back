/**
 * API: /api/google/status
 * GET - Estado de conexion Google Calendar de la marca
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTokenGoogleCalendar } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerTokenGoogleCalendar(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    const token = resultado.data
    return NextResponse.json({
      success: true,
      connected: !!token,
      email: token?.email_calendar || null,
      calendar_id: token?.calendar_id || null
    })
  } catch (error) {
    console.error('Error GET /api/google/status:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
