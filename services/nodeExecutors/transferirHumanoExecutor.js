/**
 * Ejecutor: Nodo Transferir a Humano
 * Marca la conversacion como transferida y notifica al ejecutivo.
 * Interactivo: la conversacion queda en estado 'transferida'.
 */

import { interpolarVariables } from '../flowEngine'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: false, finalizarFlujo: true, accion: 'transferir' }
 */
export async function ejecutarTransferirHumano(nodo, contexto) {
  const { adapter, conversacion } = contexto
  const datos = nodo.datos || {}

  // Enviar mensaje al usuario
  if (datos.mensaje_usuario) {
    const texto = interpolarVariables(datos.mensaje_usuario, conversacion.variables)
    await adapter.enviarTexto(texto)
  } else {
    await adapter.enviarTexto('Te estoy conectando con un ejecutivo. Por favor espera un momento...')
  }

  console.log(`   🧑‍💼 Conversacion transferida a humano`)

  return {
    continuar: false,
    finalizarFlujo: true,
    accion: 'transferir'
  }
}
