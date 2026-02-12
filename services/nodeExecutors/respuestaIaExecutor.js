/**
 * Ejecutor: Nodo Respuesta IA
 * Genera una respuesta usando GPT con contexto del flujo y conocimiento de marca.
 * Interactivo: envia la respuesta y puede esperar input.
 */

import { interpolarVariables } from '../flowEngine'
import { obtenerConocimientoAprobado } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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

  try {
    // Construir contexto para la IA
    let systemPrompt = `Eres un asistente de la marca. Responde de forma concisa y util.`

    if (instrucciones) {
      systemPrompt += `\n\nInstrucciones especificas: ${instrucciones}`
    }

    // Agregar conocimiento de marca si configurado
    if (datos.usar_conocimiento) {
      const conocimiento = await obtenerConocimientoAprobado(conversacion.id_marca)
      if (conocimiento.success && conocimiento.data?.length > 0) {
        const textoConocimiento = conocimiento.data
          .map(k => `[${k.categoria}] ${k.titulo}: ${k.contenido}`)
          .join('\n')
        systemPrompt += `\n\n🧠 CONOCIMIENTO DE MARCA:\n${textoConocimiento}`
      }
    }

    // Agregar variables del flujo como contexto
    if (datos.usar_variables && Object.keys(conversacion.variables).length > 0) {
      const varsTexto = Object.entries(conversacion.variables)
        .filter(([k]) => !k.endsWith('_raw'))
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      systemPrompt += `\n\n📋 DATOS DEL USUARIO:\n${varsTexto}`
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: temperatura,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensaje || 'Responde al usuario' }
      ]
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
