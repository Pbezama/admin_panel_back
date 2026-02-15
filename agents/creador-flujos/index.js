/**
 * Agente Creador de Flujos
 */

import { config } from './config.js'
import { buildPrompt } from './prompt.js'
import { tools, toolResponseMapper } from './tools.js'

export default {
  config,
  buildPrompt,
  tools,
  toolResponseMapper
}
