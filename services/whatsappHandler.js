/**
 * WhatsApp Handler Principal
 * Procesa mensajes entrantes y coordina respuestas
 */

import {
  obtenerUsuarioPorTelefono,
  obtenerDatosMarca,
  obtenerColaboradores,
  obtenerAprobacionPendiente,
  aprobarRegla,
  rechazarRegla,
  limpiarAprobacionPendiente,
  actualizarTarea,
  registrarCambioTarea
} from '@/lib/supabase'
import { enviarMensaje, enviarMensajeConBotones, enviarMenu } from '@/lib/whatsapp'
import {
  obtenerSesion,
  crearSesion,
  actualizarEstado,
  agregarAlHistorial,
  obtenerHistorial,
  guardarConfirmacionPendiente,
  obtenerConfirmacionPendiente,
  limpiarConfirmacionPendiente,
  resetearSesion,
  ESTADOS
} from './whatsappSessionManager'
import { procesarMensajeControlador } from './whatsappControlador'

// Opciones del menu principal
const MENU_OPCIONES = [
  { id: 'opcion_marca', title: 'Gestionar marca', description: 'Consultar y modificar datos de tu marca' },
  { id: 'opcion_tareas', title: 'Tareas', description: 'Crear y consultar tareas (proximamente)' },
  { id: 'opcion_chat', title: 'Chat libre', description: 'Conversar con IA (proximamente)' }
]

/**
 * Procesar mensaje entrante de WhatsApp
 * @param {string} telefono - Numero del remitente
 * @param {string} mensaje - Texto del mensaje
 */
export async function procesarMensajeWhatsApp(telefono, mensaje) {
  try {
    console.log(`\n📱 === Procesando mensaje WhatsApp ===`)
    console.log(`   De: ${telefono}`)
    console.log(`   Mensaje: "${mensaje}"`)

    // 0. Verificar si hay una aprobación de regla pendiente
    const aprobacionPendiente = await obtenerAprobacionPendiente(telefono)
    if (aprobacionPendiente) {
      const resultado = await procesarRespuestaAprobacion(telefono, mensaje, aprobacionPendiente)
      if (resultado.procesado) {
        return // Respuesta procesada, no continuar
      }
    }

    // 1. Obtener o crear sesion
    let sesion = obtenerSesion(telefono)

    if (!sesion) {
      // Buscar usuario por telefono
      const resultadoUsuario = await obtenerUsuarioPorTelefono(telefono)

      if (!resultadoUsuario.success) {
        // Usuario no registrado
        console.log(`   ❌ Usuario no encontrado: ${telefono}`)
        await enviarMensaje(
          telefono,
          'Hola! No encontramos tu numero registrado en nuestro sistema. ' +
          'Por favor, registrate en crecetec.cl o contacta a soporte.'
        )
        return
      }

      // Crear nueva sesion
      sesion = crearSesion(telefono, resultadoUsuario.data)
      console.log(`   ✅ Sesion creada para: ${sesion.usuario.nombre}`)

      // Mostrar menu de bienvenida
      await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, true)
      return
    }

    // 2. Procesar segun estado de la sesion
    console.log(`   Estado actual: ${sesion.estado}`)

    switch (sesion.estado) {
      case ESTADOS.MENU_PRINCIPAL:
        await procesarSeleccionMenu(telefono, mensaje, sesion)
        break

      case ESTADOS.GESTIONANDO_MARCA:
        await procesarMensajeControladorWrapper(telefono, mensaje, sesion)
        break

      case ESTADOS.ESPERANDO_CONFIRMACION:
        await procesarConfirmacion(telefono, mensaje, sesion)
        break

      case ESTADOS.GESTIONANDO_TAREAS:
        await enviarMensaje(telefono, 'La gestion de tareas estara disponible proximamente.')
        await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
        actualizarEstado(telefono, ESTADOS.MENU_PRINCIPAL)
        break

      case ESTADOS.CHAT_LIBRE:
        await enviarMensaje(telefono, 'El chat libre estara disponible proximamente.')
        await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
        actualizarEstado(telefono, ESTADOS.MENU_PRINCIPAL)
        break

      default:
        // Estado desconocido, volver al menu
        await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
        actualizarEstado(telefono, ESTADOS.MENU_PRINCIPAL)
    }

  } catch (error) {
    console.error('Error procesando mensaje WhatsApp:', error)
    await enviarMensaje(
      telefono,
      'Lo siento, ocurrio un error procesando tu mensaje. Por favor, intenta de nuevo.'
    )
  }
}

