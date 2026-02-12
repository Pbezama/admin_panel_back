/**
 * Ejecutor: Nodo Mensaje
 * Envia un mensaje al usuario a traves del adaptador de canal.
 * Soporta: texto simple, botones, lista, imagen.
 */

import { interpolarVariables } from '../flowEngine'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: bool, esperarInput: bool }
 */
export async function ejecutarMensaje(nodo, contexto) {
  const { adapter, conversacion } = contexto
  const datos = nodo.datos || {}
  const texto = interpolarVariables(datos.texto || '', conversacion.variables)
  const tipoMensaje = datos.tipo_mensaje || 'texto'

  switch (tipoMensaje) {
    case 'texto':
      await adapter.enviarTexto(texto)
      return { continuar: true }

    case 'botones': {
      const botones = (datos.botones || []).map(b => ({
        id: b.id,
        texto: interpolarVariables(b.texto || '', conversacion.variables)
      }))
      await adapter.enviarBotones(texto, botones)
      // Esperar seleccion del usuario
      return { continuar: false, esperarInput: true }
    }

    case 'lista': {
      const opciones = (datos.opciones || []).map(o => ({
        id: o.id,
        titulo: interpolarVariables(o.titulo || '', conversacion.variables),
        descripcion: o.descripcion ? interpolarVariables(o.descripcion, conversacion.variables) : ''
      }))
      const botonTexto = datos.boton_texto || 'Ver opciones'
      await adapter.enviarLista(texto, botonTexto, opciones)
      return { continuar: false, esperarInput: true }
    }

    case 'imagen':
      await adapter.enviarTexto(texto)
      return { continuar: true }

    default:
      await adapter.enviarTexto(texto)
      return { continuar: true }
  }
}
