/**
 * API: /api/google/disconnect
 * POST - Desconectar Google Calendar de la marca
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { desconectarGoogleCalendar } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await desconectarGoogleCalendar(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error POST /api/google/disconnect:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
