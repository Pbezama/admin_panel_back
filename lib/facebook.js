/**
 * Cliente para Facebook Graph API v17.0
 * Maneja OAuth y operaciones con páginas e Instagram Business
 */

const GRAPH_API_URL = 'https://graph.facebook.com/v17.0'

// Variables de entorno
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI

// Scopes necesarios para páginas e Instagram
const OAUTH_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_engagement',
  'instagram_basic',
  'instagram_manage_comments'
]

/**
 * Construye la URL para iniciar OAuth con Facebook
 * @param {string} state - Estado para CSRF (contiene user_id y marca_id)
 * @returns {string} URL de autorización de Facebook
 */
export function buildOAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    scope: OAUTH_SCOPES.join(','),
    state: state,
    response_type: 'code'
  })

  return `https://www.facebook.com/v17.0/dialog/oauth?${params.toString()}`
}

/**
 * Intercambia el código de autorización por un access token
 * @param {string} code - Código recibido del callback de Facebook
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
 */
export async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    code: code
  })

  const response = await fetch(
    `${GRAPH_API_URL}/oauth/access_token?${params.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener access token')
  }

  return response.json()
}

/**
 * Convierte un token de corta duración en uno de larga duración (60 días)
 * @param {string} shortLivedToken - Token de corta duración
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>}
 */
export async function getLongLivedToken(shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    fb_exchange_token: shortLivedToken
  })

  const response = await fetch(
    `${GRAPH_API_URL}/oauth/access_token?${params.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener token de larga duración')
  }

  return response.json()
}

/**
 * Obtiene las páginas de Facebook del usuario con sus tokens
 * @param {string} accessToken - Token de acceso del usuario
 * @returns {Promise<Array<{id: string, name: string, access_token: string, instagram_business_account?: {id: string}}>>}
 */
export async function getUserPages(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account',
    access_token: accessToken
  })

  const response = await fetch(
    `${GRAPH_API_URL}/me/accounts?${params.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener páginas')
  }

  const data = await response.json()
  return data.data || []
}

/**
 * Obtiene información de la cuenta de Instagram Business asociada a una página
 * @param {string} instagramId - ID de la cuenta de Instagram Business
 * @param {string} pageAccessToken - Token de acceso de la página
 * @returns {Promise<{id: string, username: string, name: string, profile_picture_url?: string}>}
 */
export async function getInstagramAccount(instagramId, pageAccessToken) {
  const params = new URLSearchParams({
    fields: 'id,username,name,profile_picture_url',
    access_token: pageAccessToken
  })

  const response = await fetch(
    `${GRAPH_API_URL}/${instagramId}?${params.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener cuenta de Instagram')
  }

  return response.json()
}

/**
 * Obtiene el token de larga duración para una página específica
 * @param {string} pageId - ID de la página
 * @param {string} userAccessToken - Token de acceso del usuario (long-lived)
 * @returns {Promise<{access_token: string, id: string}>}
 */
export async function getPageLongLivedToken(pageId, userAccessToken) {
  const params = new URLSearchParams({
    fields: 'access_token',
    access_token: userAccessToken
  })

  const response = await fetch(
    `${GRAPH_API_URL}/${pageId}?${params.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al obtener token de página')
  }

  return response.json()
}

/**
 * Verifica si un token es válido
 * @param {string} accessToken - Token a verificar
 * @returns {Promise<{is_valid: boolean, expires_at?: number, scopes?: string[]}>}
 */
export async function debugToken(accessToken) {
  const params = new URLSearchParams({
    input_token: accessToken,
    access_token: `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`
  })

  const response = await fetch(
    `${GRAPH_API_URL}/debug_token?${params.toString()}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Error al verificar token')
  }

  const data = await response.json()
  return data.data
}

/**
 * Codifica el state para OAuth (user_id + marca_id + callback_url)
 * @param {number} userId - ID del usuario
 * @param {number} marcaId - ID de la marca
 * @param {string} callbackUrl - URL del frontend para postMessage
 * @returns {string} State codificado en base64
 */
export function encodeState(userId, marcaId, callbackUrl) {
  const stateData = {
    user_id: userId,
    marca_id: marcaId,
    callback_url: callbackUrl,
    timestamp: Date.now()
  }
  return Buffer.from(JSON.stringify(stateData)).toString('base64')
}

/**
 * Decodifica el state de OAuth
 * @param {string} state - State codificado en base64
 * @returns {{user_id: number, marca_id: number, callback_url: string, timestamp: number}}
 */
export function decodeState(state) {
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch (error) {
    throw new Error('State inválido')
  }
}

/**
 * Calcula la fecha de expiración del token
 * @param {number} expiresIn - Segundos hasta expiración
 * @returns {Date} Fecha de expiración
 */
export function calculateTokenExpiry(expiresIn) {
  return new Date(Date.now() + (expiresIn * 1000))
}
