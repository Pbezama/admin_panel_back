/**
 * Ejecutor: Nodo Usar Agente IA
 * Delega la conversacion a un agente IA configurado.
 *
 * Primer turno: ejecutarUsarAgente (llamado por ejecutarDesdeNodo)
 * Turnos siguientes: continuarAgente (llamado por continuarFlujo)
 *
 * Basado en flow_engine.py ejecutar_usar_agente + continuar_agente
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
    console.error('   ❌ Error cargando agente:', e.message)
    return null
  }
}

/**
 * Construir system prompt del agente (como Python _build_agent_prompt)
 */
function buildAgentPrompt(agente, conversacion, conocimientoMarca, conocimientoAgente) {
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
    prompt += `\nCuando se cumplan estas condiciones, despidete amablemente y agrega [FINALIZAR] al final de tu mensaje.`
  }

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
      console.warn('   ⚠️ Error cargando conocimiento marca:', e.message)
    }
  }

  let conocimientoAgente = []
  try {
    const r = await getConocimientoAgente(agenteId)
    if (r.success) conocimientoAgente = r.data || []
  } catch (e) {
    console.warn('   ⚠️ Error cargando conocimiento agente:', e.message)
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

  if (!agenteId) {
    console.warn('   ⚠️ usar_agente: sin agente_id configurado')
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
      console.error(`   ❌ usar_agente: agente no encontrado (id: ${agenteId})`)
      return { continuar: true }
    }

    if (agente.estado !== 'activo') {
      console.warn(`   ⚠️ usar_agente: agente "${agente.nombre}" no activo (estado: ${agente.estado})`)
      return { continuar: true }
    }

    console.log(`   🤖 Activando agente: "${agente.nombre}" (${agente.modelo || 'gpt-4o-mini'})`)

    // Cargar conocimiento
    const { conocimientoMarca, conocimientoAgente } = await cargarConocimiento(conversacion, agenteId)
    console.log(`   📚 Conocimiento: ${conocimientoMarca.length} marca, ${conocimientoAgente.length} agente`)

    // Construir prompt y generar primera respuesta
    const systemPrompt = buildAgentPrompt(agente, conversacion, conocimientoMarca, conocimientoAgente)

    const response = await openai.chat.completions.create({
      model: agente.modelo || 'gpt-4o-mini',
      temperature: agente.temperatura || 0.7,
      max_tokens: 800,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensaje || 'Hola' }
      ]
    })

    let respuestaTexto = response.choices[0]?.message?.content || 'Hola, ¿en qué puedo ayudarte?'

    // Detectar si el agente quiere cerrar en el primer turno
    const finalizado = respuestaTexto.includes('[FINALIZAR]')
    respuestaTexto = respuestaTexto.replace('[FINALIZAR]', '').trim()

    await adapter.enviarTexto(respuestaTexto)

    // Guardar respuesta del agente
    await guardarMensajeFlujo({
      conversacion_id: conversacion.id,
      direccion: 'saliente',
      contenido: respuestaTexto,
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
      console.warn(`   ⚠️ usar_agente: no se pudo marcar agente_activo_id: ${e.message}`)
    }

    console.log(`   🤖 Agente "${agente.nombre}" respondio (${respuestaTexto.length} chars)`)

    if (finalizado) {
      // Agente resolvio todo en un turno
      return {
        continuar: true,
        variablesActualizadas: {
          ...conversacion.variables,
          agente_activo_id: String(agenteId),
          agente_activo_nombre: agente.nombre || ''
        }
      }
    }

    return {
      continuar: false,
      esperarInput: true,
      variablesActualizadas: {
        ...conversacion.variables,
        agente_activo_id: String(agenteId),
        agente_activo_nombre: agente.nombre || ''
      }
    }

  } catch (e) {
    console.error('   ❌ Error en usar_agente:', e.message)
    // NO enviar error al cliente (como Python)
    return { continuar: true }
  }
}

// =================================================================
// TURNOS SIGUIENTES: continuarAgente (llamado desde continuarFlujo)
// =================================================================

/**
 * Continua conversacion multi-turno con agente IA.
 * Carga historial completo, genera respuesta, detecta finalizacion.
 * (Equivalente a Python continuar_agente)
 *
 * @param {object} nodoActual - Nodo usar_agente actual
 * @param {object} conversacion - Conversacion con variables
 * @param {object} adapter - Adapter del canal
 * @param {string} mensaje - Mensaje del usuario
 * @returns {{ finalizado: boolean, respuesta: string }}
 */
export async function continuarAgente(nodoActual, conversacion, adapter, mensaje) {
  const datos = nodoActual.datos || {}
  const agenteId = datos.agente_id

  if (!agenteId) {
    return { finalizado: true, respuesta: '' }
  }

  try {
    const agente = await cargarAgente(agenteId)
    if (!agente || agente.estado !== 'activo') {
      console.warn(`   ⚠️ continuar_agente: agente no disponible (id: ${agenteId})`)
      return { finalizado: true, respuesta: '' }
    }

    // Cargar conocimiento
    const { conocimientoMarca, conocimientoAgente } = await cargarConocimiento(conversacion, agenteId)

    // Construir prompt
    const systemPrompt = buildAgentPrompt(agente, conversacion, conocimientoMarca, conocimientoAgente)

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
      console.warn('   ⚠️ Error cargando historial:', e.message)
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
      console.log(`   🤖 usar_agente: max_turnos (${maxTurnos}) alcanzado`)
      return { finalizado: true, respuesta: 'Limite de turnos alcanzado' }
    }

    // Generar respuesta
    const response = await openai.chat.completions.create({
      model: agente.modelo || 'gpt-4o-mini',
      temperature: agente.temperatura || 0.7,
      max_tokens: 800,
      messages
    })

    let respuesta = response.choices[0]?.message?.content || ''

    // Detectar finalizacion
    const finalizado = respuesta.includes('[FINALIZAR]')
    const respuestaLimpia = respuesta.replace('[FINALIZAR]', '').trim()

    if (respuestaLimpia) {
      await adapter.enviarTexto(respuestaLimpia)
    }

    console.log(`   🤖 Agente turno ${turnosAgente + 1}: finalizado=${finalizado}, largo=${respuestaLimpia.length}`)

    return { finalizado, respuesta: respuestaLimpia }

  } catch (e) {
    console.error('   ❌ Error continuando agente:', e.message)
    return { finalizado: false, respuesta: '' }
  }
}
