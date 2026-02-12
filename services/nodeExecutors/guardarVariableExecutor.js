/**
 * Ejecutor: Nodo Guardar Variable
 * Almacena un valor en las variables del flujo.
 * Auto-ejecutable.
 */

import { interpolarVariables } from '../flowEngine'

const VALORES_SISTEMA = {
  fecha_actual: () => new Date().toLocaleDateString('es-CL'),
  hora_actual: () => new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
  timestamp: () => new Date().toISOString()
}

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true, variablesActualizadas: object }
 */
export async function ejecutarGuardarVariable(nodo, contexto) {
  const { conversacion } = contexto
  const datos = nodo.datos || {}
  const nombreVariable = datos.variable
  const tipoValor = datos.tipo_valor || 'literal'
  let valor

  switch (tipoValor) {
    case 'sistema':
      valor = VALORES_SISTEMA[datos.valor]?.() || datos.valor
      break

    case 'literal':
      valor = interpolarVariables(datos.valor || '', conversacion.variables)
      break

    default:
      valor = interpolarVariables(datos.valor || '', conversacion.variables)
  }

  console.log(`   💾 Variable guardada: ${nombreVariable} = "${valor}"`)

  return {
    continuar: true,
    variablesActualizadas: {
      ...conversacion.variables,
      [nombreVariable]: valor
    }
  }
}
