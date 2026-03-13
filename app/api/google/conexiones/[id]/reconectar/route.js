/**
 * API: /api/google/conexiones/[id]/reconectar
 * POST - Regenerar URL OAuth para reconectar una conexion expirada/revocada
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { buildGoogleOAuthUrl, encodeGoogleState } from '@/lib/google'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json().catch(() => ({}))

    // Verificar que la conexion existe y pertenece a la marca
    const { data: conexion, error } = await supabase
      .from('google_conexiones')
      .select('id')
      .eq('id', id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (error || !conexion) {
      return NextResponse.json({ error: 'Conexion no encontrada' }, { status: 404 })
    }

    const state = encodeGoogleState(conexion.id, auth.usuario.id, idMarca, body.callback_url || process.env.DASHBOARD_URL || '')
    const oauthUrl = buildGoogleOAuthUrl(state)

    return NextResponse.json({ success: true, oauth_url: oauthUrl })
  } catch (error) {
    console.error('Error POST /api/google/conexiones/[id]/reconectar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
