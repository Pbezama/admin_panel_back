/**
 * Servicio de WhatsApp para notificaciones
 * Usa la API de WhatsApp Business (Meta)
 */

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || '2025_12_19_hola_mundo'
const WHATSAPP_LANGUAGE_CODE = process.env.WHATSAPP_LANGUAGE_CODE || 'es_CL'
const WHATSAPP_LINK = process.env.WHATSAPP_LINK || 'en donde encontrarás tu nueva tarea asignada: https://controladorbbdd.vercel.app/chat'

/**
 * Envía notificación de nueva tarea al colaborador
 * @param {string} telefono - Número de teléfono (formato: 56991709265)
 * @param {string} nombreColaborador - Nombre del colaborador para el template
 * @returns {Promise<object>} Respuesta de la API de WhatsApp
 */
export async function enviarNotificacionTarea(telefono, nombreColaborador) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado: faltan credenciales')
    return { success: false, error: 'WhatsApp no configurado' }
  }

  if (!telefono) {
    console.warn('No se puede enviar WhatsApp: teléfono vacío')
    return { success: false, error: 'Teléfono no proporcionado' }
  }

  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`

  const payload = {
    messaging_product: "whatsapp",
    to: telefono,
    type: "template",
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      language: { code: WHATSAPP_LANGUAGE_CODE },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: nombreColaborador },
          { type: "text", text: WHATSAPP_LINK }
        ]
      }]
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Error WhatsApp API:', result)
      return { success: false, error: result.error?.message || 'Error enviando mensaje' }
    }

    console.log('WhatsApp enviado exitosamente a:', telefono)
    return { success: true, data: result }

  } catch (error) {
    console.error('Error enviando WhatsApp:', error)
    return { success: false, error: error.message }
  }
}
