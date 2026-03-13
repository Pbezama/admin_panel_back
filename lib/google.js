/**
 * Cliente unificado para Google APIs
 * Maneja OAuth2, Calendar, Drive, Sheets y Docs
 * Credenciales OAuth GLOBALES de CreceTec (env vars)
 * El cliente solo hace clic en "Conectar" y autoriza permisos
 */

import { supabase } from './supabase'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3'
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3'
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets'

// Credenciales globales de CreceTec
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

// Scopes unificados: Calendar + Drive + Sheets + UserInfo
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email'
]


// ============================================
// OAUTH2 - Credenciales globales de CreceTec
// ============================================

/**
 * Construye URL de autorizacion OAuth2
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
 * Refresca un access token expirado
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
  if (!response.ok) throw new Error('Error al obtener email de Google')
  const data = await response.json()
  return data.email
}

/**
 * Codifica state para OAuth (incluye conexion_id para saber que conexion actualizar)
 */
export function encodeGoogleState(conexionId, userId, marcaId, callbackUrl) {
  const stateData = { conexion_id: conexionId, user_id: userId, marca_id: marcaId, callback_url: callbackUrl, timestamp: Date.now() }
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


// ============================================
// TOKEN MANAGEMENT
// ============================================

/**
 * Obtiene un access_token valido para una conexion.
 * Si esta expirado, intenta refrescar. Si falla, marca como expirada.
 */
export async function obtenerTokenValido(conexionId) {
  const { data: conexion, error } = await supabase
    .from('google_conexiones')
    .select('*')
    .eq('id', conexionId)
    .limit(1)
    .single()

  if (error || !conexion) throw new Error('Conexion Google no encontrada')
  if (conexion.estado === 'revocada') throw new Error('Conexion Google fue revocada. Reconecte desde Conexiones.')

  // Token aun valido (con 5 min de margen)
  const ahora = new Date()
  const expiry = new Date(conexion.token_expiry)
  if (conexion.access_token && expiry > new Date(ahora.getTime() + 5 * 60000)) {
    return { access_token: conexion.access_token, conexion }
  }

  // Intentar refrescar
  if (!conexion.refresh_token) {
    await supabase.from('google_conexiones').update({ estado: 'expirada', actualizado_en: new Date().toISOString() }).eq('id', conexionId)
    throw new Error('Token expirado y sin refresh token. Reconecte desde Conexiones.')
  }

  try {
    const tokens = await refreshGoogleToken(conexion.refresh_token)
    const newExpiry = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()

    await supabase.from('google_conexiones').update({
      access_token: tokens.access_token,
      token_expiry: newExpiry,
      estado: 'activa',
      actualizado_en: new Date().toISOString()
    }).eq('id', conexionId)

    return { access_token: tokens.access_token, conexion: { ...conexion, access_token: tokens.access_token } }
  } catch (err) {
    await supabase.from('google_conexiones').update({ estado: 'expirada', actualizado_en: new Date().toISOString() }).eq('id', conexionId)
    throw new Error('No se pudo refrescar token. Reconecte desde Conexiones.')
  }
}


// ============================================
// GOOGLE CALENDAR
// ============================================

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
 * Consulta disponibilidad (freebusy)
 */
export async function obtenerDisponibilidad(accessToken, calendarId, fechaInicio, fechaFin) {
  const response = await fetch(`${CALENDAR_API_URL}/freeBusy`, {
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
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al consultar disponibilidad')
  }

  const data = await response.json()
  return data.calendars?.[calendarId]?.busy || []
}

/**
 * Lista eventos del calendario
 */
export async function listarEventosCalendar(accessToken, calendarId, timeMin, timeMax, maxResults = 50) {
  const params = new URLSearchParams({
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60000).toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime'
  })

  const response = await fetch(
    `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al listar eventos')
  }

  return response.json()
}


// ============================================
// GOOGLE DRIVE
// ============================================

/**
 * Lista archivos del Drive (solo los tipos relevantes)
 * @param {string} query - Busqueda opcional (nombre de archivo)
 * @param {string} folderId - ID de carpeta para explorar (null = root)
 */
export async function listarArchivosDrive(accessToken, { query, folderId, pageToken, pageSize = 20 } = {}) {
  let q = 'trashed = false'

  if (folderId) {
    q += ` and '${folderId}' in parents`
  }

  if (query) {
    q += ` and name contains '${query.replace(/'/g, "\\'")}'`
  }

  // Solo archivos relevantes: Sheets, Docs, PDFs, carpetas
  q += ` and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.folder')`

  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink, parents)',
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc'
  })

  if (pageToken) params.set('pageToken', pageToken)

  const response = await fetch(`${DRIVE_API_URL}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al listar archivos de Drive')
  }

  return response.json()
}

/**
 * Obtiene metadata de un archivo de Drive
 */
export async function obtenerArchivoDrive(accessToken, fileId) {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, modifiedTime, size, webViewLink, iconLink'
  })

  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener archivo de Drive')
  }

  return response.json()
}

/**
 * Lee contenido de un Google Doc como texto plano
 */
export async function leerGoogleDoc(accessToken, fileId) {
  const response = await fetch(
    `${DRIVE_API_URL}/files/${fileId}/export?mimeType=text/plain`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    throw new Error('Error al leer Google Doc')
  }

  return response.text()
}

/**
 * Lee contenido de un PDF desde Drive
 */
export async function leerPdfDrive(accessToken, fileId) {
  const response = await fetch(
    `${DRIVE_API_URL}/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    throw new Error('Error al descargar PDF de Drive')
  }

  return response.arrayBuffer()
}


