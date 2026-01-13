/**
 * lib/limites.js
 * Lógica centralizada de verificación de límites por plan
 */

// Definición de límites por plan
export const LIMITES = {
  gratuito: {
    comentarios: 5,
    datos: 5,           // reglas + ofertas + respuestas combinados
    tareas: 5,
    colaboradores: 0,   // solo el admin
    cuentas_facebook: 1,
    mensajes_chat: 20,
    informes: false,
    historial_tareas: false,
    archivos_adjuntos: false
  },
  premium: {
    comentarios: Infinity,
    datos: Infinity,
    tareas: Infinity,
    colaboradores: Infinity,
    cuentas_facebook: 10,
    mensajes_chat: Infinity,
    informes: true,
    historial_tareas: true,
    archivos_adjuntos: true
  }
}

// Nombres amigables para mostrar en UI
export const NOMBRES_LIMITES = {
  comentarios: 'comentarios procesados',
  datos: 'reglas, ofertas y respuestas',
  tareas: 'tareas',
  colaboradores: 'colaboradores',
  cuentas_facebook: 'cuentas de Facebook',
  mensajes_chat: 'mensajes por sesión'
}

/**
 * Verificar si puede realizar una acción según el plan
 * @param {string} plan - Plan del usuario ('gratuito' o 'premium')
 * @param {string} tipo - Tipo de recurso ('comentarios', 'datos', 'tareas', etc)
 * @param {number} cantidadActual - Cantidad actual usada
 * @returns {boolean}
 */
export function puedeRealizarAccion(plan, tipo, cantidadActual) {
  const limites = LIMITES[plan] || LIMITES.gratuito
  const limite = limites[tipo]

  // Si es boolean (informes, historial, etc), retornar directamente
  if (typeof limite === 'boolean') {
    return limite
  }

  // Si es Infinity, siempre puede
  if (limite === Infinity) {
    return true
  }

  return cantidadActual < limite
}

/**
 * Obtener límites restantes para un usuario
 * @param {string} plan - Plan del usuario
 * @param {object} uso - Objeto con uso actual { comentarios_usados, datos_usados, tareas_usadas }
 * @returns {object} Límites restantes por tipo
 */
export function obtenerLimitesRestantes(plan, uso = {}) {
  const limites = LIMITES[plan] || LIMITES.gratuito

  return {
    comentarios: {
      usado: uso.comentarios_usados || 0,
      limite: limites.comentarios,
      restante: limites.comentarios === Infinity
        ? Infinity
        : Math.max(0, limites.comentarios - (uso.comentarios_usados || 0))
    },
    datos: {
      usado: uso.datos_usados || 0,
      limite: limites.datos,
      restante: limites.datos === Infinity
        ? Infinity
        : Math.max(0, limites.datos - (uso.datos_usados || 0))
    },
    tareas: {
      usado: uso.tareas_usadas || 0,
      limite: limites.tareas,
      restante: limites.tareas === Infinity
        ? Infinity
        : Math.max(0, limites.tareas - (uso.tareas_usadas || 0))
    },
    colaboradores: {
      limite: limites.colaboradores,
      habilitado: limites.colaboradores > 0
    },
    cuentas_facebook: {
      limite: limites.cuentas_facebook
    },
    mensajes_chat: {
      limite: limites.mensajes_chat
    },
    informes: {
      habilitado: limites.informes
    },
    historial_tareas: {
      habilitado: limites.historial_tareas
    },
    archivos_adjuntos: {
      habilitado: limites.archivos_adjuntos
    }
  }
}

/**
 * Verificar si el plan tiene acceso a una funcionalidad boolean
 * @param {string} plan - Plan del usuario
 * @param {string} funcionalidad - Nombre de la funcionalidad
 * @returns {boolean}
 */
export function tieneAcceso(plan, funcionalidad) {
  const limites = LIMITES[plan] || LIMITES.gratuito
  return !!limites[funcionalidad]
}

/**
 * Obtener mensaje de error cuando se alcanza el límite
 * @param {string} tipo - Tipo de recurso
 * @param {number} limite - Límite actual
 * @returns {string}
 */
export function getMensajeLimite(tipo, limite) {
  const nombre = NOMBRES_LIMITES[tipo] || tipo
  return `Has alcanzado el límite de ${limite} ${nombre} en el plan gratuito. Mejora tu plan para continuar.`
}

/**
 * Verificar si está cerca del límite (80% o más)
 * @param {number} usado - Cantidad usada
 * @param {number} limite - Límite total
 * @returns {boolean}
 */
export function cercaDelLimite(usado, limite) {
  if (limite === Infinity) return false
  return usado >= limite * 0.8
}

/**
 * Obtener porcentaje de uso
 * @param {number} usado - Cantidad usada
 * @param {number} limite - Límite total
 * @returns {number} Porcentaje de 0 a 100
 */
export function getPorcentajeUso(usado, limite) {
  if (limite === Infinity) return 0
  if (limite === 0) return 100
  return Math.min(100, Math.round((usado / limite) * 100))
}
