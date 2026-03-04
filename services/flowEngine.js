/**
 * Flow Engine - Motor de ejecucion de flujos conversacionales
 *
 * Responsabilidades:
 * - Ejecutar nodos de un flujo secuencialmente
 * - Manejar nodos auto-ejecutables vs interactivos
 * - Evaluar condiciones en edges para determinar siguiente nodo
 * - Gestionar variables del flujo
 * - Guardar estado de la conversacion
 */

import { obtenerEjecutor, esAutoEjecutable } from './nodeExecutors/index'
import { procesarRespuestaPregunta } from './nodeExecutors/preguntaExecutor'
import { procesarRespuestaEsperar } from './nodeExecutors/esperarExecutor'
import { continuarAgente } from './nodeExecutors/usarAgenteExecutor'
import {
  crearConversacionFlujo,
  actualizarConversacionFlujo,
  finalizarConversacion,
  guardarMensajeFlujo
} from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

const supabaseDirecto = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAX_NODOS_AUTO = 20 // Limite de nodos auto-ejecutables consecutivos (anti-loop)

/**
 * Interpola variables {{variable}} en un texto
 * @param {string} texto - Texto con placeholders
 * @param {object} variables - Mapa de variables
 * @returns {string}
 */
export function interpolarVariables(texto, variables = {}) {
  if (!texto || typeof texto !== 'string') return texto || ''

  return texto.replace(/\{\{(\w+)\}\}/g, (match, nombreVar) => {
    // Variables del sistema
    if (nombreVar === 'fecha_actual') return new Date().toLocaleDateString('es-CL')
    if (nombreVar === 'hora_actual') return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    if (nombreVar === 'timestamp') return new Date().toISOString()

    return variables[nombreVar] !== undefined ? String(variables[nombreVar]) : match
  })
}

/**
 * Iniciar un nuevo flujo para un usuario
 * @param {object} flujo - Definicion del flujo (de BD)
 * @param {object} params - { canal, identificador, idMarca, adapter, mensaje }
 * @returns {object} { handled: boolean }
 */
export async function iniciarFlujo(flujo, params) {
  const { canal, identificador, idMarca, adapter, mensaje } = params

  console.log(`\n🔵 === Iniciando flujo: "${flujo.nombre}" ===`)
  console.log(`   📊 Nodos (${flujo.nodos?.length}): ${flujo.nodos?.map(n => `${n.id}(${n.tipo})`).join(' → ')}`)
  console.log(`   📊 Edges (${flujo.edges?.length}): ${flujo.edges?.map(e => `${e.origen}→${e.destino}`).join(', ')}`)

  // Buscar nodo inicio
  const nodoInicio = flujo.nodos.find(n => n.tipo === 'inicio')
  if (!nodoInicio) {
    console.error('   ❌ Flujo sin nodo inicio')
    return { handled: false }
  }

  // Crear conversacion en BD
  const convResult = await crearConversacionFlujo({
    id_marca: idMarca,
    flujo_id: flujo.id,
    canal,
    identificador_usuario: identificador,
    nodo_actual_id: nodoInicio.id,
    variables: {
      nombre_marca: flujo.nombre_marca || '',
      id_marca_str: String(idMarca),
      canal,
      identificador_usuario: identificador
    },
    metadata: { mensaje_trigger: mensaje }
  })

  if (!convResult.success) {
    console.error('   ❌ Error creando conversacion:', convResult.error)
    return { handled: false }
  }

  const conversacion = convResult.data

  // Guardar mensaje entrante
  await guardarMensajeFlujo({
    conversacion_id: conversacion.id,
    direccion: 'entrante',
    contenido: mensaje,
    tipo_nodo: 'trigger',
    nodo_id: nodoInicio.id
  })

  // Ejecutar desde el nodo inicio
  await ejecutarDesdeNodo(nodoInicio, flujo, conversacion, adapter, mensaje)

  return { handled: true }
}

/**
 * Continuar un flujo existente con un nuevo mensaje del usuario
 * @param {object} conversacion - Conversacion activa (incluye flujo via join)
 * @param {object} params - { adapter, mensaje }
 * @returns {object} { handled: boolean }
 */