// ============================================
// GOOGLE SHEETS
// ============================================

/**
 * Obtiene metadata de un Spreadsheet (lista de pestanas)
 */
export async function obtenerInfoSheet(accessToken, spreadsheetId) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets(properties(sheetId,title,index,gridProperties))`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener info del Sheet')
  }

  return response.json()
}

/**
 * Lee datos de una pestana (rango o toda)
 * @param {string} range - Ej: "Hoja1!A1:Z100" o "Hoja1"
 */
export async function leerDatosSheet(accessToken, spreadsheetId, range) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al leer datos del Sheet')
  }

  return response.json()
}

/**
 * Escribe filas al final de una pestana (append)
 * @param {Array<Array>} values - Filas a escribir, ej: [["Juan", 25], ["Maria", 30]]
 */
export async function escribirFilasSheet(accessToken, spreadsheetId, range, values) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al escribir en Sheet')
  }

  return response.json()
}

/**
 * Actualiza celdas especificas (update, no append)
 * @param {string} range - Ej: "Hoja1!A5:C5"
 * @param {Array<Array>} values - Valores a poner en ese rango
 */
export async function actualizarCeldasSheet(accessToken, spreadsheetId, range, values) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al actualizar celdas')
  }

  return response.json()
}

/**
 * Limpia un rango (elimina contenido pero no la fila)
 */
export async function limpiarRangoSheet(accessToken, spreadsheetId, range) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al limpiar rango')
  }

  return response.json()
}

/**
 * Elimina filas por indice (0-based)
 */
export async function eliminarFilasSheet(accessToken, spreadsheetId, sheetId, startIndex, endIndex) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex
            }
          }
        }]
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al eliminar filas')
  }

  return response.json()
}

/**
 * Crea una nueva pestana en un Spreadsheet
 */
export async function crearPestanaSheet(accessToken, spreadsheetId, titulo) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: { title: titulo }
          }
        }]
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al crear pestana')
  }

  return response.json()
}

/**
 * Duplica una pestana existente como plantilla
 */
export async function duplicarPestanaSheet(accessToken, spreadsheetId, sheetId, nuevoTitulo) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          duplicateSheet: {
            sourceSheetId: sheetId,
            newSheetName: nuevoTitulo
          }
        }]
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al duplicar pestana')
  }

  return response.json()
}

/**
 * Operacion por lote: lee multiples rangos a la vez
 * @param {Array<string>} ranges - Ej: ["Hoja1!A:A", "Hoja2!B1:B100"]
 */
export async function leerLoteSheet(accessToken, spreadsheetId, ranges) {
  const params = new URLSearchParams()
  ranges.forEach(r => params.append('ranges', r))

  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values:batchGet?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al leer lote')
  }

  return response.json()
}

/**
 * Operacion por lote: escribe en multiples rangos a la vez
 * @param {Array<{range: string, values: Array<Array>}>} data
 */
export async function escribirLoteSheet(accessToken, spreadsheetId, data) {
  const response = await fetch(
    `${SHEETS_API_URL}/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al escribir lote')
  }

  return response.json()
}

/**
 * Busca filas que coincidan con un criterio en una columna
 * Lee toda la pestana y filtra en JS (Google Sheets API no tiene query nativo)
 */
export async function buscarFilasSheet(accessToken, spreadsheetId, range, columna, valor) {
  const data = await leerDatosSheet(accessToken, spreadsheetId, range)
  const rows = data.values || []

  if (rows.length === 0) return { headers: [], resultados: [], total: 0 }

  const headers = rows[0]
  const colIndex = typeof columna === 'number' ? columna : headers.findIndex(h =>
    h.toLowerCase().trim() === columna.toLowerCase().trim()
  )

  if (colIndex === -1) throw new Error(`Columna "${columna}" no encontrada. Columnas disponibles: ${headers.join(', ')}`)

  const resultados = rows.slice(1).filter((row, i) => {
    const cellValue = (row[colIndex] || '').toString().toLowerCase()
    return cellValue.includes(valor.toString().toLowerCase())
  }).map((row, i) => ({
    fila_index: rows.indexOf(row),
    datos: Object.fromEntries(headers.map((h, j) => [h, row[j] || '']))
  }))

  return { headers, resultados, total: resultados.length }
}


// ============================================
// OPERACIONES LOG
// ============================================

/**
 * Registra una operacion en google_operaciones_log
 */
export async function registrarOperacionGoogle({ idMarca, idConexion, idArchivo, operacion, origen, origenId, datosRequest, datosResponse, filasAfectadas, exito, error, duracionMs }) {
  await supabase.from('google_operaciones_log').insert({
    id_marca: idMarca,
    id_conexion: idConexion,
    id_archivo: idArchivo,
    operacion,
    origen: origen || 'manual',
    origen_id: origenId,
    datos_request: datosRequest || {},
    datos_response: datosResponse || {},
    filas_afectadas: filasAfectadas || 0,
    exito: exito !== false,
    error: error || null,
    duracion_ms: duracionMs
  })
}
