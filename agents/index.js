/**
 * Registro Central de Agentes
 */

import controlador from './controlador/index.js'
import chatia from './chatia/index.js'

// Registro de todos los agentes disponibles
export const agents = {
  controlador,
  chatia
}

/**
 * Obtiene un agente por su ID
 */
export const getAgent = (agentId) => {
  const agent = agents[agentId]
  if (!agent) {
    throw new Error(`Agente "${agentId}" no encontrado. Agentes disponibles: ${Object.keys(agents).join(', ')}`)
  }
  return agent
}

/**
 * Obtiene la lista de agentes disponibles
 */
export const getAvailableAgents = (includeDisabled = false) => {
  return Object.values(agents)
    .filter(a => includeDisabled || a.config.enabled !== false)
    .map(a => ({
      id: a.config.id,
      name: a.config.name,
      description: a.config.description,
      icon: a.config.icon,
      color: a.config.color,
      capabilities: a.config.capabilities || []
    }))
}

/**
 * Obtiene las tools de un agente específico
 */
export const getAgentTools = (agentId) => {
  const agent = getAgent(agentId)
  return agent.tools || []
}

/**
 * Verifica si un agente puede delegar a otro
 */
export const canDelegate = (fromAgentId, toAgentId) => {
  const agent = getAgent(fromAgentId)
  return agent.config.canDelegateTo?.includes(toAgentId) || false
}
