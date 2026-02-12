/**
 * Ejecutor: Nodo Inicio
 * Punto de entrada del flujo. No hace nada por si mismo,
 * solo marca el comienzo y avanza al siguiente nodo.
 */

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true }
 */
export async function ejecutarInicio(nodo, contexto) {
  console.log(`   🟢 Nodo inicio ejecutado`)
  return { continuar: true }
}
