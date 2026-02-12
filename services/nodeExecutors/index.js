/**
 * Registry de ejecutores de nodos
 * Cada tipo de nodo tiene su ejecutor con logica especifica
 */

import { ejecutarInicio } from './inicioExecutor'
import { ejecutarMensaje } from './mensajeExecutor'
import { ejecutarPregunta } from './preguntaExecutor'
import { ejecutarCondicion } from './condicionExecutor'
import { ejecutarGuardarVariable } from './guardarVariableExecutor'
import { ejecutarGuardarBd } from './guardarBdExecutor'
import { ejecutarBuscarConocimiento } from './buscarConocimientoExecutor'
import { ejecutarRespuestaIa } from './respuestaIaExecutor'
import { ejecutarCrearTarea } from './crearTareaExecutor'
import { ejecutarTransferirHumano } from './transferirHumanoExecutor'
import { ejecutarFin } from './finExecutor'
import { ejecutarAgendarCita } from './agendarCitaExecutor'
import { ejecutarEsperar } from './esperarExecutor'

const ejecutores = {
  inicio: ejecutarInicio,
  mensaje: ejecutarMensaje,
  pregunta: ejecutarPregunta,
  condicion: ejecutarCondicion,
  guardar_variable: ejecutarGuardarVariable,
  guardar_bd: ejecutarGuardarBd,
  buscar_conocimiento: ejecutarBuscarConocimiento,
  respuesta_ia: ejecutarRespuestaIa,
  crear_tarea: ejecutarCrearTarea,
  transferir_humano: ejecutarTransferirHumano,
  fin: ejecutarFin,
  agendar_cita: ejecutarAgendarCita,
  esperar: ejecutarEsperar
}

/**
 * Obtener el ejecutor para un tipo de nodo
 * @param {string} tipo - Tipo de nodo
 * @returns {Function|null}
 */
export function obtenerEjecutor(tipo) {
  return ejecutores[tipo] || null
}

/**
 * Determina si un nodo es auto-ejecutable (no espera input del usuario)
 * @param {object} nodo - Nodo del flujo
 * @returns {boolean}
 */
export function esAutoEjecutable(nodo) {
  const autoEjecutables = [
    'inicio',
    'condicion',
    'guardar_variable',
    'guardar_bd',
    'buscar_conocimiento',
    'crear_tarea',
    'agendar_cita',
    'ir_a_flujo',
    'fin'
  ]

  // Mensaje sin botones ni lista es auto-ejecutable (solo envia y sigue)
  if (nodo.tipo === 'mensaje') {
    const tipoMsg = nodo.datos?.tipo_mensaje || 'texto'
    return tipoMsg === 'texto' || tipoMsg === 'imagen'
  }

  return autoEjecutables.includes(nodo.tipo)
}
