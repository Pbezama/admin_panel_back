/**
 * API: /api/google/callback
 * GET - Callback de OAuth Google Calendar
 */

import { NextResponse } from 'next/server'
import { exchangeGoogleCode, getGoogleUserEmail, decodeGoogleState } from '@/lib/google'
import { guardarTokenGoogleCalendar } from '@/lib/supabase'

export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      const callbackUrl = state ? decodeGoogleState(state).callback_url : process.env.DASHBOARD_URL
      return NextResponse.redirect(`${callbackUrl}?google_calendar=error&reason=${error}`)
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Faltan parametros' }, { status: 400 })
    }

    const stateData = decodeGoogleState(state)
    const { user_id, marca_id, callback_url } = stateData

    // Intercambiar codigo por tokens
    const tokens = await exchangeGoogleCode(code)

    // Obtener email del calendario
    const email = await getGoogleUserEmail(tokens.access_token)

    // Guardar tokens en BD
    await guardarTokenGoogleCalendar({
      id_marca: marca_id,
      email_calendar: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      conectado_por: user_id
    })

    // Redirigir al frontend con indicador de exito
    const redirectUrl = callback_url || process.env.DASHBOARD_URL || '/'
    return NextResponse.redirect(`${redirectUrl}?google_calendar=success`)
  } catch (error) {
    console.error('Error GET /api/google/callback:', error)
    return NextResponse.redirect(`${process.env.DASHBOARD_URL || '/'}?google_calendar=error&reason=internal`)
  }
}
