/**
 * API: /api/chat-academico/probar
 * POST - Probar el chatbot con la config actual (NO envia por WhatsApp)
 * Replica EXACTA de la logica de BOT_PRUEBAS.py / chatacademico.py
 *
 * Body: { mensaje, historial: [{role, content}] }
 *
 * Ejecuta tools REALES:
 *   - respuesta_fija: retorna respuesta_texto
 *   - google_sheets: consulta real a Google Sheets (obtenerDatosAlumno*)
 *   - custom_python: ejecuta logica equivalente (derivarConsultaAHumano)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  obtenerChatAcademicoConfig,
  obtenerChatAcademicoHerramientas
} from '@/lib/supabase'
import { openai } from '@/lib/openai'
import {
  obtenerDatosAlumnoDesdeSheets,
  obtenerDatosAlumnoPorRutDesdeSheets
} from '@/lib/google-sheets-preucv'

// --- System Prompt: replica exacta de ca_config.construir_system_prompt() ---
function construirSystemPrompt(config) {
  const partes = []
  if (config.prompt_rol) partes.push(`# Rol\n${config.prompt_rol}`)
  if (config.prompt_estilo) partes.push(`## Estilo de Respuesta\n${config.prompt_estilo}`)
  if (config.prompt_reglas) partes.push(`## Reglas de Comunicación\n${config.prompt_reglas}`)
  if (config.prompt_consideraciones) partes.push(`## Consideraciones Específicas\n${config.prompt_consideraciones}`)
  return partes.join('\n\n')
}

// --- Tools OpenAI: replica exacta de ca_config.construir_tools_openai() ---
function construirToolsOpenAI(herramientas) {
  return herramientas.map(h => ({
    type: 'function',
    function: {
      name: h.nombre,
      description: h.descripcion,
      parameters: h.parametros_openai || { type: 'object', properties: {}, required: [], additionalProperties: false }
    }
  }))
}

// --- Mapeo de funciones reales (equivalente a funciones_python en chatacademico.py) ---
const FUNCIONES_REALES = {
  obtenerDatosAlumnoDesdeSheets: async (args) => {
    const telefono = args.telefono || ''
    if (!telefono) return 'No se proporcionó número de teléfono.'
    return await obtenerDatosAlumnoDesdeSheets(telefono)
  },
  obtenerDatosAlumnoPorRutDesdeSheets: async (args) => {
    const rut = args.rut || ''
    if (!rut) return 'No se proporcionó RUT.'
    return await obtenerDatosAlumnoPorRutDesdeSheets(rut)
  },
  derivarConsultaAHumano: async () => {
    return 'Lo siento, no he podido resolver tu consulta. Estoy derivando tu caso a uno de nuestro equipo para que te asista.'
  }
}

/**
 * Ejecuta una herramienta - replica exacta de ca_config.ejecutar_herramienta()
 */
async function ejecutarTool(herramienta, args) {
  const tipo = herramienta.tipo || 'respuesta_fija'
  const nombre = herramienta.nombre

  // Tipo respuesta_fija: retorna texto directo (igual que Python)
  if (tipo === 'respuesta_fija') {
    return herramienta.respuesta_texto || '(sin respuesta configurada)'
  }

  // Tipo google_sheets o custom_python: ejecuta funcion real si existe
  if (tipo === 'google_sheets' || tipo === 'custom_python') {
    if (FUNCIONES_REALES[nombre]) {
      try {
        return await FUNCIONES_REALES[nombre](args)
      } catch (e) {
        console.error(`[ChatAcademico] Error ejecutando ${nombre}:`, e.message)
        return `Error ejecutando la herramienta: ${e.message}`
      }
    }
    // Fallback si no hay funcion mapeada (igual que Python)
    return herramienta.respuesta_texto || `Herramienta ${nombre} no disponible`
  }

  if (tipo === 'flujo') {
    return 'Funcionalidad de flujo no disponible aun'
  }

  return `Tipo de herramienta desconocido: ${tipo}`
}

