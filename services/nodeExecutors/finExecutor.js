/**
 * Ejecutor: Nodo Fin
 * Termina la conversacion del flujo.
 * Puede enviar mensaje de despedida y determinar accion post-fin.
 */

import { interpolarVariables } from '../flowEngine'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: false, finalizarFlujo: true, accion: string }
 */
export async function ejecutarFin(nodo, contexto) {
  const { adapter, conversacion } = contexto
  const datos = nodo.datos || {}

  // Enviar mensaje de despedida si existe
  if (datos.mensaje_despedida) {
    const texto = interpolarVariables(datos.mensaje_despedida, conversacion.variables)
    await adapter.enviarTexto(texto)
  }

  const accion = datos.accion || 'cerrar'

  console.log(`   🏁 Flujo finalizado (accion: ${accion})`)

  return {
    continuar: false,
    finalizarFlujo: true,
    accion
  }
}