export async function continuarFlujo(conversacion, params) {
  const { adapter, mensaje } = params
  const flujo = conversacion.flujos

  if (!flujo) {
    console.error('   ❌ Conversacion sin flujo asociado')
    return { handled: false }
  }

  console.log(`\n🔵 === Continuando flujo: "${flujo.nombre}" (nodo: ${conversacion.nodo_actual_id}) ===`)

  // Guardar mensaje entrante
  await guardarMensajeFlujo({
    conversacion_id: conversacion.id,
    direccion: 'entrante',
    contenido: mensaje,
    tipo_nodo: 'respuesta_usuario',
    nodo_id: conversacion.nodo_actual_id
  })

  // Encontrar nodo actual
  const nodoActual = flujo.nodos.find(n => n.id === conversacion.nodo_actual_id)
  if (!nodoActual) {
    console.error(`   ❌ Nodo no encontrado: ${conversacion.nodo_actual_id}`)
    await finalizarConversacion(conversacion.id, 'completada')
    return { handled: false }
  }

  // Procesar respuesta del usuario segun el tipo de nodo actual
  let variablesActualizadas = { ...conversacion.variables }

  if (nodoActual.tipo === 'pregunta') {
    const resultado = procesarRespuestaPregunta(nodoActual, mensaje)

    if (!resultado.valido) {
      // Respuesta invalida: re-enviar error y esperar de nuevo
      await adapter.enviarTexto(resultado.error)
      return { handled: true }
    }

    // Guardar respuesta en la variable destino
    const varDestino = nodoActual.datos?.variable_destino
    if (varDestino) {
      variablesActualizadas[varDestino] = resultado.valor
    }
  }

  // Nodo esperar: guardar respuesta del cliente en variable
  if (nodoActual.tipo === 'esperar') {
    const resultado = procesarRespuestaEsperar(nodoActual, mensaje)
    const varDestino = nodoActual.datos?.variable_destino
    if (varDestino) {
      variablesActualizadas[varDestino] = resultado.valor
    }
  }

  // === NODO USAR_AGENTE: multi-turno con agente IA ===
  if (nodoActual.tipo === 'usar_agente') {
    console.log(`   Continuando agente multi-turno (conv: ${conversacion.id})`)

    const resultadoAgente = await continuarAgente(nodoActual, conversacion, adapter, mensaje)

    // Guardar mensaje saliente del agente
    if (resultadoAgente.respuesta) {
      await guardarMensajeFlujo({
        conversacion_id: conversacion.id,
        direccion: 'saliente',
        contenido: resultadoAgente.respuesta,
        tipo_nodo: 'usar_agente',
        nodo_id: nodoActual.id
      })
    }

    if (!resultadoAgente.finalizado) {
      // Agente sigue conversando: quedarse en este nodo
      variablesActualizadas.ultima_respuesta = mensaje
      await actualizarConversacionFlujo(conversacion.id, {
        variables: variablesActualizadas
      })
      return { handled: true }
    }

    // Agente termino: limpiar agente_activo_id y continuar al siguiente nodo
    console.log(`   Agente finalizo (salida: ${resultadoAgente.salidaAgente || 'default'}) en conv ${conversacion.id}`)
    try {
      await supabaseDirecto
        .from('conversaciones_flujo')
        .update({
          agente_activo_id: null,
          actualizado_en: new Date().toISOString()
        })
        .eq('id', conversacion.id)
    } catch (e) {
      console.warn('   Error limpiando agente_activo_id:', e.message)
    }

    // Guardar resultado del agente en variable
    const varResultado = nodoActual.datos?.variable_resultado || 'resultado_agente'
    variablesActualizadas[varResultado] = resultadoAgente.respuesta || ''
    variablesActualizadas.ultima_respuesta = mensaje

    await actualizarConversacionFlujo(conversacion.id, {
      variables: variablesActualizadas
    })
    conversacion.variables = variablesActualizadas

    // Evaluar edges con salidaAgente
    const siguienteNodoAgente = evaluarEdges(nodoActual, flujo, conversacion, mensaje, { salidaAgente: resultadoAgente.salidaAgente })
    if (!siguienteNodoAgente) {
      await finalizarConversacion(conversacion.id, 'completada')
      return { handled: true }
    }

    await ejecutarDesdeNodo(siguienteNodoAgente, flujo, conversacion, adapter, mensaje)
    return { handled: true }
  }

  // Actualizar variables si cambiaron
  variablesActualizadas.ultima_respuesta = mensaje

  // Guardar variables actualizadas
  await actualizarConversacionFlujo(conversacion.id, {
    variables: variablesActualizadas
  })

  // Actualizar conversacion local
  conversacion.variables = variablesActualizadas

  // Evaluar edges para encontrar siguiente nodo
  const siguienteNodo = evaluarEdges(nodoActual, flujo, conversacion, mensaje)

  if (!siguienteNodo) {
    console.log('   ⚠️ Sin siguiente nodo, finalizando flujo')
    await finalizarConversacion(conversacion.id, 'completada')
    return { handled: true }
  }

  // Ejecutar siguiente nodo
  await ejecutarDesdeNodo(siguienteNodo, flujo, conversacion, adapter, mensaje)

  return { handled: true }
}

