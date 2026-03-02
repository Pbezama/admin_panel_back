/**
 * Ejecutor: Nodo Transferir a Humano
 * Marca la conversacion como transferida y notifica al ejecutivo.
 * Interactivo: la conversacion queda en estado 'transferida'.
 */

import { interpolarVariables } from '../flowEngine'
import { crearNotificacionTransferencia } from '@/lib/supabase'

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

  console.log(`   🧑‍💼 Conversacion transferida a humano (notificar: ${notificar && !!mensajeUsuario})`)

  // Crear notificacion para los ejecutivos de la marca
  const idMarca = conversacion.variables?.id_marca_str || String(conversacion.id_marca || '')
  const nombreCliente = conversacion.variables?.nombre_cliente
    || conversacion.variables?.nombre
    || conversacion.identificador_usuario
    || ''

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
