/**
 * Instagram Messaging API
 * Envio de mensajes directos via Graph API v17.0
 * Requiere permiso instagram_manage_messages en la app de Meta
 */

const GRAPH_API_URL = 'https://graph.facebook.com/v17.0'

/**
 * Enviar mensaje de texto por Instagram DM
 * @param {string} igScopedId - ID del usuario de Instagram (scoped al page)
 * @param {string} texto - Texto del mensaje
 * @param {string} pageAccessToken - Token de acceso de la pagina vinculada
 */
export async function enviarMensajeInstagram(igScopedId, texto, pageAccessToken) {
  try {
    const response = await fetch(`${GRAPH_API_URL}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pageAccessToken}`
      },
      body: JSON.stringify({
        recipient: { id: igScopedId },
        message: { text: texto.substring(0, 1000) },
        messaging_type: 'RESPONSE'
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Error al enviar mensaje Instagram')
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('Error enviarMensajeInstagram:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar mensaje con quick replies (botones) por Instagram DM
 * Instagram soporta hasta 13 quick replies
 * @param {string} igScopedId - ID del usuario
 * @param {string} texto - Texto del mensaje
 * @param {Array<{id: string, texto: string}>} botones - Botones como quick replies
 * @param {string} pageAccessToken - Token de acceso
 */
export async function enviarBotonesInstagram(igScopedId, texto, botones, pageAccessToken) {
  try {
    const quickReplies = (botones || []).slice(0, 13).map(b => ({
      content_type: 'text',
      title: (b.texto || b.title || '').substring(0, 20),
      payload: b.id || b.texto || ''
    }))

    const response = await fetch(`${GRAPH_API_URL}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pageAccessToken}`
      },
      body: JSON.stringify({
        recipient: { id: igScopedId },
        message: {
          text: texto.substring(0, 1000),
          quick_replies: quickReplies
        },
        messaging_type: 'RESPONSE'
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Error al enviar botones Instagram')
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('Error enviarBotonesInstagram:', error)
    return { success: false, error: error.message }
  }
}
