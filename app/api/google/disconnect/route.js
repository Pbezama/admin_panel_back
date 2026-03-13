/**
 * API: /api/google/disconnect
 * POST - Desconectar una conexion Google especifica o la legacy de Calendar
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json().catch(() => ({}))
    const conexionId = body.conexion_id

    if (conexionId) {
      // Desconectar conexion especifica
      const { error } = await supabase
        .from('google_conexiones')
        .update({ estado: 'revocada', access_token: null, actualizado_en: new Date().toISOString() })
        .eq('id', conexionId)
        .eq('id_marca', idMarca)

      if (error) throw error
      return NextResponse.json({ success: true, mensaje: 'Conexion desconectada' })
    }

    // Legacy: desconectar Calendar
    try {
      await supabase
        .from('google_calendar_tokens')
        .delete()
        .eq('id_marca', idMarca)
    } catch (e) {
      // OK si no existe
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error POST /api/google/disconnect:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
