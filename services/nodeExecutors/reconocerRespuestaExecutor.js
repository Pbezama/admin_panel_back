/**
 * Ejecutor: Nodo Reconocer Respuesta
 * Usa IA (GPT-4o-mini) para clasificar el mensaje del usuario en una de las
 * salidas configuradas y extraer datos especificos del texto.
 * Auto-ejecutable: no envia mensajes al usuario, solo clasifica.
 */

import { interpolarVariables } from '../flowEngine'
import { obtenerMensajesFlujo } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: bool, salidaIA: string, variablesActualizadas: object }
 */
export async function ejecutarReconocerRespuesta(nodo, contexto) {
  const { conversacion, mensaje } = contexto
  const variables = conversacion.variables || {}
  const datos = nodo.datos || {}

  const variableOrigen = datos.variable_origen || 'ultima_respuesta'
  const textoAnalizar = variables[variableOrigen] || mensaje || ''
  const instrucciones = interpolarVariables(datos.instrucciones || '', variables)
  const salidas = datos.salidas || []
  const extracciones = datos.extracciones || []
  const temperatura = datos.temperatura || 0.3
  const usarContexto = datos.usar_contexto_completo !== false

  if (!salidas.length) {
    console.warn('   ⚠️ reconocer_respuesta sin salidas configuradas')
    return { continuar: true, salidaIA: '' }
  }

  const salidasIds = salidas.map(s => s.id)

  // Construir prompt de clasificacion
  const salidasDesc = salidas
    .map(s => `- "${s.id}": ${s.descripcion || s.id}`)
    .join('\n')

  let extraccionesDesc = ''
  if (extracciones.length) {
    const extLines = extracciones
      .filter(e => e.variable)
      .map(e => `- "${e.variable}": ${e.instruccion || 'extraer si aparece'}`)
    if (extLines.length) {
      extraccionesDesc = '\n\nDATOS A EXTRAER del texto:\n' + extLines.join('\n')
    }
  }

  let systemPrompt = `Eres un analizador de texto experto. Tu tarea es:
1. Clasificar el mensaje del usuario en UNA de las salidas posibles
2. Extraer informacion especifica del mensaje si esta presente

INSTRUCCIONES: ${instrucciones}

SALIDAS POSIBLES (elige exactamente UNA de estas):
${salidasDesc}
${extraccionesDesc}

Responde SOLO en formato JSON valido:
{"salida": "id_de_la_salida_elegida", "extracciones": {"nombre_variable": "valor extraido o null"}, "razonamiento": "breve explicacion"}`

  // Agregar variables del flujo como contexto adicional
  const varsTexto = Object.entries(variables)
    .filter(([k]) => !k.endsWith('_raw'))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  if (varsTexto) {
    systemPrompt += `\n\nVARIABLES ACTUALES DEL FLUJO:\n${varsTexto}`
  }

  const messages = [{ role: 'system', content: systemPrompt }]

  // Contexto de conversacion completo
  if (usarContexto && conversacion.id) {
    try {
      const msgResult = await obtenerMensajesFlujo(conversacion.id)
      if (msgResult.success && msgResult.data?.length > 0) {
        const historial = msgResult.data
          .slice(-20)
          .map(m => `${m.direccion === 'entrante' ? 'Cliente' : 'Bot'}: ${m.contenido}`)
          .join('\n')
        messages.push({
          role: 'user',
          content: `HISTORIAL DE CONVERSACION:\n${historial}\n\nULTIMO MENSAJE A ANALIZAR:\n${textoAnalizar}`
        })
      } else {
        messages.push({ role: 'user', content: textoAnalizar || '(sin texto)' })
      }
    } catch {
      messages.push({ role: 'user', content: textoAnalizar || '(sin texto)' })
    }
  } else {
    messages.push({ role: 'user', content: textoAnalizar || '(sin texto)' })
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: temperatura,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages
    })

    const resultado = JSON.parse(response.choices[0].message.content)
    let salidaElegida = resultado.salida || ''
    const extraccionesResultado = resultado.extracciones || {}

    // Validar que la salida elegida existe
    if (!salidasIds.includes(salidaElegida)) {
      console.warn(`   ⚠️ IA eligio salida desconocida '${salidaElegida}', usando primera`)
      salidaElegida = salidasIds[0]
    }

    // Actualizar variables con extracciones
    const nuevasVars = { ...variables }
    for (const [varName, varValue] of Object.entries(extraccionesResultado)) {
      if (varValue !== null && String(varValue).toLowerCase() !== 'null' && varValue !== '') {
        nuevasVars[varName] = String(varValue)
      }
    }

    console.log(`   🧠 reconocer_respuesta: salida='${salidaElegida}', extracciones=${JSON.stringify(extraccionesResultado)}`)

    return {
      continuar: true,
      salidaIA: salidaElegida,
      variablesActualizadas: nuevasVars
    }
  } catch (error) {
    console.error('   ❌ Error en reconocer_respuesta:', error.message)
    // Fallback: primera salida
    return {
      continuar: true,
      salidaIA: salidasIds[0] || ''
    }
  }
}
