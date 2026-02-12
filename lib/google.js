/**
 * Cliente para Google Calendar API v3
 * Maneja OAuth2 y operaciones con Calendar
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
]

/**
 * Construye URL de autorizacion OAuth2 de Google
 */
export function buildGoogleOAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Intercambia codigo de autorizacion por tokens
 */
export async function exchangeGoogleCode(code) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Error al obtener tokens de Google')
  }

  return response.json()
}

/**
 * Refresca un access token expirado usando el refresh token
 */
export async function refreshGoogleToken(refreshToken) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Error al refrescar token de Google')
  }

  return response.json()
}

/**
 * Obtiene el email del usuario autenticado
 */
export async function getGoogleUserEmail(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    throw new Error('Error al obtener email de Google')
  }

  const data = await response.json()
  return data.email
}

/**
 * Crea un evento en Google Calendar
 */
export async function crearEventoCalendar(accessToken, calendarId, evento) {
  const response = await fetch(
    `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: evento.titulo,
        description: evento.descripcion || '',
        start: {
          dateTime: evento.fechaInicio,
          timeZone: evento.timezone || 'America/Santiago'
        },
        end: {
          dateTime: evento.fechaFin,
          timeZone: evento.timezone || 'America/Santiago'
        },
        attendees: evento.attendees || [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 }
          ]
        }
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al crear evento en Calendar')
  }

  return response.json()
}

/**
 * Consulta disponibilidad (freebusy) en un rango de fechas
 */
export async function obtenerDisponibilidad(accessToken, calendarId, fechaInicio, fechaFin) {
  const response = await fetch(
    `${CALENDAR_API_URL}/freeBusy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timeMin: fechaInicio,
        timeMax: fechaFin,
        items: [{ id: calendarId }]
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al consultar disponibilidad')
  }

  const data = await response.json()
  return data.calendars?.[calendarId]?.busy || []
}

/**
 * Codifica state para OAuth
 */
export function encodeGoogleState(userId, marcaId, callbackUrl) {
  const stateData = { user_id: userId, marca_id: marcaId, callback_url: callbackUrl, timestamp: Date.now() }
  return Buffer.from(JSON.stringify(stateData)).toString('base64')
}

/**
 * Decodifica state de OAuth
 */
export function decodeGoogleState(state) {
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
  } catch {
    throw new Error('State de Google invalido')
  }
}
