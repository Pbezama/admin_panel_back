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

import { obtenerConversacionActiva, buscarFlujoPorTrigger, guardarMensajeFlujo } from '@/lib/supabase'
import { iniciarFlujo, continuarFlujo } from './flowEngine'
import { crearWhatsAppAdapter } from './channels/whatsappAdapter'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

    // 1.5 Verificar si hay conversacion TRANSFERIDA (atendida por humano)
    // Si la hay, guardar el mensaje para que el ejecutivo lo vea, pero NO activar IA
    try {
      const { data: convTransferida } = await supabase
        .from('conversaciones_flujo')
        .select('id')
        .eq('canal', canal)
        .eq('identificador_usuario', identificador)
        .eq('estado', 'transferida')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (convTransferida) {
        console.log(`   🧑‍💼 Conversacion transferida detectada (conv: ${convTransferida.id}) - guardando mensaje sin IA`)

        await guardarMensajeFlujo({
          conversacion_id: convTransferida.id,
          direccion: 'entrante',
          contenido: mensaje,
          tipo_nodo: 'respuesta_usuario',
          nodo_id: 'transferida'
        })

        return { handled: true }
      }
    } catch (err) {
      console.error('[FlowRouter] Error verificando conversacion transferida:', err.message)
    }

    // 2. Buscar flujo que matchee el trigger
    console.log(`[FlowRouter] Buscando flujo - idMarca: ${idMarca}, canal: ${canal}, mensaje: "${mensaje}"`)
    const flujoResult = await buscarFlujoPorTrigger(idMarca, canal, mensaje)
    console.log(`[FlowRouter] Resultado busqueda:`, JSON.stringify({ success: flujoResult.success, found: !!flujoResult.data, flujoId: flujoResult.data?.id, flujoNombre: flujoResult.data?.nombre }))

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
