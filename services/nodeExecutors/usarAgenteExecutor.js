/**
 * Ejecutor: Nodo Usar Agente IA
 * Delega la conversacion a un agente IA configurado.
 *
 * Primer turno: ejecutarUsarAgente (llamado por ejecutarDesdeNodo)
 * Turnos siguientes: continuarAgente (llamado por continuarFlujo)
 *
 * El agente conversa multi-turno y al finalizar elige una salida
 * configurable via [SALIDA:id][FINALIZAR].
 */

import { interpolarVariables } from '../flowEngine'
import {
  obtenerConocimientoAprobado,
  obtenerMensajesFlujo,
  actualizarConversacionFlujo,
  guardarMensajeFlujo
} from '@/lib/supabase'
import { getConocimientoAgente } from '@/lib/agentes'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const REGEX_SALIDA = /\[SALIDA:(\w+)\]/
const REGEX_FINALIZAR = /\[FINALIZAR\]/
const REGEX_BRACKETS = /\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s_:.\-0-9]*\]/g

/**
 * Detectar [SALIDA:id] en respuesta del agente
 */
function detectarSalida(respuesta) {
  const match = REGEX_SALIDA.exec(respuesta)
  if (match) {
    const salidaId = match[1]
    const limpia = respuesta.replace(REGEX_SALIDA, '').trim()
    return { salidaId, respuesta: limpia }
  }
  return { salidaId: null, respuesta }
}

/**
 * Limpiar cualquier señal interna [TEXTO_MAYUSCULA] de la respuesta
 * antes de enviarla al usuario
 */
function limpiarSenales(respuesta) {
  return respuesta
    .replace(REGEX_FINALIZAR, '')
    .replace(REGEX_SALIDA, '')
    .replace(REGEX_BRACKETS, '')
    .trim()
}

/**
 * Cargar agente directamente (como Python _cargar_agente)
 */
async function cargarAgente(agenteId) {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .select('*')
      .eq('id', String(agenteId))
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data || null
  } catch (e) {
    console.error('   Error cargando agente:', e.message)
    return null
  }
}

/**
 * Construir system prompt del agente
 */
