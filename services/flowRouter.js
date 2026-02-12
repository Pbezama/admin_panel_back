/**
 * Flow Router - Enrutador de mensajes a flujos
 *
 * Intercepta mensajes entrantes y decide:
 * 1. Si hay una conversacion de flujo activa -> continuarla
 * 2. Si hay un flujo que matchea el trigger -> iniciarlo
 * 3. Si no -> devolver { handled: false } para que el sistema actual lo maneje
 *
 * Soporta multi-canal: whatsapp, instagram, web
 */

import { obtenerConversacionActiva, buscarFlujoPorTrigger } from '@/lib/supabase'
import { iniciarFlujo, continuarFlujo } from './flowEngine'
import { crearWhatsAppAdapter } from './channels/whatsappAdapter'

/**
 * Crear adaptador segun el canal
 * @param {string} canal - whatsapp, instagram, web
 * @param {string} identificador - telefono, ig_scoped_id, session_id
 * @param {object} extra - Datos adicionales (ej: pageAccessToken para Instagram)
 */
function crearAdapter(canal, identificador, extra = {}) {
  switch (canal) {
    case 'whatsapp':
      return crearWhatsAppAdapter(identificador)

    case 'instagram': {
      try {
        const { crearInstagramAdapter } = require('./channels/instagramAdapter')
        return crearInstagramAdapter(identificador, extra.pageAccessToken || '')
      } catch {
        console.error('instagramAdapter no disponible')
        return null
      }
    }

    case 'web':
      // Web usa adapter externo pasado como parametro
      return null

    default:
      return crearWhatsAppAdapter(identificador)
  }
}

/**
 * Procesar un mensaje entrante con el sistema de flujos
 * @param {object} params
 * @param {string} params.canal - Canal de origen (whatsapp, instagram, web)
 * @param {string} params.identificador - ID del usuario en el canal
 * @param {string} params.mensaje - Texto del mensaje
 * @param {number|null} params.idMarca - ID de la marca
 * @param {object} [params.adapter] - Adapter externo (para web chat)
 * @param {object} [params.extra] - Datos extra (pageAccessToken para Instagram)
 * @returns {object} { handled: boolean }
 */
export async function procesarMensajeConFlujo(params) {
  const { canal, identificador, mensaje, idMarca, adapter: externalAdapter, extra } = params

  // Sin marca no podemos buscar flujos
  if (!idMarca) {
    return { handled: false }
  }

  try {
    // 1. Verificar si hay conversacion activa
    const convResult = await obtenerConversacionActiva(canal, identificador)

    if (convResult.success && convResult.data) {
      const conversacion = convResult.data
      const adapter = externalAdapter || crearAdapter(canal, identificador, extra)

      if (!adapter) {
        console.error(`No se pudo crear adapter para canal: ${canal}`)
        return { handled: false }
      }

      console.log(`   🔄 Continuando flujo activo (conv: ${conversacion.id}, canal: ${canal})`)

      return await continuarFlujo(conversacion, { adapter, mensaje })
    }

    // 2. Buscar flujo que matchee el trigger
    const flujoResult = await buscarFlujoPorTrigger(idMarca, canal, mensaje)

    if (flujoResult.success && flujoResult.data) {
      const flujo = flujoResult.data
      const adapter = externalAdapter || crearAdapter(canal, identificador, extra)

      if (!adapter) {
        console.error(`No se pudo crear adapter para canal: ${canal}`)
        return { handled: false }
      }

      return await iniciarFlujo(flujo, {
        canal,
        identificador,
        idMarca,
        adapter,
        mensaje
      })
    }

    // 3. No hay flujo -> sistema actual
    return { handled: false }

  } catch (error) {
    console.error('Error en flowRouter:', error)
    return { handled: false }
  }
}
