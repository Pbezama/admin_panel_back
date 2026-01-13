import { NextResponse } from 'next/server'
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getUserPages,
  getInstagramAccount,
  decodeState,
  calculateTokenExpiry
} from '@/lib/facebook'
import { guardarCuentaFacebook } from '@/lib/supabase'

/**
 * GET /api/facebook/callback
 * Callback de OAuth de Facebook
 *
 * Query params (de Facebook):
 * - code: Código de autorización
 * - state: Estado codificado con user_id, marca_id, callback_url
 * - error: Error si el usuario canceló
 * - error_description: Descripción del error
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Decodificar state para obtener callback_url
    let stateData
    try {
      stateData = decodeState(state || '')
    } catch (e) {
      stateData = { callback_url: process.env.FRONTEND_URL || 'http://localhost:3002' }
    }

    const { user_id: userId, marca_id: marcaId, callback_url: callbackUrl } = stateData

    // Si hubo error (usuario canceló)
    if (error) {
      return generateErrorResponse(callbackUrl, error, errorDescription || 'Usuario canceló la autorización')
    }

    // Validar que tenemos el código
    if (!code) {
      return generateErrorResponse(callbackUrl, 'missing_code', 'No se recibió código de autorización')
    }

    // Validar que tenemos la información del usuario
    if (!userId || !marcaId) {
      return generateErrorResponse(callbackUrl, 'invalid_state', 'Estado inválido')
    }

    // Paso 1: Intercambiar código por token de corta duración
    console.log('Intercambiando código por token...')
    const tokenResponse = await exchangeCodeForToken(code)
    const shortLivedToken = tokenResponse.access_token

    // Paso 2: Convertir a token de larga duración (60 días)
    console.log('Obteniendo token de larga duración...')
    const longLivedResponse = await getLongLivedToken(shortLivedToken)
    const longLivedToken = longLivedResponse.access_token
    const expiresIn = longLivedResponse.expires_in || 5184000 // 60 días por defecto

    // Paso 3: Obtener páginas del usuario
    console.log('Obteniendo páginas del usuario...')
    const pages = await getUserPages(longLivedToken)

    if (!pages || pages.length === 0) {
      return generateErrorResponse(callbackUrl, 'no_pages', 'No se encontraron páginas de Facebook')
    }

    // Paso 4: Guardar cada página con su cuenta de Instagram
    const savedAccounts = []
    for (const page of pages) {
      const pageId = page.id
      const pageName = page.name
      const pageToken = page.access_token

      let instagramId = null
      let instagramUsername = null

      // Obtener Instagram Business Account si existe
      if (page.instagram_business_account) {
        const igId = typeof page.instagram_business_account === 'object'
          ? page.instagram_business_account.id
          : page.instagram_business_account

        try {
          const igAccount = await getInstagramAccount(igId, pageToken)
          instagramId = igAccount.id
          instagramUsername = igAccount.username
        } catch (igError) {
          console.warn(`No se pudo obtener info de Instagram para página ${pageName}:`, igError.message)
        }
      }

      // Guardar en Supabase
      const result = await guardarCuentaFacebook({
        usuario_id: userId,
        id_marca: marcaId,
        page_id: pageId,
        page_name: pageName,
        instagram_id: instagramId,
        instagram_username: instagramUsername,
        access_token: pageToken, // Usamos el token de la página, no el del usuario
        token_expires_at: calculateTokenExpiry(expiresIn).toISOString()
      })

      if (result.success) {
        savedAccounts.push({
          page_id: pageId,
          page_name: pageName,
          instagram_id: instagramId,
          instagram_username: instagramUsername
        })
      }
    }

    // Generar respuesta exitosa con postMessage
    return generateSuccessResponse(callbackUrl, savedAccounts)

  } catch (error) {
    console.error('Error en /api/facebook/callback:', error)

    // Intentar obtener callback_url del state si es posible
    let callbackUrl = process.env.FRONTEND_URL || 'http://localhost:3002'
    try {
      const { searchParams } = new URL(request.url)
      const state = searchParams.get('state')
      if (state) {
        const stateData = decodeState(state)
        callbackUrl = stateData.callback_url || callbackUrl
      }
    } catch (e) {}

    return generateErrorResponse(callbackUrl, 'server_error', error.message)
  }
}

/**
 * Genera respuesta HTML de éxito con postMessage
 */
function generateSuccessResponse(callbackUrl, accounts) {
  const firstAccount = accounts[0] || {}

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Conexión exitosa</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0a0a0f;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
        }
        .container {
          text-align: center;
          padding: 40px;
        }
        .success-icon {
          font-size: 64px;
          margin-bottom: 20px;
          color: #10b981;
        }
        h1 {
          color: #8b5cf6;
          margin-bottom: 10px;
        }
        p {
          color: #94a3b8;
        }
        .account-name {
          color: #fff;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✓</div>
        <h1>Conexión exitosa</h1>
        <p>Cuenta conectada: <span class="account-name">${firstAccount.page_name || 'Facebook'}</span></p>
        ${firstAccount.instagram_username ? `<p>Instagram: @${firstAccount.instagram_username}</p>` : ''}
        <p>Esta ventana se cerrará automáticamente...</p>
      </div>
      <script>
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_SUCCESS',
            accounts: ${JSON.stringify(accounts)},
            page_name: '${firstAccount.page_name || ''}',
            instagram_id: '${firstAccount.instagram_id || ''}',
            instagram_username: '${firstAccount.instagram_username || ''}'
          }, '${callbackUrl}');
        }
        setTimeout(function() {
          window.close();
        }, 2000);
      </script>
    </body>
    </html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}

/**
 * Genera respuesta HTML de error con postMessage
 */
function generateErrorResponse(callbackUrl, errorCode, errorMessage) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Error de conexión</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0a0a0f;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
        }
        .container {
          text-align: center;
          padding: 40px;
        }
        .error-icon {
          font-size: 64px;
          margin-bottom: 20px;
          color: #ef4444;
        }
        h1 {
          color: #ef4444;
          margin-bottom: 10px;
        }
        p {
          color: #94a3b8;
        }
        .btn-close {
          margin-top: 20px;
          padding: 10px 24px;
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
        }
        .btn-close:hover {
          background: #374151;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error-icon">✕</div>
        <h1>Error de conexión</h1>
        <p>${errorMessage}</p>
        <button class="btn-close" onclick="window.close()">Cerrar ventana</button>
      </div>
      <script>
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_ERROR',
            error: '${errorCode}',
            message: '${errorMessage.replace(/'/g, "\\'")}'
          }, '${callbackUrl}');
        }
      </script>
    </body>
    </html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