/**
 * Ejecuta nodos desde un nodo dado, avanzando automaticamente
 * por nodos auto-ejecutables hasta llegar a uno interactivo o al fin.
 */
async function ejecutarDesdeNodo(nodo, flujo, conversacion, adapter, mensaje) {
  let nodoActual = nodo
  let iteraciones = 0

  while (nodoActual && iteraciones < MAX_NODOS_AUTO) {
    iteraciones++
    console.log(`   ▶ Ejecutando nodo: ${nodoActual.id} (${nodoActual.tipo})`)

    const ejecutor = obtenerEjecutor(nodoActual.tipo)
    if (!ejecutor) {
      console.error(`   ❌ Sin ejecutor para tipo: ${nodoActual.tipo}`)
      break
    }

    // Construir contexto para el ejecutor
    const contexto = {
      conversacion,
      canal: conversacion.canal,
      mensaje,
      adapter
    }

    // Ejecutar nodo
    const resultado = await ejecutor(nodoActual, contexto)

    console.log(`   📋 Resultado ${nodoActual.tipo}: continuar=${resultado.continuar}, esperarInput=${resultado.esperarInput}, finalizarFlujo=${resultado.finalizarFlujo}`)

    // Actualizar variables si el ejecutor las modifico
    if (resultado.variablesActualizadas) {
      conversacion.variables = resultado.variablesActualizadas
      await actualizarConversacionFlujo(conversacion.id, {
        variables: conversacion.variables
      })
    }

    // Guardar mensaje saliente si el nodo envio algo
    if (nodoActual.tipo === 'mensaje' || nodoActual.tipo === 'pregunta' || nodoActual.tipo === 'respuesta_ia' || nodoActual.tipo === 'esperar' || nodoActual.tipo === 'fin') {
      await guardarMensajeFlujo({
        conversacion_id: conversacion.id,
        direccion: 'saliente',
        contenido: nodoActual.datos?.texto || nodoActual.datos?.mensaje_despedida || '',
        tipo_nodo: nodoActual.tipo,
        nodo_id: nodoActual.id
      })
    }

    // Si el flujo debe finalizar
    if (resultado.finalizarFlujo) {
      const estadoFinal = resultado.accion === 'transferir' ? 'transferida' : 'completada'
      await finalizarConversacion(conversacion.id, estadoFinal)
      return
    }

    // Si debe esperar input del usuario
    if (resultado.esperarInput || !resultado.continuar) {
      await actualizarConversacionFlujo(conversacion.id, {
        nodo_actual_id: nodoActual.id
      })
      return
    }

    // Buscar siguiente nodo
    const siguienteNodo = evaluarEdges(nodoActual, flujo, conversacion, mensaje, resultado)

    if (!siguienteNodo) {
      console.log('   ⚠️ Sin siguiente nodo despues de', nodoActual.id, '- finalizando')
      await finalizarConversacion(conversacion.id, 'completada')
      return
    }

    console.log(`   ➡️ Siguiente nodo: ${siguienteNodo.id} (${siguienteNodo.tipo})`)

    // Actualizar nodo actual en BD
    await actualizarConversacionFlujo(conversacion.id, {
      nodo_actual_id: siguienteNodo.id
    })

    nodoActual = siguienteNodo
  }

  if (iteraciones >= MAX_NODOS_AUTO) {
    console.error('   ❌ Limite de iteraciones alcanzado (posible loop)')
    await finalizarConversacion(conversacion.id, 'completada')
  }
}

/**
 * Evaluar edges salientes de un nodo para determinar el siguiente
 * @param {object} nodoActual - Nodo origen
 * @param {object} flujo - Flujo completo
 * @param {object} conversacion - Conversacion con variables
 * @param {string} mensaje - Ultimo mensaje del usuario
 * @param {object} resultadoEjecucion - Resultado del ejecutor
 * @returns {object|null} Siguiente nodo o null
 */
