/**
 * API: /api/google/auth
 * GET - Iniciar OAuth de Google Calendar para la marca
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { buildGoogleOAuthUrl, encodeGoogleState } from '@/lib/google'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const callbackUrl = request.nextUrl.searchParams.get('callback_url') || process.env.DASHBOARD_URL || ''

    const state = encodeGoogleState(auth.usuario.id, idMarca, callbackUrl)
    const url = buildGoogleOAuthUrl(state)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error('Error GET /api/google/auth:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
