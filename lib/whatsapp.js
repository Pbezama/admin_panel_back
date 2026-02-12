/**
 * Servicio de WhatsApp Bidireccional
 * Usa la API de WhatsApp Business (Meta)
 *
 * Funcionalidades:
 * - Enviar notificaciones de tareas (templates)
 * - Enviar mensajes de texto simples
 * - Enviar mensajes con botones interactivos
 * - Enviar menus de opciones
 */

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'notificacion_tarea'
const WHATSAPP_LANGUAGE_CODE = process.env.WHATSAPP_LANGUAGE_CODE || 'es_CL'
const WHATSAPP_PANEL_URL = process.env.WHATSAPP_PANEL_URL || 'https://www.crecetec.com'
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`

/**
 * Envía notificación de nueva tarea al colaborador/asignado
 * Intenta primero con template, si falla envía mensaje de texto
 * @param {string} telefono - Número de teléfono (formato: 56991709265)
 * @param {string} nombreDestinatario - Nombre de quien recibe la tarea
 * @param {Object} datosTarea - Datos de la tarea para el mensaje
 * @param {string} datosTarea.titulo - Título de la tarea
 * @param {string} datosTarea.prioridad - Prioridad (alta, media, baja)
 * @param {string} datosTarea.nombreMarca - Nombre de la marca
 * @param {string} [datosTarea.fechaLimite] - Fecha límite opcional
 * @returns {Promise<object>} Respuesta de la API de WhatsApp
 */
export async function enviarNotificacionTarea(telefono, nombreDestinatario, datosTarea = {}) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado: faltan credenciales')
    return { success: false, error: 'WhatsApp no configurado' }
  }

  if (!telefono) {
    console.warn('No se puede enviar WhatsApp: teléfono vacío')
    return { success: false, error: 'Teléfono no proporcionado' }
  }

  // Extraer primer nombre limpio (sin _admin, sin underscores)
  const primerNombre = nombreDestinatario
    .replace(/_admin$/i, '')
    .replace(/_/g, ' ')
    .split(' ')[0]

  const { titulo, prioridad, nombreMarca, fechaLimite } = datosTarea

  // Intentar template primero (funciona fuera de ventana de 24h)
  const linkVariable = `en donde encontrarás tu nueva tarea asignada: ${WHATSAPP_PANEL_URL}`
  const templateResult = await enviarTemplate(telefono, primerNombre, linkVariable)
  if (templateResult.success) {
    // Template enviado - ahora enviar mensaje de texto con detalles de la tarea
    const detalle = formatearMensajeTarea(primerNombre, titulo, prioridad, nombreMarca, fechaLimite)
    await enviarMensaje(telefono, detalle)
    return templateResult
  }

  // Si template falla, intentar solo mensaje de texto (requiere ventana 24h activa)
  console.log('[WhatsApp] Template falló, intentando mensaje de texto directo...')
  const detalle = formatearMensajeTarea(primerNombre, titulo, prioridad, nombreMarca, fechaLimite)
  return await enviarMensaje(telefono, detalle)
}

/**
 * Formatea el mensaje de texto con detalles de la tarea
 */
function formatearMensajeTarea(nombre, titulo, prioridad, nombreMarca, fechaLimite) {
  const prioridadEmoji = prioridad === 'alta' ? '🔴' : prioridad === 'media' ? '🟡' : '🟢'
  const prioridadTexto = prioridad === 'alta' ? 'Alta' : prioridad === 'media' ? 'Media' : 'Baja'

  let mensaje = `📋 *Nueva tarea asignada*\n\n`
  mensaje += `Hola ${nombre}, se te ha asignado una nueva tarea`
  if (nombreMarca) mensaje += ` en *${nombreMarca}*`
  mensaje += `.\n\n`
  if (titulo) mensaje += `*Tarea:* ${titulo}\n`
  mensaje += `*Prioridad:* ${prioridadEmoji} ${prioridadTexto}\n`
  if (fechaLimite) {
    const fecha = new Date(fechaLimite).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    mensaje += `*Fecha límite:* ${fecha}\n`
  }
  mensaje += `\n👉 Revisa los detalles en: ${WHATSAPP_PANEL_URL}\n`

  return mensaje
}

/**
 * Envía template de WhatsApp con dos variables: nombre y link
 */
async function enviarTemplate(telefono, nombre, link) {
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
          { type: "text", text: nombre },
          { type: "text", text: link }
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
      console.error('Error WhatsApp Template API:', result)
      return { success: false, error: result.error?.message || 'Error enviando template' }
    }

    console.log('WhatsApp template enviado a:', telefono)
    return { success: true, data: result }

  } catch (error) {
    console.error('Error enviando WhatsApp template:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar mensaje de texto simple
 * @param {string} telefono - Numero de telefono (formato: 56991709265)
 * @param {string} texto - Texto del mensaje
 * @returns {Promise<object>} Respuesta de la API
 */
export async function enviarMensaje(telefono, texto) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('WhatsApp no configurado: faltan credenciales')
    return { success: false, error: 'WhatsApp no configurado' }
  }

  if (!telefono || !texto) {
    return { success: false, error: 'Telefono y texto son requeridos' }
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'text',
    text: { body: texto }
  }

  try {
    const response = await fetch(WHATSAPP_API_URL, {
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

    console.log('📤 WhatsApp enviado a:', telefono)
    return { success: true, data: result }

  } catch (error) {
    console.error('Error enviando WhatsApp:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar mensaje con botones interactivos
 * @param {string} telefono - Numero de telefono
 * @param {string} texto - Texto del mensaje
 * @param {Array<{id: string, title: string}>} botones - Botones (max 3)
 * @returns {Promise<object>} Respuesta de la API
 */
export async function enviarMensajeConBotones(telefono, texto, botones) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { success: false, error: 'WhatsApp no configurado' }
  }

  if (!telefono || !texto || !botones || botones.length === 0) {
    return { success: false, error: 'Parametros invalidos' }
  }

  // Limitar a 3 botones (limite de WhatsApp)
  const botonesLimitados = botones.slice(0, 3)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto },
      action: {
        buttons: botonesLimitados.map(b => ({
          type: 'reply',
          reply: {
            id: b.id,
            title: b.title.substring(0, 20) // Limite 20 chars
          }
        }))
      }
    }
  }

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Error WhatsApp API (botones):', result)
      return { success: false, error: result.error?.message || 'Error enviando mensaje' }
    }

    console.log('📤 WhatsApp con botones enviado a:', telefono)
    return { success: true, data: result }

  } catch (error) {
    console.error('Error enviando WhatsApp con botones:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar menu de opciones (lista)
 * @param {string} telefono - Numero de telefono
 * @param {string} texto - Texto principal
 * @param {string} botonTexto - Texto del boton para abrir menu
 * @param {Array<{id: string, title: string, description?: string}>} opciones - Opciones del menu
 * @returns {Promise<object>} Respuesta de la API
 */
export async function enviarMenu(telefono, texto, botonTexto, opciones) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return { success: false, error: 'WhatsApp no configurado' }
  }

  if (!telefono || !texto || !opciones || opciones.length === 0) {
    return { success: false, error: 'Parametros invalidos' }
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: texto },
      action: {
        button: botonTexto.substring(0, 20),
        sections: [{
          title: 'Opciones',
          rows: opciones.map(o => ({
            id: o.id,
            title: o.title.substring(0, 24),
            description: o.description?.substring(0, 72) || ''
          }))
        }]
      }
    }
  }

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Error WhatsApp API (menu):', result)
      return { success: false, error: result.error?.message || 'Error enviando menu' }
    }

    console.log('📤 WhatsApp menu enviado a:', telefono)
    return { success: true, data: result }

  } catch (error) {
    console.error('Error enviando WhatsApp menu:', error)
    return { success: false, error: error.message }
  }
}