function evaluarEdges(nodoActual, flujo, conversacion, mensaje, resultadoEjecucion = {}) {
  const edges = flujo.edges.filter(e => e.origen === nodoActual.id)

  if (edges.length === 0) return null

  const mensajeLower = (mensaje || '').toLowerCase().trim()

  // Para nodos condicion, usar resultado true/false
  if (nodoActual.tipo === 'condicion') {
    const resultado = resultadoEjecucion.resultadoCondicion

    // Buscar edge con condicion que matchee el resultado
    for (const edge of edges) {
      const cond = edge.condicion
      if (!cond) continue

      if (cond.tipo === 'resultado_true' && resultado === true) {
        return flujo.nodos.find(n => n.id === edge.destino)
      }
      if (cond.tipo === 'resultado_false' && resultado === false) {
        return flujo.nodos.find(n => n.id === edge.destino)
      }
    }

    // Fallback: default edge
    const defaultEdge = edges.find(e => e.condicion?.tipo === 'default' || !e.condicion)
    if (defaultEdge) return flujo.nodos.find(n => n.id === defaultEdge.destino)

    return null
  }

  // Para nodos usar_agente, usar salidaAgente del resultado
  if (nodoActual.tipo === 'usar_agente') {
    const salidaAgente = resultadoEjecucion.salidaAgente

    if (salidaAgente) {
      for (const edge of edges) {
        const cond = edge.condicion
        if (cond && cond.tipo === 'salida_agente' && cond.valor === salidaAgente) {
          return flujo.nodos.find(n => n.id === edge.destino)
        }
      }
    }

    // Fallback: default edge o unico edge
    const defaultEdge = edges.find(e => !e.condicion || e.condicion?.tipo === 'default')
    if (defaultEdge) return flujo.nodos.find(n => n.id === defaultEdge.destino)
    if (edges.length === 1) return flujo.nodos.find(n => n.id === edges[0].destino)
    return null
  }

  // Para nodos reconocer_respuesta, usar salidaIA del resultado
  if (nodoActual.tipo === 'reconocer_respuesta' && resultadoEjecucion.salidaIA) {
    const salidaIA = resultadoEjecucion.salidaIA

    for (const edge of edges) {
      const cond = edge.condicion
      if (cond && cond.tipo === 'salida_ia' && cond.valor === salidaIA) {
        return flujo.nodos.find(n => n.id === edge.destino)
      }
    }

    // Fallback: default edge
    const defaultEdge = edges.find(e => e.condicion?.tipo === 'default' || !e.condicion)
    if (defaultEdge) return flujo.nodos.find(n => n.id === defaultEdge.destino)

    return null
  }

  // Para otros nodos: evaluar condiciones de cada edge
  let edgeDefault = null

  for (const edge of edges) {
    const cond = edge.condicion

    // Edge sin condicion o default
    if (!cond || cond.tipo === 'default') {
      edgeDefault = edge
      continue
    }

    let match = false

    switch (cond.tipo) {
      case 'respuesta_exacta':
        match = mensajeLower === (cond.valor || '').toLowerCase().trim()
        break

      case 'respuesta_contiene':
        match = mensajeLower.includes((cond.valor || '').toLowerCase())
        break

      case 'boton':
        // El mensaje de WhatsApp incluye el ID del boton o el texto
        match = mensajeLower === (cond.valor || '').toLowerCase() ||
                mensaje === cond.valor
        break

      case 'salida_ia':
        // Usado por reconocer_respuesta cuando se evalua desde continuarFlujo
        match = resultadoEjecucion.salidaIA === cond.valor
        break

      case 'variable_igual':
        match = String(conversacion.variables[cond.variable] || '').toLowerCase() ===
                (cond.valor || '').toLowerCase()
        break

      case 'variable_existe':
        match = conversacion.variables[cond.variable] !== undefined &&
                conversacion.variables[cond.variable] !== null &&
                conversacion.variables[cond.variable] !== ''
        break

      case 'regex':
        try {
          match = new RegExp(cond.valor, 'i').test(mensaje)
        } catch { match = false }
        break
    }

    if (match) {
      return flujo.nodos.find(n => n.id === edge.destino)
    }
  }

  // Si ninguna condicion matcheo, usar default
  if (edgeDefault) {
    return flujo.nodos.find(n => n.id === edgeDefault.destino)
  }

  // Si solo hay un edge y no tiene condicion especial, seguirlo
  if (edges.length === 1) {
    return flujo.nodos.find(n => n.id === edges[0].destino)
  }

  return null
}
