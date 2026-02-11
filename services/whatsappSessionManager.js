/**
 * WhatsApp Session Manager
 * Maneja el estado de conversaciones por telefono
 *
 * Estados:
 * - MENU_PRINCIPAL: Esperando seleccion del menu
 * - GESTIONANDO_MARCA: En chat controlador
 * - GESTIONANDO_TAREAS: Gestionando tareas (futuro)
 * - CHAT_LIBRE: Chat libre con IA (futuro)
 * - ESPERANDO_CONFIRMACION: Esperando Si/No
 */

// Almacenamiento en memoria con TTL
const sessions = new Map()
const SESSION_TTL = 30 * 60 * 1000 // 30 minutos

// Estados posibles
export const ESTADOS = {
  MENU_PRINCIPAL: 'MENU_PRINCIPAL',
  GESTIONANDO_MARCA: 'GESTIONANDO_MARCA',
  GESTIONANDO_TAREAS: 'GESTIONANDO_TAREAS',
  CHAT_LIBRE: 'CHAT_LIBRE',
  ESPERANDO_CONFIRMACION: 'ESPERANDO_CONFIRMACION'
}

/**
 * Obtener sesion de un telefono
 * @param {string} telefono
 * @returns {object|null} Sesion o null si no existe/expiro
 */
export function obtenerSesion(telefono) {
  const sesion = sessions.get(telefono)

  if (!sesion) return null

  // Verificar si expiro
  if (Date.now() - sesion.ultimaActividad > SESSION_TTL) {
    sessions.delete(telefono)
    return null
  }

  return sesion
}

/**
 * Crear nueva sesion
 * @param {string} telefono
 * @param {object} usuario - Datos del usuario de la BD
 * @returns {object} Nueva sesion
 */
export function crearSesion(telefono, usuario) {
  const sesion = {
    telefono,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      idMarca: usuario.id_marca,
      nombreMarca: usuario.nombre_marca,
      tipoUsuario: usuario.tipo_usuario
    },
    estado: ESTADOS.MENU_PRINCIPAL,
    historial: [],
    contexto: {},
    ultimaActividad: Date.now(),
    creadoEn: Date.now()
  }

  sessions.set(telefono, sesion)
  console.log(`📱 Nueva sesion WhatsApp para ${usuario.nombre} (${telefono})`)

  return sesion
}

/**
 * Actualizar estado de sesion
 * @param {string} telefono
 * @param {string} nuevoEstado
 * @param {object} contextoAdicional
 */
export function actualizarEstado(telefono, nuevoEstado, contextoAdicional = {}) {
  const sesion = sessions.get(telefono)

  if (!sesion) return null

  sesion.estado = nuevoEstado
  sesion.contexto = { ...sesion.contexto, ...contextoAdicional }
  sesion.ultimaActividad = Date.now()

  console.log(`📱 Sesion ${telefono} -> Estado: ${nuevoEstado}`)

  return sesion
}

/**
 * Agregar mensaje al historial
 * @param {string} telefono
 * @param {string} rol - 'user' o 'assistant'
 * @param {string} contenido
 */
export function agregarAlHistorial(telefono, rol, contenido) {
  const sesion = sessions.get(telefono)

  if (!sesion) return

  sesion.historial.push({
    rol,
    contenido,
    timestamp: Date.now()
  })

  // Limitar historial a ultimos 20 mensajes
  if (sesion.historial.length > 20) {
    sesion.historial = sesion.historial.slice(-20)
  }

  sesion.ultimaActividad = Date.now()
}

/**
 * Obtener historial de sesion
 * @param {string} telefono
 * @returns {Array} Historial de mensajes
 */
export function obtenerHistorial(telefono) {
  const sesion = sessions.get(telefono)
  return sesion?.historial || []
}

/**
 * Guardar contexto de confirmacion pendiente
 * @param {string} telefono
 * @param {object} datosConfirmacion
 */
export function guardarConfirmacionPendiente(telefono, datosConfirmacion) {
  const sesion = sessions.get(telefono)

  if (!sesion) return

  sesion.contexto.confirmacionPendiente = datosConfirmacion
  sesion.estado = ESTADOS.ESPERANDO_CONFIRMACION
  sesion.ultimaActividad = Date.now()
}

/**
 * Obtener confirmacion pendiente
 * @param {string} telefono
 * @returns {object|null}
 */
export function obtenerConfirmacionPendiente(telefono) {
  const sesion = sessions.get(telefono)
  return sesion?.contexto?.confirmacionPendiente || null
}

/**
 * Limpiar confirmacion pendiente
 * @param {string} telefono
 */
export function limpiarConfirmacionPendiente(telefono) {
  const sesion = sessions.get(telefono)

  if (!sesion) return

  delete sesion.contexto.confirmacionPendiente
  sesion.ultimaActividad = Date.now()
}

/**
 * Eliminar sesion
 * @param {string} telefono
 */
export function eliminarSesion(telefono) {
  sessions.delete(telefono)
  console.log(`📱 Sesion eliminada: ${telefono}`)
}

/**
 * Resetear sesion a menu principal
 * @param {string} telefono
 */
export function resetearSesion(telefono) {
  const sesion = sessions.get(telefono)

  if (!sesion) return null

  sesion.estado = ESTADOS.MENU_PRINCIPAL
  sesion.historial = []
  sesion.contexto = {}
  sesion.ultimaActividad = Date.now()

  console.log(`📱 Sesion reseteada: ${telefono}`)

  return sesion
}

/**
 * Limpiar sesiones expiradas (ejecutar periodicamente)
 */
export function limpiarSesionesExpiradas() {
  const ahora = Date.now()
  let eliminadas = 0

  for (const [telefono, sesion] of sessions) {
    if (ahora - sesion.ultimaActividad > SESSION_TTL) {
      sessions.delete(telefono)
      eliminadas++
    }
  }

  if (eliminadas > 0) {
    console.log(`🧹 ${eliminadas} sesiones WhatsApp expiradas eliminadas`)
  }
}

// Limpiar sesiones expiradas cada 5 minutos
setInterval(limpiarSesionesExpiradas, 5 * 60 * 1000)

export default {
  obtenerSesion,
  crearSesion,
  actualizarEstado,
  agregarAlHistorial,
  obtenerHistorial,
  guardarConfirmacionPendiente,
  obtenerConfirmacionPendiente,
  limpiarConfirmacionPendiente,
  eliminarSesion,
  resetearSesion,
  ESTADOS
}
