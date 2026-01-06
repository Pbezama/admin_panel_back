/**
 * BaseAgent - Clase base para agentes
 *
 * Provee estructura común y validaciones para todos los agentes.
 */

/**
 * Valida que un agente tenga la estructura correcta
 * @param {Object} agent - Agente a validar
 * @returns {boolean}
 */
export const validateAgent = (agent) => {
  const requiredFields = ['config', 'buildPrompt', 'tools', 'toolResponseMapper']
  const missingFields = requiredFields.filter(field => !agent[field])

  if (missingFields.length > 0) {
    console.error(`Agente inválido. Campos faltantes: ${missingFields.join(', ')}`)
    return false
  }

  const requiredConfig = ['id', 'name', 'icon', 'temperature']
  const missingConfig = requiredConfig.filter(field => agent.config[field] === undefined)

  if (missingConfig.length > 0) {
    console.error(`Config del agente inválida. Campos faltantes: ${missingConfig.join(', ')}`)
    return false
  }

  return true
}

export const AgentStructure = {
  config: {
    id: 'string',
    name: 'string',
    description: 'string',
    icon: 'string',
    color: 'string',
    temperature: 0.7,
    canDelegateTo: [],
    capabilities: [],
    enabled: true
  },
  buildPrompt: (context) => '',
  tools: [],
  toolResponseMapper: {}
}

export default {
  validateAgent,
  AgentStructure
}
