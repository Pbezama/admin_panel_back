/**
 * API: /api/google/auth
 * GET - Iniciar OAuth de Google (unificado: Calendar + Drive + Sheets)
 *       Usa credenciales globales de CreceTec
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { buildGoogleOAuthUrl, encodeGoogleState } from '@/lib/google'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const callbackUrl = request.nextUrl.searchParams.get('callback_url') || process.env.DASHBOARD_URL || ''
    const conexionId = request.nextUrl.searchParams.get('conexion_id')

    if (conexionId) {
      // Reconectar conexion existente
      const { data: conexion } = await supabase
        .from('google_conexiones')
        .select('id')
        .eq('id', conexionId)
        .eq('id_marca', idMarca)
        .limit(1)
        .single()

      if (!conexion) {
        return NextResponse.json({ error: 'Conexion no encontrada' }, { status: 404 })
      }

      const state = encodeGoogleState(conexion.id, auth.usuario.id, idMarca, callbackUrl)
      const url = buildGoogleOAuthUrl(state)
      return NextResponse.json({ success: true, url })
    }

    // Buscar primera conexion de la marca o crear una nueva
    const { data: conexiones } = await supabase
      .from('google_conexiones')
      .select('id')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: true })
      .limit(1)

    let conId
    if (conexiones && conexiones.length > 0) {
      conId = conexiones[0].id
    } else {
      // Auto-crear conexion
      const { data: nueva } = await supabase
        .from('google_conexiones')
        .insert({
          id_marca: idMarca,
          nombre_cuenta: 'Cuenta principal',
          estado: 'pendiente',
          conectado_por: auth.usuario.id
        })
        .select()
        .single()
      conId = nueva.id
    }

    const state = encodeGoogleState(conId, auth.usuario.id, idMarca, callbackUrl)
    const url = buildGoogleOAuthUrl(state)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error('Error GET /api/google/auth:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
