/**
 * WhatsApp Channel Adapter
 * Adapta las acciones del flowEngine al formato de la WhatsApp Business API.
 * Usa las funciones existentes de lib/whatsapp.js
 */

import { enviarMensaje, enviarMensajeConBotones, enviarMenu } from '@/lib/whatsapp'

export class WhatsAppAdapter {
  constructor(telefono) {
    this.telefono = telefono
    this.canal = 'whatsapp'
  }

  /**
   * Enviar mensaje de texto simple
   */
  async enviarTexto(texto) {
    if (!texto) return
    // WhatsApp tiene limite de 4096 caracteres
    const textoLimitado = texto.substring(0, 4096)
    await enviarMensaje(this.telefono, textoLimitado)
  }

  /**
   * Enviar mensaje con botones interactivos (max 3 en WhatsApp)
   */
  async enviarBotones(texto, botones) {
    if (!botones || botones.length === 0) {
      return this.enviarTexto(texto)
    }

    const botonesFormateados = botones.slice(0, 3).map(b => ({
      id: b.id,
      title: (b.texto || b.title || '').substring(0, 20)
    }))

    await enviarMensajeConBotones(this.telefono, texto, botonesFormateados)
  }

  /**
   * Enviar menu de opciones (lista)
   */
  async enviarLista(texto, botonTexto, opciones) {
    if (!opciones || opciones.length === 0) {
      return this.enviarTexto(texto)
    }

    const opcionesFormateadas = opciones.slice(0, 10).map(o => ({
      id: o.id,
      title: (o.titulo || o.title || '').substring(0, 24),
      description: (o.descripcion || o.description || '').substring(0, 72)
    }))

    await enviarMenu(this.telefono, texto, botonTexto, opcionesFormateadas)
  }
}

/**
 * Crear adaptador de WhatsApp para un telefono
 */
export function crearWhatsAppAdapter(telefono) {
  return new WhatsAppAdapter(telefono)
}
