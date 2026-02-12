/**
 * Instagram DM Channel Adapter
 * Adapta las acciones del flowEngine al formato de Instagram Messaging API.
 * Sigue el mismo patron que WhatsAppAdapter.
 */

import { enviarMensajeInstagram, enviarBotonesInstagram } from '@/lib/instagram'

export class InstagramAdapter {
  constructor(igScopedId, pageAccessToken) {
    this.igScopedId = igScopedId
    this.pageAccessToken = pageAccessToken
    this.canal = 'instagram'
  }

  /**
   * Enviar mensaje de texto simple
   */
  async enviarTexto(texto) {
    if (!texto) return
    await enviarMensajeInstagram(this.igScopedId, texto, this.pageAccessToken)
  }

  /**
   * Enviar mensaje con botones (quick replies en Instagram)
   * Instagram soporta hasta 13 quick replies (vs 3 de WhatsApp)
   */
  async enviarBotones(texto, botones) {
    if (!botones || botones.length === 0) {
      return this.enviarTexto(texto)
    }
    await enviarBotonesInstagram(this.igScopedId, texto, botones, this.pageAccessToken)
  }

  /**
   * Enviar lista de opciones
   * Instagram no soporta listas nativas, se envian como texto enumerado
   */
  async enviarLista(texto, botonTexto, opciones) {
    if (!opciones || opciones.length === 0) {
      return this.enviarTexto(texto)
    }

    const listaTexto = opciones
      .map((o, i) => `${i + 1}. ${o.titulo || o.title || ''}`)
      .join('\n')

    await enviarMensajeInstagram(
      this.igScopedId,
      `${texto}\n\n${listaTexto}\n\nResponde con el numero de tu opcion.`,
      this.pageAccessToken
    )
  }
}

/**
 * Crear adaptador de Instagram para un usuario
 */
export function crearInstagramAdapter(igScopedId, pageAccessToken) {
  return new InstagramAdapter(igScopedId, pageAccessToken)
}