/**
 * Mostrar menu principal
 */
async function mostrarMenuPrincipal(telefono, nombreUsuario, esBienvenida = false) {
  const saludo = esBienvenida
    ? `Hola ${nombreUsuario}! Bienvenido a Crecetec.`
    : `${nombreUsuario}, que deseas hacer?`

  await enviarMenu(
    telefono,
    `${saludo}\n\nSelecciona una opcion del menu:`,
    'Ver opciones',
    MENU_OPCIONES
  )
}

/**
 * Procesar seleccion del menu
 */
async function procesarSeleccionMenu(telefono, mensaje, sesion) {
  const mensajeLower = mensaje.toLowerCase().trim()

  // Detectar opcion seleccionada
  if (mensajeLower === 'opcion_marca' || mensajeLower.includes('marca') || mensajeLower === '1') {
    actualizarEstado(telefono, ESTADOS.GESTIONANDO_MARCA)
    agregarAlHistorial(telefono, 'user', 'Quiero gestionar datos de mi marca')

    await enviarMensaje(
      telefono,
      `Perfecto! Ahora puedes gestionar los datos de tu marca.\n\n` +
      `Puedes preguntarme cosas como:\n` +
      `- "Muestra mis datos"\n` +
      `- "Cual es mi horario de atencion?"\n` +
      `- "Actualiza el telefono a 912345678"\n` +
      `- "Agrega el producto X"\n\n` +
      `Escribe "menu" para volver al menu principal.`
    )
    return
  }

  if (mensajeLower === 'opcion_tareas' || mensajeLower.includes('tarea') || mensajeLower === '2') {
    await enviarMensaje(
      telefono,
      'La gestion de tareas estara disponible proximamente. Te notificaremos cuando este lista!'
    )
    await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
    return
  }

  if (mensajeLower === 'opcion_chat' || mensajeLower.includes('chat') || mensajeLower === '3') {
    await enviarMensaje(
      telefono,
      'El chat libre con IA estara disponible proximamente. Te notificaremos cuando este listo!'
    )
    await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
    return
  }

  // No entendio la seleccion
  await enviarMensaje(
    telefono,
    'No entendi tu seleccion. Por favor, selecciona una opcion del menu.'
  )
  await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
}

/**
 * Wrapper para procesar mensajes del controlador
 */
async function procesarMensajeControladorWrapper(telefono, mensaje, sesion) {
  const mensajeLower = mensaje.toLowerCase().trim()

  // Comandos especiales
  if (mensajeLower === 'menu' || mensajeLower === 'volver' || mensajeLower === 'salir') {
    actualizarEstado(telefono, ESTADOS.MENU_PRINCIPAL)
    await mostrarMenuPrincipal(telefono, sesion.usuario.nombre, false)
    return
  }

  // Agregar mensaje al historial
  agregarAlHistorial(telefono, 'user', mensaje)

  // Obtener datos necesarios para el controlador
  const [datosResult, colaboradoresResult] = await Promise.all([
    obtenerDatosMarca(sesion.usuario.idMarca),
    obtenerColaboradores(sesion.usuario.idMarca)
  ])

  const contexto = {
    idMarca: sesion.usuario.idMarca,
    nombreUsuario: sesion.usuario.nombre,
    nombreMarca: sesion.usuario.nombreMarca,
    datosMarca: datosResult.success ? datosResult.data : [],
    colaboradores: colaboradoresResult.success ? colaboradoresResult.data : [],
    historial: obtenerHistorial(telefono).map(h => ({
      rol: h.rol,
      contenido: h.contenido,
      tipo: 'texto'
    }))
  }

  // Procesar con el controlador
  const respuesta = await procesarMensajeControlador(mensaje, contexto)

  // Agregar respuesta al historial
  agregarAlHistorial(telefono, 'assistant', respuesta.texto || respuesta.contenido)

  // Manejar respuesta segun tipo
  await manejarRespuestaControlador(telefono, respuesta, sesion)
}

/**
 * Manejar respuesta del controlador
 */
