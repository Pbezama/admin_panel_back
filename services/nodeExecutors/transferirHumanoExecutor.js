/**
 * Ejecutor: Nodo Transferir a Humano
 * Marca la conversacion como transferida, notifica al ejecutivo via WhatsApp
 * y crea notificacion en el panel.
 * Interactivo: la conversacion queda en estado 'transferida'.
 */

import { interpolarVariables } from '../flowEngine'
import { crearNotificacionTransferencia, obtenerUsuarioPorId } from '@/lib/supabase'
import { enviarMensaje } from '@/lib/whatsapp'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: false, finalizarFlujo: true, accion: 'transferir' }
 */
export async function ejecutarTransferirHumano(nodo, contexto) {
  const { adapter, conversacion } = contexto
  const datos = nodo.datos || {}

  // Solo enviar mensaje al usuario si notificar_cliente esta activado
  const notificar = datos.notificar_cliente !== false
  const mensajeUsuario = (datos.mensaje_usuario || '').trim()

  if (notificar && mensajeUsuario) {
    const texto = interpolarVariables(mensajeUsuario, conversacion.variables)
    await adapter.enviarTexto(texto)
  }

  const idMarca = conversacion.variables?.id_marca_str || String(conversacion.id_marca || '')
  const nombreCliente = conversacion.variables?.nombre_cliente
    || conversacion.variables?.nombre
    || conversacion.identificador_usuario
    || 'Cliente'
  const canalLabel = conversacion.canal === 'web' ? 'Chat Web'
    : conversacion.canal === 'whatsapp' ? 'WhatsApp'
    : conversacion.canal === 'instagram' ? 'Instagram'
    : conversacion.canal

  console.log(`   🧑‍💼 Conversacion transferida a humano (notificar cliente: ${notificar && !!mensajeUsuario})`)

  // Notificar al ejecutivo seleccionado via WhatsApp
  const ejecutivoId = datos.ejecutivo_id
  if (ejecutivoId) {
    try {
      const ejResult = await obtenerUsuarioPorId(ejecutivoId)
      if (ejResult.success && ejResult.data?.telefono) {
        const ejecutivo = ejResult.data
        const mensajeEjecutivo = datos.mensaje_ejecutivo
          ? interpolarVariables(datos.mensaje_ejecutivo, conversacion.variables)
          : ''

        let textoWsp = `🔔 *Nuevo cliente transferido*\n\n`
        textoWsp += `📱 Canal: ${canalLabel}\n`
        textoWsp += `👤 Cliente: ${nombreCliente}\n`
        textoWsp += `🆔 Conversacion: #${conversacion.id}\n`
        if (mensajeEjecutivo) {
          textoWsp += `\n💬 Contexto:\n${mensajeEjecutivo}\n`
        }
        textoWsp += `\n👉 Revisa el Dashboard Live para responder.`

        const wspResult = await enviarMensaje(ejecutivo.telefono, textoWsp)
        console.log(`   📲 WhatsApp enviado a ${ejecutivo.nombre} (${ejecutivo.telefono}): ${wspResult.success ? 'OK' : wspResult.error}`)
      } else {
        console.warn(`   ⚠️ Ejecutivo ${ejecutivoId} sin telefono, solo notificacion en panel`)
      }
    } catch (err) {
      console.error('   ⚠️ Error enviando WhatsApp al ejecutivo:', err.message)
    }
  }

  // Crear notificacion en panel para todos los ejecutivos de la marca
  try {
    await crearNotificacionTransferencia({
      idMarca,
      canal: conversacion.canal,
      identificadorUsuario: conversacion.identificador_usuario,
      nombreCliente,
      conversacionId: conversacion.id
    })
  } catch (err) {
    console.error('   ⚠️ Error creando notificacion de transferencia:', err.message)
  }

  return {
    continuar: false,
    finalizarFlujo: true,
    accion: 'transferir'
  }
}
