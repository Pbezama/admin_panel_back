/**
 * API: /api/google/conexiones/callback
 * GET - Callback unificado de OAuth Google (Calendar + Drive + Sheets)
 *       Usa credenciales globales de CreceTec (env vars)
 */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { exchangeGoogleCode, getGoogleUserEmail, decodeGoogleState } from '@/lib/google'

export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      const callbackUrl = state ? decodeGoogleState(state).callback_url : process.env.DASHBOARD_URL
      return NextResponse.redirect(`${callbackUrl}?google_connect=error&reason=${error}`)
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Faltan parametros' }, { status: 400 })
    }

    const stateData = decodeGoogleState(state)
    const { conexion_id, callback_url } = stateData

    // Intercambiar codigo por tokens (credenciales globales)
    const tokens = await exchangeGoogleCode(code)

    // Obtener email
    const email = await getGoogleUserEmail(tokens.access_token)

    // Actualizar conexion con tokens y email
    await supabase.from('google_conexiones').update({
      email_google: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      scopes: tokens.scope || '',
      estado: 'activa',
      actualizado_en: new Date().toISOString()
    }).eq('id', conexion_id)

    // Tambien actualizar google_calendar_tokens si existe (compatibilidad)
    try {
      const marcaId = stateData.marca_id
      const userId = stateData.user_id
      const { data: existeCalendar } = await supabase
        .from('google_calendar_tokens')
        .select('id')
        .eq('id_marca', marcaId)
        .limit(1)

      if (existeCalendar && existeCalendar.length > 0) {
        await supabase.from('google_calendar_tokens').update({
          email_calendar: email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()
        }).eq('id_marca', marcaId)
      } else {
        await supabase.from('google_calendar_tokens').insert({
          id_marca: marcaId,
          email_calendar: email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
          conectado_por: userId
        })
      }
    } catch (e) {
      console.warn('Nota: No se pudo sincronizar con google_calendar_tokens:', e.message)
    }

    const redirectUrl = callback_url || process.env.DASHBOARD_URL || '/'
    return NextResponse.redirect(`${redirectUrl}?google_connect=success&conexion_id=${conexion_id}`)
  } catch (error) {
    console.error('Error GET /api/google/conexiones/callback:', error)
    return NextResponse.redirect(`${process.env.DASHBOARD_URL || '/'}?google_connect=error&reason=internal`)
  }
}
