/**
 * Configuración del Agente ChatIA
 */

export const config = {
  id: 'chatia',
  name: 'ChatIA',
  description: 'Asistente creativo para ideación y conversación libre',
  icon: '◆',
  color: '#f59e0b',
  temperature: 0.8,
  canDelegateTo: ['controlador'],
  enabled: true,
  capabilities: [
    'Idear promociones y ofertas',
    'Crear reglas y políticas',
    'Brainstorming creativo',
    'Redacción de textos',
    'Explicaciones y ayuda',
    'Análisis de comentarios'
  ]
}