async function manejarRespuestaControlador(telefono, respuesta, sesion) {
  switch (respuesta.tipo) {
    case 'texto':
      await enviarMensaje(telefono, respuesta.contenido)
      break

    case 'confirmacion':
      // Guardar confirmacion pendiente y mostrar botones
      guardarConfirmacionPendiente(telefono, respuesta.datos)
      await enviarMensajeConBotones(
        telefono,
        respuesta.contenido,
        [
          { id: 'confirmar_si', title: 'Si, confirmar' },
          { id: 'confirmar_no', title: 'No, cancelar' }
        ]
      )
      break

    case 'datos':
      // Formatear datos como texto
      let textoFormateo = respuesta.contenido + '\n\n'
      if (respuesta.datos?.columnas && respuesta.datos?.filas) {
        respuesta.datos.filas.slice(0, 10).forEach((fila, i) => {
          textoFormateo += `${i + 1}. `
          respuesta.datos.columnas.forEach((col, j) => {
            textoFormateo += `${col}: ${fila[j] || '-'} | `
          })
          textoFormateo += '\n'
        })
        if (respuesta.datos.filas.length > 10) {
          textoFormateo += `\n... y ${respuesta.datos.filas.length - 10} mas`
        }
      }
      await enviarMensaje(telefono, textoFormateo)
      break

    case 'accion_completada':
      await enviarMensaje(telefono, `✅ ${respuesta.contenido}`)
      break

    case 'error':
      await enviarMensaje(telefono, `❌ ${respuesta.contenido}`)
      break

    default:
      await enviarMensaje(telefono, respuesta.contenido || respuesta.texto || 'Respuesta procesada.')
  }
}

/**
 * Procesar respuesta a confirmacion
 */
async function procesarConfirmacion(telefono, mensaje, sesion) {
  const mensajeLower = mensaje.toLowerCase().trim()
  const confirmacion = obtenerConfirmacionPendiente(telefono)

  if (!confirmacion) {
    // No hay confirmacion pendiente
    actualizarEstado(telefono, ESTADOS.GESTIONANDO_MARCA)
    await enviarMensaje(telefono, 'No hay confirmacion pendiente. Puedes continuar con otra consulta.')
    return
  }

  if (
    mensajeLower === 'confirmar_si' ||
    mensajeLower === 'si' ||
    mensajeLower === 'sí' ||
    mensajeLower === 'confirmar' ||
    mensajeLower === '1'
  ) {
    // Ejecutar accion confirmada
    limpiarConfirmacionPendiente(telefono)
    actualizarEstado(telefono, ESTADOS.GESTIONANDO_MARCA)

    // Procesar la accion pendiente
    const mensajeConfirmacion = `Confirmo: ${confirmacion.accion || confirmacion.descripcion || 'la accion'}`
    agregarAlHistorial(telefono, 'user', mensajeConfirmacion)

    // Ejecutar accion real
    const respuesta = await ejecutarAccionConfirmada(confirmacion, sesion)
    await enviarMensaje(telefono, respuesta)
    agregarAlHistorial(telefono, 'assistant', respuesta)
    return
  }

  if (
    mensajeLower === 'confirmar_no' ||
    mensajeLower === 'no' ||
    mensajeLower === 'cancelar' ||
    mensajeLower === '2'
  ) {
    limpiarConfirmacionPendiente(telefono)
    actualizarEstado(telefono, ESTADOS.GESTIONANDO_MARCA)
    await enviarMensaje(telefono, 'Accion cancelada. Puedes continuar con otra consulta.')
    return
  }

  // No entendio
  await enviarMensajeConBotones(
    telefono,
    'Por favor, confirma o cancela la accion:',
    [
      { id: 'confirmar_si', title: 'Si, confirmar' },
      { id: 'confirmar_no', title: 'No, cancelar' }
    ]
  )
}

/**
 * Ejecutar accion confirmada
 */
async function ejecutarAccionConfirmada(confirmacion, sesion) {
  // Por ahora, simplemente confirmamos
  // En el futuro, aqui se ejecutarian las acciones reales (modificar, eliminar, etc.)
  return `✅ Accion "${confirmacion.accion || 'solicitada'}" ejecutada correctamente.`
}

// ============================================
// APROBACIÓN DE REGLAS (PUBLICACIONES)
// ============================================

/**
 * Procesar respuesta a solicitud de aprobación de regla
 * @param {string} telefono - Número del usuario
 * @param {string} mensaje - Mensaje recibido
 * @param {Object} aprobacion - Datos de la aprobación pendiente
 * @returns {Promise<{procesado: boolean}>}
 */
