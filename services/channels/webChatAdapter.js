/**
 * Web Chat Channel Adapter
 * A diferencia de WhatsApp/Instagram, no envia mensajes via API externa.
 * Acumula las respuestas en un array que se devuelve en la respuesta HTTP.
 *
 * Patron request-response: el browser envia un POST, el adapter acumula
 * todas las respuestas del flujo, y el endpoint las devuelve todas juntas.
 */

export class WebChatAdapter {
  constructor(sessionId, respuestasAccumulator) {
    this.sessionId = sessionId
    this.canal = 'web'
    this.respuestas = respuestasAccumulator
  }

  /**
   * Enviar mensaje de texto
   */
  async enviarTexto(texto) {
    if (!texto) return
    this.respuestas.push({ tipo: 'texto', contenido: texto })
  }

  /**
   * Enviar mensaje con botones
   */
  async enviarBotones(texto, botones) {
    if (!botones || botones.length === 0) {
      return this.enviarTexto(texto)
    }
    this.respuestas.push({
      tipo: 'botones',
      contenido: texto,
      botones: botones.map(b => ({
        id: b.id,
        texto: b.texto || b.title || ''
      }))
    })
  }

  /**
   * Enviar lista de opciones
   */
  async enviarLista(texto, botonTexto, opciones) {
    if (!opciones || opciones.length === 0) {
      return this.enviarTexto(texto)
    }
    this.respuestas.push({
      tipo: 'lista',
      contenido: texto,
      botonTexto,
      opciones: opciones.map(o => ({
        id: o.id,
        titulo: o.titulo || o.title || '',
        descripcion: o.descripcion || o.description || ''
      }))
    })
  }
}

/**
 * Crear adaptador de Web Chat
 * Retorna { adapter, respuestas } donde respuestas es el array acumulador
 */
export function crearWebChatAdapter(sessionId) {
  const respuestas = []
  const adapter = new WebChatAdapter(sessionId, respuestas)
  return { adapter, respuestas }
}
