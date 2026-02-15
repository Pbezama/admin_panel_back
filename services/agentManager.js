/**
 * AgentManager - Orquestador de Agentes (Server-side)
 *
 * Versión adaptada para Next.js API Routes.
 * NO usa dangerouslyAllowBrowser.
 */

import { openai, DEFAULT_MODEL } from '@/lib/openai'
import { getAgent } from '@/agents'

/**
 * Clase AgentManager
 */
export class AgentManager {
  constructor() {
    this.currentAgentId = 'controlador'
  }

  setAgent(agentId) {
    const agent = getAgent(agentId)
    const anterior = this.currentAgentId
    this.currentAgentId = agentId
    if (anterior !== agentId) {
      console.log(`🔄 AgentManager: Cambio "${anterior}" → "${agent.config.name}"`)
    }
  }

  getCurrentAgent() {
    return getAgent(this.currentAgentId)
  }

  async processMessage(userMessage, context, historial = []) {
    const agent = this.getCurrentAgent()
    const tiempoInicio = Date.now()

    console.log(`🤖 AgentManager: Procesando con ${agent.config.name}`)
    console.log(`   Tools: ${agent.tools.map(t => t.function.name).join(', ')}`)

    // Construir prompt del agente con contexto
    const systemPrompt = agent.buildPrompt(context)

    // Formatear historial para OpenAI
    const formattedHistory = this.formatHistory(historial)

    // Construir mensajes para OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ]

    console.log(`   📤 Enviando ${messages.length} mensajes a OpenAI...`)

    try {
      const response = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages,
        tools: agent.tools,
        tool_choice: 'required',
        temperature: agent.config.temperature
      })

      const message = response.choices[0].message
      const tiempoTotal = Date.now() - tiempoInicio
      console.log(`   📥 Respuesta en ${tiempoTotal}ms`)

      // Procesar tool_calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0]
        const functionName = toolCall.function.name
        const args = JSON.parse(toolCall.function.arguments)

        console.log(`   🔧 Tool: ${functionName}`)
        console.log(`   📋 Args:`, JSON.stringify(args, null, 2))

        // Usar el mapper del agente
        const mapper = agent.toolResponseMapper[functionName]
        if (mapper) {
          const result = mapper(args)
          result.modoOrigen = this.currentAgentId
          console.log(`   ✅ Tipo: ${result.tipo}`)
          return result
        } else {
          console.warn(`   ⚠️ No hay mapper para "${functionName}"`)
          return {
            tipo: 'error',
            contenido: `Error interno: tool "${functionName}" no tiene mapper.`,
            modoOrigen: this.currentAgentId
          }
        }
      }

      // Fallback
      console.warn('   ⚠️ Sin tool_call, usando content')
      return {
        tipo: 'texto',
        contenido: message.content || 'No pude procesar tu solicitud.',
        modoOrigen: this.currentAgentId
      }

    } catch (error) {
      console.error('❌ AgentManager Error:', error.message)

      if (error.code === 'invalid_api_key') {
        return {
          tipo: 'error',
          contenido: 'Error de configuración: API Key de OpenAI inválida.',
          modoOrigen: this.currentAgentId
        }
      }

      if (error.code === 'rate_limit_exceeded') {
        return {
          tipo: 'error',
          contenido: 'Demasiadas solicitudes. Espera un momento.',
          modoOrigen: this.currentAgentId
        }
      }

      return {
        tipo: 'error',
        contenido: `Error al procesar: ${error.message}`,
        modoOrigen: this.currentAgentId
      }
    }
  }

  formatHistory(historial) {
    if (!historial || historial.length === 0) return []

    return historial
      .slice(-30)
      .map(m => {
        if (m.tipo === 'separador' || m.tipo === 'delegacion') {
          return null
        }

        let contenido = typeof m.contenido === 'string'
          ? m.contenido
          : JSON.stringify(m.contenido)

        // Incluir comentarios completos si existen
        if (m.comentariosCompletos && Array.isArray(m.comentariosCompletos) && m.comentariosCompletos.length > 0) {
          const comentariosTexto = m.comentariosCompletos.map((c, i) => {
            return `${i + 1}. ID:${c.id} | Comentario: "${c.comentario_original || 'N/A'}" | Respuesta: "${c.respuesta_comentario || 'Sin respuesta'}"`
          }).join('\n')
          contenido += `\n\n[COMENTARIOS CONSULTADOS]:\n${comentariosTexto}`
        }

        // Incluir datos de tabla si existen
        if (m.datos) {
          if (m.datos.columnas && m.datos.filas) {
            const tablaTexto = m.datos.filas.slice(0, 10).map(fila => {
              return m.datos.columnas.map((col, i) => `${col}: ${fila[i]}`).join(' | ')
            }).join('\n')
            contenido += `\n\n[TABLA]:\n${tablaTexto}`
          } else if (Array.isArray(m.datos)) {
            const datosTexto = m.datos.slice(0, 5).map(d => JSON.stringify(d)).join('\n')
            contenido += `\n\n[DATOS]: ${datosTexto}`
          }
        }

        // Agregar prefijo si viene de otro agente
        if (m.modoOrigen && m.modoOrigen !== this.currentAgentId) {
          const prefijo = m.modoOrigen === 'chatia' ? '[ChatIA]' : '[Controlador]'
          contenido = `${prefijo} ${contenido}`
        }

        return {
          role: m.rol === 'user' ? 'user' : 'assistant',
          content: contenido
        }
      })
      .filter(Boolean)
  }

  reset() {
    this.currentAgentId = 'controlador'
    console.log('🔄 AgentManager: Reset')
  }
}

// Crear nueva instancia para cada request (stateless)
export const createAgentManager = () => new AgentManager()

export default AgentManager
