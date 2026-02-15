/**
 * Configuracion del Agente Creador de Flujos
 */

export const config = {
  id: 'creador-flujos',
  name: 'Creador de Flujos',
  description: 'Asistente IA para crear flujos conversacionales a partir de una descripcion',
  icon: '⚡',
  color: '#8b5cf6',
  temperature: 0.6,
  canDelegateTo: [],
  enabled: true,
  capabilities: [
    'Crear flujos conversacionales completos',
    'Preguntar requisitos del flujo',
    'Generar nodos y conexiones automaticamente'
  ]
}