function buildAgentPrompt(agente, conversacion, conocimientoMarca, conocimientoAgente, salidas) {
  const variables = conversacion.variables || {}
  const nombreMarca = variables.nombre_marca || ''

  let prompt = ''

  // Identidad
  if (nombreMarca) {
    prompt += `Eres "${agente.nombre}", el asistente IA de "${nombreMarca}".`
  } else {
    prompt += `Eres "${agente.nombre}", un asistente IA.`
  }

  // Objetivo
  if (agente.objetivo) {
    prompt += `\n\nOBJETIVO PRINCIPAL:\n${agente.objetivo}`
  }

  // Tono
  if (agente.tono) {
    prompt += `\n\nTONO: Usa un tono ${agente.tono} en todas tus respuestas.`
  }

  // Instrucciones
  if (agente.instrucciones) {
    prompt += `\n\nINSTRUCCIONES:\n${agente.instrucciones}`
  }

  // Conocimiento de marca (SIEMPRE todo, sin filtrar por categorias)
  if (conocimientoMarca && conocimientoMarca.length > 0) {
    const porCategoria = {}
    for (const k of conocimientoMarca) {
      const cat = k.categoria || 'general'
      if (!porCategoria[cat]) porCategoria[cat] = []
      porCategoria[cat].push(k)
    }

    const prioridad = ['identidad', 'tono_voz', 'productos', 'servicios', 'precios', 'faq', 'horarios', 'ubicacion', 'politicas']
    const categoriasOrdenadas = [
      ...prioridad.filter(c => porCategoria[c]),
      ...Object.keys(porCategoria).filter(c => !prioridad.includes(c))
    ]

    let textoConocimiento = ''
    for (const cat of categoriasOrdenadas) {
      const items = porCategoria[cat]
      textoConocimiento += `\n[${cat.toUpperCase()}]\n`
      textoConocimiento += items.map(k => `- ${k.titulo}: ${k.contenido}`).join('\n')
    }

    if (textoConocimiento) {
      prompt += `\n\n========== CONOCIMIENTO DE LA MARCA ==========\nUsa SIEMPRE esta informacion para responder. Si la respuesta esta aqui, usala. Si no esta, indica que no tienes esa informacion.${textoConocimiento}`
    }
  }

  // Conocimiento propio del agente
  if (conocimientoAgente && conocimientoAgente.length > 0) {
    let texto = ''
    for (const k of conocimientoAgente) {
      texto += `\n- ${k.titulo || 'Info'}: ${k.contenido}`
    }
    prompt += `\n\n========== CONOCIMIENTO DEL AGENTE ==========${texto}`
  }

  // Variables del usuario
  if (variables && Object.keys(variables).length > 0) {
    const varsTexto = Object.entries(variables)
      .filter(([k]) => !k.endsWith('_raw') && !['agente_activo_id', 'agente_activo_nombre', 'nombre_marca', 'id_marca_str'].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    if (varsTexto) {
      prompt += `\n\n========== DATOS DEL USUARIO ==========\n${varsTexto}`
    }
  }

  // Condiciones de cierre
  if (agente.condiciones_cierre) {
    prompt += `\n\nCONDICIONES DE CIERRE:\n${agente.condiciones_cierre}`
  }

  // Instrucciones de cierre y salidas
  prompt += `\n\n--- INSTRUCCIONES DE CIERRE ---`
  prompt += `\nEsta es una conversacion multi-turno. Debes seguir conversando hasta cumplir tu objetivo.`

  if (salidas && salidas.length > 0) {
    prompt += `\n\nSALIDAS DISPONIBLES - Cuando termines la conversacion, elige UNA de estas salidas que mejor represente el resultado:`
    for (const s of salidas) {
      prompt += `\n- "${s.id}": ${s.descripcion || s.id}`
    }
    prompt += `\n\nCuando la conversacion deba terminar, incluye exactamente [SALIDA:id_de_salida][FINALIZAR] al FINAL de tu mensaje.`
    prompt += `\nEjemplo: ...tu respuesta aqui... [SALIDA:${salidas[0].id}][FINALIZAR]`
  } else {
    prompt += `\nCuando hayas CUMPLIDO tu objetivo o la conversacion deba terminar, incluye exactamente [FINALIZAR] al FINAL de tu mensaje.`
  }

  prompt += `\nNO uses [FINALIZAR] si aun necesitas mas informacion o la conversacion debe continuar.`
  prompt += `\n\nIMPORTANTE: Responde basandote en el conocimiento proporcionado. No inventes informacion. Si no sabes algo, indicalo. Responde de forma concisa y natural.`

  return prompt
}

/**
 * Cargar conocimiento (marca + agente)
 */
async function cargarConocimiento(conversacion, agenteId) {
  const idMarca = conversacion.variables?.id_marca_str || String(conversacion.id_marca || '')

  let conocimientoMarca = []
  if (idMarca) {
    try {
      const r = await obtenerConocimientoAprobado(idMarca)
      if (r.success) conocimientoMarca = r.data || []
    } catch (e) {
      console.warn('   Error cargando conocimiento marca:', e.message)
    }
  }

  let conocimientoAgente = []
  try {
    const r = await getConocimientoAgente(agenteId)
    if (r.success) conocimientoAgente = r.data || []
  } catch (e) {
    console.warn('   Error cargando conocimiento agente:', e.message)
  }

  return { conocimientoMarca, conocimientoAgente }
}

// =================================================================
// PRIMER TURNO: ejecutarUsarAgente (llamado por ejecutarDesdeNodo)
// =================================================================

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 */
export async function ejecutarUsarAgente(nodo, contexto) {
  const { adapter, conversacion, mensaje } = contexto
  const datos = nodo.datos || {}
  const agenteId = datos.agente_id
  const mensajeTransicion = datos.mensaje_transicion || ''
  const salidas = datos.salidas || []
  const variableResultado = datos.variable_resultado || 'resultado_agente'

  if (!agenteId) {
    console.warn('   usar_agente: sin agente_id configurado')
    return { continuar: true }
  }

  // Enviar mensaje de transicion
  if (mensajeTransicion) {
    const texto = interpolarVariables(mensajeTransicion, conversacion.variables)
    await adapter.enviarTexto(texto)
  }

  try {
    const agente = await cargarAgente(agenteId)
    if (!agente) {
      console.error(`   usar_agente: agente no encontrado (id: ${agenteId})`)
      return { continuar: true }
    }

    if (agente.estado !== 'activo') {
      console.warn(`   usar_agente: agente "${agente.nombre}" no activo (estado: ${agente.estado})`)
      return { continuar: true }
    }

    console.log(`   Activando agente: "${agente.nombre}" (${agente.modelo || 'gpt-4o-mini'})`)

    // Cargar conocimiento
    const { conocimientoMarca, conocimientoAgente } = await cargarConocimiento(conversacion, agenteId)
    console.log(`   Conocimiento: ${conocimientoMarca.length} marca, ${conocimientoAgente.length} agente`)

    // Construir prompt y generar primera respuesta
    const systemPrompt = buildAgentPrompt(agente, conversacion, conocimientoMarca, conocimientoAgente, salidas)

    // Cargar historial previo para dar contexto al agente (ej: viene de otro agente)
    const messages = [{ role: 'system', content: systemPrompt }]
    try {
      const resp = await supabase
        .from('mensajes_flujo')
        .select('direccion, contenido')
        .eq('conversacion_id', conversacion.id)
        .order('creado_en', { ascending: true })
        .limit(20)

      const historial = resp.data || []
      if (historial.length > 0) {
        // Incluir historial como contexto para que el agente sepa que paso antes
        const resumen = historial.map(m => {
          const rol = m.direccion === 'saliente' ? 'Asistente' : 'Cliente'
          return `${rol}: ${m.contenido}`
        }).join('\n')
        messages.push({ role: 'user', content: `[CONTEXTO DE CONVERSACION PREVIA]\n${resumen}\n\n[NUEVO MENSAJE]\nEl cliente ha sido transferido a ti. Presentate brevemente y continua ayudandolo. Su ultimo mensaje fue: ${mensaje || 'Hola'}` })
      } else {
        messages.push({ role: 'user', content: mensaje || 'Hola' })
      }
    } catch (e) {
      messages.push({ role: 'user', content: mensaje || 'Hola' })
    }

    const response = await openai.chat.completions.create({
      model: agente.modelo || 'gpt-4o-mini',
      temperature: agente.temperatura || 0.7,
      max_tokens: 800,
      messages
    })

    let respuestaTexto = response.choices[0]?.message?.content || 'Hola, en que puedo ayudarte?'

    // Detectar salida y finalizacion
    const { salidaId, respuesta: sinSalida } = detectarSalida(respuestaTexto)
    const finalizado = REGEX_FINALIZAR.test(sinSalida)
    const respuestaLimpia = limpiarSenales(sinSalida)

    await adapter.enviarTexto(respuestaLimpia)

    // Guardar respuesta del agente
    await guardarMensajeFlujo({
      conversacion_id: conversacion.id,
      direccion: 'saliente',
      contenido: respuestaLimpia,
      tipo_nodo: 'usar_agente',
      nodo_id: nodo.id
    })

    // Marcar agente activo en la conversacion
    try {
      await supabase
        .from('conversaciones_flujo')
        .update({
          agente_activo_id: agenteId,
          actualizado_en: new Date().toISOString()
        })
        .eq('id', conversacion.id)
    } catch (e) {
      console.warn(`   usar_agente: no se pudo marcar agente_activo_id: ${e.message}`)
    }

    console.log(`   Agente "${agente.nombre}" respondio (${respuestaLimpia.length} chars, finalizado=${finalizado}, salida=${salidaId || 'ninguna'})`)

    const varsActualizadas = {
      ...conversacion.variables,
      agente_activo_id: String(agenteId),
      agente_activo_nombre: agente.nombre || ''
    }

    if (finalizado) {
      // Agente resolvio todo en un turno
      varsActualizadas[variableResultado] = respuestaLimpia
      return {
        continuar: true,
        salidaAgente: salidaId || null,
        variablesActualizadas: varsActualizadas
      }
    }

    return {
      continuar: false,
      esperarInput: true,
      variablesActualizadas: varsActualizadas
    }

  } catch (e) {
    console.error('   Error en usar_agente:', e.message)
    return { continuar: true }
  }
}

// =================================================================
// TURNOS SIGUIENTES: continuarAgente (llamado desde continuarFlujo)
// =================================================================

/**
 * Continua conversacion multi-turno con agente IA.
 * Carga historial completo, genera respuesta, detecta finalizacion y salida.
 *
 * @param {object} nodoActual - Nodo usar_agente actual
 * @param {object} conversacion - Conversacion con variables
 * @param {object} adapter - Adapter del canal
 * @param {string} mensaje - Mensaje del usuario
 * @returns {{ finalizado: boolean, respuesta: string, salidaAgente: string|null }}
 */
export async function continuarAgente(nodoActual, conversacion, adapter, mensaje) {
  const datos = nodoActual.datos || {}
  const agenteId = datos.agente_id
  const salidas = datos.salidas || []

  if (!agenteId) {
    return { finalizado: true, respuesta: '', salidaAgente: null }
  }

  try {
    const agente = await cargarAgente(agenteId)
    if (!agente || agente.estado !== 'activo') {
      console.warn(`   continuar_agente: agente no disponible (id: ${agenteId})`)
      return { finalizado: true, respuesta: '', salidaAgente: null }
    }

    // Cargar conocimiento
    const { conocimientoMarca, conocimientoAgente } = await cargarConocimiento(conversacion, agenteId)

    // Construir prompt con salidas
    const systemPrompt = buildAgentPrompt(agente, conversacion, conocimientoMarca, conocimientoAgente, salidas)

    // Cargar historial de mensajes
    let historial = []
    try {
      const resp = await supabase
        .from('mensajes_flujo')
        .select('direccion, contenido, tipo_nodo')
        .eq('conversacion_id', conversacion.id)
        .order('creado_en', { ascending: true })
        .limit(50)

      historial = resp.data || []
    } catch (e) {
      console.warn('   Error cargando historial:', e.message)
    }

    // Construir array de mensajes para OpenAI
    const messages = [{ role: 'system', content: systemPrompt }]
    for (const m of historial) {
      const contenido = m.contenido || ''
      if (!contenido) continue
      const role = m.direccion === 'saliente' ? 'assistant' : 'user'

      // Concatenar mensajes consecutivos del mismo rol
      if (messages.length > 1 && messages[messages.length - 1].role === role) {
        if (role === 'user') {
          messages[messages.length - 1].content += '\n' + contenido
        } else {
          messages[messages.length - 1] = { role, content: contenido }
        }
      } else {
        messages.push({ role, content: contenido })
      }
    }

    // Asegurar que el mensaje actual sea el ultimo
    const ultimo = messages[messages.length - 1]
    if (!ultimo || ultimo.role !== 'user' || ultimo.content !== mensaje) {
      messages.push({ role: 'user', content: mensaje })
    }

    // Verificar limite de turnos
    const maxTurnos = agente.max_turnos || 50
    const turnosAgente = messages.filter(m => m.role === 'assistant').length
    if (turnosAgente >= maxTurnos) {
      await adapter.enviarTexto('Hemos alcanzado el limite de esta conversacion. Gracias por tu tiempo!')
      console.log(`   usar_agente: max_turnos (${maxTurnos}) alcanzado`)
      return { finalizado: true, respuesta: 'Limite de turnos alcanzado', salidaAgente: salidas[0]?.id || null }
    }

    // Generar respuesta
    const response = await openai.chat.completions.create({
      model: agente.modelo || 'gpt-4o-mini',
      temperature: agente.temperatura || 0.7,
      max_tokens: 800,
      messages
    })

    let respuesta = response.choices[0]?.message?.content || ''

    // Detectar salida y finalizacion
    const { salidaId, respuesta: sinSalida } = detectarSalida(respuesta)
    const finalizado = REGEX_FINALIZAR.test(sinSalida)
    const respuestaLimpia = limpiarSenales(sinSalida)

    if (respuestaLimpia) {
      await adapter.enviarTexto(respuestaLimpia)
    }

    console.log(`   Agente turno ${turnosAgente + 1}: finalizado=${finalizado}, salida=${salidaId || 'ninguna'}, largo=${respuestaLimpia.length}`)

    return { finalizado, respuesta: respuestaLimpia, salidaAgente: salidaId || null }

  } catch (e) {
    console.error('   Error continuando agente:', e.message)
    return { finalizado: false, respuesta: '', salidaAgente: null }
  }
}