async function procesarRespuestaAprobacion(telefono, mensaje, aprobacion) {
  const mensajeLower = mensaje.toLowerCase().trim()
  const tareaId = aprobacion.tarea_id
  const postId = aprobacion.post_id

  console.log(`[APROBACION] Procesando respuesta para tarea ${tareaId}, post ${postId}`)

  // Detectar respuesta afirmativa (aprobar)
  if (
    mensajeLower.startsWith('aprobar_') ||
    mensajeLower === 'si' ||
    mensajeLower === 'sí' ||
    mensajeLower === '1' ||
    mensajeLower.includes('aprobar') ||
    mensajeLower === 'si, aprobar'
  ) {
    console.log(`[APROBACION] Usuario aprobó regla ${postId}`)

    const resultado = await aprobarRegla(postId)

    if (resultado.success) {
      // Actualizar tarea como completada
      await actualizarTareaAprobacion(tareaId, 'aprobada', telefono)
      await limpiarAprobacionPendiente(telefono)

      await enviarMensaje(
        telefono,
        '✅ *Regla aprobada*\n\n' +
        'La publicación ahora se usará para responder comentarios automáticamente.\n\n' +
        'Puedes ver tus reglas activas en el dashboard.'
      )
    } else {
      await enviarMensaje(
        telefono,
        `❌ Error al aprobar: ${resultado.error}\n\nPor favor, intenta desde el dashboard.`
      )
    }

    return { procesado: true }
  }

  // Detectar respuesta negativa (rechazar)
  if (
    mensajeLower.startsWith('rechazar_') ||
    mensajeLower === 'no' ||
    mensajeLower === '2' ||
    mensajeLower.includes('rechazar') ||
    mensajeLower === 'no, rechazar'
  ) {
    console.log(`[APROBACION] Usuario rechazó regla ${postId}`)

    const resultado = await rechazarRegla(postId)

    if (resultado.success) {
      await actualizarTareaAprobacion(tareaId, 'rechazada', telefono)
      await limpiarAprobacionPendiente(telefono)

      await enviarMensaje(
        telefono,
        '❌ *Regla rechazada*\n\n' +
        'La publicación no se usará para respuestas automáticas.'
      )
    } else {
      await enviarMensaje(
        telefono,
        `❌ Error al rechazar: ${resultado.error}\n\nPor favor, intenta desde el dashboard.`
      )
    }

    return { procesado: true }
  }

  // Detectar solicitud de modificación
  if (
    mensajeLower.startsWith('modificar_') ||
    mensajeLower === 'modificar' ||
    mensajeLower === '3' ||
    mensajeLower.includes('editar') ||
    mensajeLower.includes('cambiar')
  ) {
    console.log(`[APROBACION] Usuario quiere modificar regla ${postId}`)

    const dashboardUrl = process.env.DASHBOARD_URL || 'https://controladorbbdd.vercel.app'

    await enviarMensaje(
      telefono,
      `📝 *Modificar regla*\n\n` +
      `Para modificar la regla, ingresa al dashboard:\n\n` +
      `${dashboardUrl}/tareas\n\n` +
      `Ahí podrás ver los detalles y hacer los cambios necesarios.`
    )

    return { procesado: true }
  }

  // No se entendió la respuesta - mostrar botones nuevamente
  await enviarMensajeConBotones(
    telefono,
    'No entendí tu respuesta. Por favor selecciona una opción:',
    [
      { id: `aprobar_${tareaId}`, title: 'Sí, aprobar' },
      { id: `rechazar_${tareaId}`, title: 'No, rechazar' },
      { id: `modificar_${tareaId}`, title: 'Modificar' }
    ]
  )

  return { procesado: true }
}

/**
 * Actualizar tarea de aprobación como completada
 * @param {number} tareaId - ID de la tarea
 * @param {string} resultado - 'aprobada' o 'rechazada'
 * @param {string} telefono - Teléfono de quien respondió
 */
async function actualizarTareaAprobacion(tareaId, resultado, telefono) {
  try {
    // Actualizar tarea
    await actualizarTarea(tareaId, {
      estado: 'completada',
      fecha_completada: new Date().toISOString()
    })

    // Registrar en historial
    await registrarCambioTarea({
      id_tarea: tareaId,
      campo_modificado: 'estado',
      valor_anterior: 'pendiente',
      valor_nuevo: 'completada',
      nombre_modificador: `WhatsApp (${telefono}) - ${resultado}`
    })

    console.log(`[APROBACION] Tarea ${tareaId} actualizada como ${resultado}`)
  } catch (error) {
    console.error('Error actualizando tarea de aprobación:', error)
  }
}

export default {
  procesarMensajeWhatsApp
}
