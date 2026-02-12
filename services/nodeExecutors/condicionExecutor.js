/**
 * Ejecutor: Nodo Condicion
 * Evalua una condicion y determina por cual edge continuar.
 * Este nodo es auto-ejecutable (no espera input).
 */

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true, edgeSeleccionado: string|null }
 */
export async function ejecutarCondicion(nodo, contexto) {
  const { conversacion } = contexto
  const datos = nodo.datos || {}
  const variable = datos.variable
  const operador = datos.operador || 'no_vacio'
  const valorComparar = datos.valor
  const valorVariable = conversacion.variables[variable]

  const resultado = evaluarCondicion(operador, valorVariable, valorComparar)

  console.log(`   🔀 Condicion: ${variable} ${operador} ${valorComparar || ''} → ${resultado}`)

  // El edge se selecciona en el flowEngine basandose en el resultado
  return {
    continuar: true,
    resultadoCondicion: resultado
  }
}

/**
 * Evaluar una condicion
 * @returns {boolean}
 */
function evaluarCondicion(operador, valorVariable, valorComparar) {
  const val = typeof valorVariable === 'string' ? valorVariable.toLowerCase().trim() : valorVariable
  const comp = typeof valorComparar === 'string' ? valorComparar.toLowerCase().trim() : valorComparar

  switch (operador) {
    case 'igual':
      return val == comp

    case 'no_igual':
      return val != comp

    case 'contiene':
      return typeof val === 'string' && typeof comp === 'string' && val.includes(comp)

    case 'no_vacio':
      return val !== undefined && val !== null && val !== ''

    case 'vacio':
      return val === undefined || val === null || val === ''

    case 'mayor_que':
      return Number(val) > Number(comp)

    case 'menor_que':
      return Number(val) < Number(comp)

    case 'regex':
      try {
        return new RegExp(comp, 'i').test(String(val))
      } catch {
        return false
      }

    default:
      return false
  }
}
