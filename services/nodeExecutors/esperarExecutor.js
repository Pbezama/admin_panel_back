/**
 * Ejecutor: Nodo Esperar Respuesta
 * Pausa el flujo y espera que el cliente envie un mensaje.
 * Opcionalmente envia un mensaje antes de esperar.
 * Guarda la respuesta en una variable.
 *
 * Interactivo: el flujo se detiene hasta que el usuario responda.
 */

import { interpolarVariables } from '../flowEngine'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: false, esperarInput: true }
 */
export async function ejecutarEsperar(nodo, contexto) {
  const { adapter, conversacion } = contexto
  const datos = nodo.datos || {}

  // Enviar mensaje de espera si existe
  if (datos.mensaje_espera) {
    const texto = interpolarVariables(datos.mensaje_espera, conversacion.variables)
    await adapter.enviarTexto(texto)
  }

  console.log(`   ⏳ Esperando respuesta del cliente...`)

  return { continuar: false, esperarInput: true }
}

/**
 * Procesar la respuesta del usuario al nodo esperar
 * No valida nada - acepta cualquier mensaje
 * @returns {{ valido: true, valor: string }}
 */
export function procesarRespuestaEsperar(nodo, mensaje) {
  return { valido: true, valor: mensaje.trim() }
}
