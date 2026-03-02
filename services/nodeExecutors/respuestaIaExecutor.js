/**
 * Ejecutor: Nodo Respuesta IA
 * Genera una respuesta usando GPT con contexto completo:
 * - Conocimiento de marca (conocimiento_marca)
 * - Reglas de marca (base_cuentas)
 * - Historial de conversacion (mensajes_flujo)
 * - Variables del flujo
 */

import { interpolarVariables } from '../flowEngine'
import { obtenerConocimientoAprobado, obtenerMensajesFlujo, supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * Obtener reglas/datos de base_cuentas para la marca
 */
async function obtenerDatosMarca(idMarca) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .select('"Nombre marca", categoria, clave, valor')
      .eq('"ID marca"', idMarca)
      .eq('Estado', true)
      .order('prioridad', { ascending: false })
      .limit(30)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error obteniendo datos de marca:', error)
    return []
  }
}

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: bool, variablesActualizadas: object }
 */
export async function ejecutarRespuestaIa(nodo, contexto) {
  const { adapter, conversacion, mensaje } = contexto
  const datos = nodo.datos || {}
  const instrucciones = interpolarVariables(datos.instrucciones || '', conversacion.variables)
  const temperatura = datos.temperatura || 0.7
  const variableDestino = datos.variable_destino || 'respuesta_ia'
  const usarConocimiento = datos.usar_conocimiento !== false // default: true
  const nombreMarca = conversacion.variables?.nombre_marca || ''
  // Usar id_marca_str de variables para evitar perdida de precision BigInt
  const idMarca = conversacion.variables?.id_marca_str || String(conversacion.id_marca || '')

  try {
    // === CONSTRUIR SYSTEM PROMPT RICO ===
    let systemPrompt = nombreMarca
      ? `Eres el asistente virtual de "${nombreMarca}". Responde de forma concisa, util y amable, siempre como representante de la marca.`
      : `Eres un asistente virtual. Responde de forma concisa, util y amable.`

    if (instrucciones) {
      systemPrompt += `\n\nINSTRUCCIONES ESPECIFICAS:\n${instrucciones}`
    }

    // === CONOCIMIENTO DE MARCA (conocimiento_marca) ===
    console.log(`   📚 Cargando conocimiento para idMarca: ${idMarca} (usarConocimiento: ${usarConocimiento})`)
    if (usarConocimiento && idMarca) {
      const conocimiento = await obtenerConocimientoAprobado(idMarca)
      console.log(`   📚 Conocimiento encontrado: ${conocimiento.data?.length || 0} items`)
      if (conocimiento.success && conocimiento.data?.length > 0) {
        // Organizar por categoria para mejor contexto
        const porCategoria = {}
        for (const k of conocimiento.data) {
          const cat = k.categoria || 'general'
          if (!porCategoria[cat]) porCategoria[cat] = []
          porCategoria[cat].push(k)
        }

        let textoConocimiento = ''
        // Priorizar categorias clave
        const prioridad = ['identidad', 'tono_voz', 'productos', 'servicios', 'precios', 'faq', 'horarios', 'ubicacion', 'politicas']
        const categoriasOrdenadas = [
          ...prioridad.filter(c => porCategoria[c]),
          ...Object.keys(porCategoria).filter(c => !prioridad.includes(c))
        ]

        for (const cat of categoriasOrdenadas) {
          const items = porCategoria[cat].slice(0, 8) // Max 8 por categoria
          textoConocimiento += `\n[${cat.toUpperCase()}]\n`
          textoConocimiento += items.map(k => `- ${k.titulo}: ${k.contenido}`).join('\n')
        }

        systemPrompt += `\n\n========== CONOCIMIENTO DE LA MARCA ==========\nUsa esta informacion para responder. Si la respuesta esta aqui, usala. Si no esta, indica que no tienes esa informacion especifica.${textoConocimiento}`
      }
    }

    // === DATOS DE MARCA (base_cuentas) ===
    if (idMarca) {
      const datosMarca = await obtenerDatosMarca(idMarca)
      console.log(`   📋 Datos base_cuentas encontrados: ${datosMarca.length} reglas`)
      if (datosMarca.length > 0) {
        const reglasTexto = datosMarca
          .map(r => `- [${r.categoria || 'general'}] ${r.clave}: ${r.valor}`)
          .join('\n')
        systemPrompt += `\n\n========== REGLAS Y DATOS DE MARCA ==========\n${reglasTexto}`
      }
    }

    // === VARIABLES DEL FLUJO ===
    if (conversacion.variables && Object.keys(conversacion.variables).length > 0) {
      const varsTexto = Object.entries(conversacion.variables)
        .filter(([k]) => !k.endsWith('_raw') && k !== 'nombre_marca')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      if (varsTexto) {
        systemPrompt += `\n\n========== DATOS RECOPILADOS DEL USUARIO ==========\n${varsTexto}`
      }
    }

    systemPrompt += `\n\nIMPORTANTE: Responde SIEMPRE basandote en el conocimiento de marca proporcionado. No inventes informacion que no este en el contexto. Si no sabes algo, di que no tienes esa informacion y ofrece alternativas.`

    // === HISTORIAL DE CONVERSACION ===
    const messages = [{ role: 'system', content: systemPrompt }]

    if (conversacion.id) {
      try {
        const msgResult = await obtenerMensajesFlujo(conversacion.id)
        if (msgResult.success && msgResult.data?.length > 0) {
          // Incluir ultimos 20 mensajes como historial
          const historial = msgResult.data.slice(-20)
          for (const m of historial) {
            messages.push({
              role: m.direccion === 'entrante' ? 'user' : 'assistant',
              content: m.contenido || ''
            })
          }
        }
      } catch (e) {
        // Si falla el historial, al menos enviar el mensaje actual
        console.warn('Error cargando historial:', e.message)
      }
    }

    // Agregar el mensaje actual si no esta ya en el historial
    const ultimoMsg = messages[messages.length - 1]
    if (!ultimoMsg || ultimoMsg.role !== 'user' || ultimoMsg.content !== mensaje) {
      messages.push({ role: 'user', content: mensaje || 'Hola' })
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: temperatura,
      max_tokens: 500,
      messages
    })

    const respuestaTexto = response.choices[0]?.message?.content || 'No pude generar una respuesta.'

    // Enviar respuesta al usuario
    await adapter.enviarTexto(respuestaTexto)

    console.log(`   🤖 Respuesta IA generada (${respuestaTexto.length} chars)`)

    return {
      continuar: true,
      variablesActualizadas: {
        ...conversacion.variables,
        [variableDestino]: respuestaTexto
      }
    }
  } catch (error) {
    console.error('Error en respuesta IA:', error)
    await adapter.enviarTexto('Lo siento, hubo un problema generando la respuesta.')
    return { continuar: true }
  }
}