// --- Actividades semanales (replica del system_message_bot_Actividades de Python) ---
const ACTIVIDADES_SEMANALES = `Información de la semana:
####
#ACTIVIDADES
        Todas las actividades son informadas y detalladas mediante correo electronico

        ##Programa anual-Esencial
        %%%%
        Semana del 28 de abril

        -Seguimos Clases anuales 2025 - sesión n3 conexión, asistencia y agendamiento de clases. (L- M1- H- Cs) No olvides agendar tus clases!

        EXTRAS
        -ENTREGABLE: Planificación 2026 Organiza tu preparación desde ya!- Planifica tu camino hacia la admisión 2026.

        CHARLAS
        -Listo para lograr tus objetivos? Inscribete en la charla "El poder de las metas" - Define y conquista tus objetivos.

        %%%%
        ##Programa anual- Orientación-Pro
        %%%%
        Semana del 28 de abril

         -Seguimos Clases anuales 2025 - sesión n3 conexión, asistencia y agendamiento de clases. (L- M1- H- Cs) No olvides agendar tus clases!

        EXTRAS
        -ENTREGABLE: Planificación 2026 Organiza tu preparación desde ya!- Planifica tu camino hacia la admisión 2026.
        -ULTIMO LLAMADO! Agenda tu sesion con tu coach estrategico- Etapa MTD.

        CHARLAS
        -Listo para lograr tus objetivos? Inscribete en la charla "El poder de las metas" - Define y conquista tus objetivos.

        %%%%

        ##Programa Duo o Anticipa 2025
        %%%%
        Semana del 28 de abril

        -Seguimos clases anual 2025- Sesión n2. No olvides agendar tus clases! Para clases anulaes LEN/MAT

        EXTRAS
        -ULTIMO LLAMADO! Agenda tu sesion con tu coach estrategico- Etapa MTD.

        CHARLAS
        -Listo para lograr tus objetivos? Inscribete en la charla "El poder de las metas" - Define y conquista tus objetivos.

        %%%%

        ##Programa UP media 2025
        %%%%
        Semana del 28 de abril

        -Información clave: Evaluacion N1 LEN/MAT - Modulo Up media ¡Vamos con todo!

        EXTRAS
        -ULTIMO LLAMADO! Agenda tu sesion de orientación vocacional - Etapa plan explora.

        %%%%

####`

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

    // =========================================================
    // 1. Cargar config y herramientas (igual que Python linea 83-84)
    // =========================================================
    const [resConfig, resTools] = await Promise.all([
      obtenerChatAcademicoConfig(idMarca),
      obtenerChatAcademicoHerramientas(idMarca)
    ])

    if (!resConfig.success || !resConfig.data) {
      return NextResponse.json({ error: 'Config no encontrada' }, { status: 404 })
    }

    const config = resConfig.data
    const herramientas = (resTools.data || []).filter(h => h.activo)

    // =========================================================
    // 2. Construir system prompt + tools (igual que Python linea 105-106)
    // =========================================================
    const systemPrompt = construirSystemPrompt(config)
    const tools = herramientas.length > 0 ? construirToolsOpenAI(herramientas) : undefined

    // Construir mensajes con 2 system messages (igual que Python linea 515-516)
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: ACTIVIDADES_SEMANALES },
      ...historial,
      { role: 'user', content: mensaje }
    ]

    // =========================================================
    // 3. Llamada 1 a GPT-4o (igual que Python linea 550-566)
    // =========================================================
    const payload = {
      model: 'gpt-4o',
      messages,
      temperature: parseFloat(config.temperatura) || 0.7,
      max_tokens: parseInt(config.max_tokens) || 1500,
    }
    if (tools && tools.length > 0) {
      payload.tools = tools
      payload.parallel_tool_calls = config.parallel_tool_calls !== false
    }

    // =========================================================
    // 4. Loop multitarea: ejecuta tools en PARALELO, itera hasta
    //    que GPT responda sin tools (max 10 iteraciones de seguridad)
    // =========================================================
    const MAX_ITERACIONES = 10
    const toolCallsLog = []
    let currentMessages = [...messages]
    let iteracion = 0
    let finalContent = ''

    while (iteracion < MAX_ITERACIONES) {
      iteracion++
      console.log(`[ChatAcademico-Probar] Iteracion ${iteracion}: enviando a GPT-4o`)

      const iterPayload = {
        model: 'gpt-4o',
        messages: currentMessages,
        temperature: parseFloat(config.temperatura) || 0.7,
        max_tokens: parseInt(config.max_tokens) || 1500,
      }
      if (tools && tools.length > 0) {
        iterPayload.tools = tools
        iterPayload.parallel_tool_calls = config.parallel_tool_calls !== false
      }

      const iterResponse = await openai.chat.completions.create(iterPayload)
      const iterMessage = iterResponse.choices[0].message

      // Si NO hay tool calls, tenemos la respuesta final
      if (!iterMessage.tool_calls || iterMessage.tool_calls.length === 0) {
        finalContent = iterMessage.content || ''
        console.log(`[ChatAcademico-Probar] Respuesta final en iteracion ${iteracion}`)
        break
      }

      // Hay tool calls: agregar mensaje del asistente al historial
      currentMessages.push(iterMessage)

      console.log(`[ChatAcademico-Probar] ${iterMessage.tool_calls.length} tool(s) en iteracion ${iteracion}`)

      // Ejecutar TODAS las tools en PARALELO
      const toolPromises = iterMessage.tool_calls.map(async (call) => {
        const toolName = call.function.name
        let args = {}
        try { args = JSON.parse(call.function.arguments) } catch {}

        console.log(`[ChatAcademico-Probar] Tool: ${toolName} args=${JSON.stringify(args)}`)

        const herramienta = herramientas.find(h => h.nombre === toolName)
        let resultado

        if (herramienta) {
          resultado = await ejecutarTool(herramienta, args)
        } else {
          resultado = `Herramienta '${toolName}' no encontrada`
          console.warn(`[ChatAcademico-Probar] WARN: ${resultado}`)
        }

        const resultadoStr = typeof resultado === 'string' ? resultado : JSON.stringify(resultado)

        toolCallsLog.push({
          nombre: toolName,
          nombre_display: herramienta?.nombre_display || toolName,
          tipo: herramienta?.tipo || 'desconocido',
          argumentos: args,
          resultado: resultadoStr
        })

        return {
          role: 'tool',
          content: resultadoStr,
          tool_call_id: call.id
        }
      })

      // Esperar que TODAS terminen en paralelo
      const toolResults = await Promise.all(toolPromises)

      // Agregar todos los resultados al historial
      currentMessages.push(...toolResults)

      // El loop continua: GPT recibe los resultados y puede pedir mas tools o responder
    }

    if (iteracion >= MAX_ITERACIONES && !finalContent) {
      finalContent = '(Se alcanzó el límite de iteraciones de herramientas)'
    }

    return NextResponse.json({
      success: true,
      respuesta: finalContent,
      tool_calls: toolCallsLog,
      historial_actualizado: [
        ...historial,
        { role: 'user', content: mensaje },
        { role: 'assistant', content: finalContent }
      ]
    })

  } catch (error) {
    console.error('Error POST /api/chat-academico/probar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
