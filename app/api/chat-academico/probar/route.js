/**
 * API: /api/chat-academico/probar
 * POST - Probar el chatbot con la config actual (NO envia por WhatsApp)
 * Body: { mensaje, historial: [{role, content}] }
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  obtenerChatAcademicoConfig,
  obtenerChatAcademicoHerramientas
} from '@/lib/supabase'
import { openai } from '@/lib/openai'

function construirSystemPrompt(config) {
  const partes = []
  if (config.prompt_rol) partes.push(`# Rol\n${config.prompt_rol}`)
  if (config.prompt_estilo) partes.push(`## Estilo de Respuesta\n${config.prompt_estilo}`)
  if (config.prompt_reglas) partes.push(`## Reglas de Comunicación\n${config.prompt_reglas}`)
  if (config.prompt_consideraciones) partes.push(`## Consideraciones Específicas\n${config.prompt_consideraciones}`)
  return partes.join('\n\n')
}

function construirToolsOpenAI(herramientas) {
  return herramientas.map(h => ({
    type: 'function',
    function: {
      name: h.nombre,
      description: h.descripcion,
      parameters: h.parametros_openai || { type: 'object', properties: {} }
    }
  }))
}

function ejecutarToolLocal(herramienta, args) {
  const tipo = herramienta.tipo
  if (tipo === 'respuesta_fija') {
    return herramienta.respuesta_texto || '(sin respuesta configurada)'
  }
  if (tipo === 'google_sheets') {
    return `[MODO PRUEBA] La herramienta "${herramienta.nombre_display}" buscaria en Google Sheets con: ${JSON.stringify(args)}. En produccion retorna datos reales del alumno.`
  }
  if (tipo === 'custom_python') {
    return `[MODO PRUEBA] La herramienta "${herramienta.nombre_display}" ejecutaria logica Python. Respuesta configurada: ${herramienta.respuesta_texto || '(ejecuta codigo en PythonAnywhere)'}`
  }
  if (tipo === 'flujo') {
    return `[MODO PRUEBA] Se ejecutaria el flujo asociado.`
  }
  return '(herramienta sin tipo reconocido)'
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json()
    const { mensaje, historial = [] } = body

    if (!mensaje) {
      return NextResponse.json({ error: 'mensaje es requerido' }, { status: 400 })
    }

    // Cargar config y herramientas
    const [resConfig, resTools] = await Promise.all([
      obtenerChatAcademicoConfig(idMarca),
      obtenerChatAcademicoHerramientas(idMarca)
    ])

    if (!resConfig.success || !resConfig.data) {
      return NextResponse.json({ error: 'Config no encontrada' }, { status: 404 })
    }

    const config = resConfig.data
    const herramientas = (resTools.data || []).filter(h => h.activo)

    // Construir mensajes
    const systemPrompt = construirSystemPrompt(config)
    const tools = herramientas.length > 0 ? construirToolsOpenAI(herramientas) : undefined

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historial,
      { role: 'user', content: mensaje }
    ]

    // Llamada 1 a OpenAI
    const payload = {
      model: 'gpt-4o',
      messages,
      temperature: config.temperatura || 0.7,
      max_tokens: config.max_tokens || 1500,
    }
    if (tools && tools.length > 0) {
      payload.tools = tools
      payload.parallel_tool_calls = config.parallel_tool_calls !== false
    }

    const response = await openai.chat.completions.create(payload)
    const assistantMessage = response.choices[0].message
    const toolCallsLog = []

    // Si hay tool calls, ejecutarlas y hacer followup
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const followupMessages = [...messages, assistantMessage]

      for (const call of assistantMessage.tool_calls) {
        const toolName = call.function.name
        let args = {}
        try { args = JSON.parse(call.function.arguments) } catch {}

        const herramienta = herramientas.find(h => h.nombre === toolName)
        let resultado = herramienta
          ? ejecutarToolLocal(herramienta, args)
          : `Herramienta "${toolName}" no encontrada`

        toolCallsLog.push({
          nombre: toolName,
          nombre_display: herramienta?.nombre_display || toolName,
          tipo: herramienta?.tipo || 'desconocido',
          argumentos: args,
          resultado
        })

        followupMessages.push({
          role: 'tool',
          content: typeof resultado === 'string' ? resultado : JSON.stringify(resultado),
          tool_call_id: call.id
        })
      }

      // Llamada 2: followup con resultados de tools
      const followupPayload = {
        model: 'gpt-4o',
        messages: followupMessages,
        temperature: config.temperatura || 0.7,
        max_tokens: config.max_tokens || 1500,
      }
      if (tools && tools.length > 0) {
        followupPayload.tools = tools
        followupPayload.parallel_tool_calls = config.parallel_tool_calls !== false
      }

      const followupResponse = await openai.chat.completions.create(followupPayload)
      const finalMessage = followupResponse.choices[0].message

      return NextResponse.json({
        success: true,
        respuesta: finalMessage.content || '',
        tool_calls: toolCallsLog,
        historial_actualizado: [
          ...historial,
          { role: 'user', content: mensaje },
          { role: 'assistant', content: finalMessage.content || '' }
        ]
      })
    }

    // Sin tool calls - respuesta directa
    return NextResponse.json({
      success: true,
      respuesta: assistantMessage.content || '',
      tool_calls: [],
      historial_actualizado: [
        ...historial,
        { role: 'user', content: mensaje },
        { role: 'assistant', content: assistantMessage.content || '' }
      ]
    })

  } catch (error) {
    console.error('Error POST /api/chat-academico/probar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
