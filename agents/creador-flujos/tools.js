/**
 * Tools del Agente Creador de Flujos
 *
 * Dos herramientas:
 * 1. hacer_pregunta - Pregunta aclaratoria al usuario
 * 2. generar_flujo  - Genera el flujo completo (nodos + edges)
 */

export const tools = [
  {
    type: 'function',
    function: {
      name: 'hacer_pregunta',
      description: 'Hacer una pregunta aclaratoria al usuario para entender mejor que flujo necesita. Opcionalmente incluir opciones clickeables.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          pregunta: {
            type: 'string',
            description: 'La pregunta para el usuario, en espanol, tono cercano.'
          },
          opciones: {
            type: ['array', 'null'],
            items: { type: 'string' },
            description: 'Lista de opciones sugeridas (2-5). null si la pregunta es abierta.'
          }
        },
        required: ['pregunta', 'opciones'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generar_flujo',
      description: 'Generar el flujo conversacional completo con todos los nodos y conexiones. Usar SOLO despues de haber hecho suficientes preguntas (minimo 3).',
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Resumen amigable del flujo generado para el usuario.'
          },
          nodos: {
            type: 'array',
            description: 'Array de nodos del flujo (sin posiciones, sin nodo inicio).',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'ID unico, ej: node_saludo, node_pregunta_nombre' },
                tipo: {
                  type: 'string',
                  enum: ['mensaje', 'pregunta', 'condicion', 'guardar_variable', 'guardar_bd', 'buscar_conocimiento', 'respuesta_ia', 'crear_tarea', 'transferir_humano', 'agendar_cita', 'esperar', 'fin']
                },
                datos: {
                  type: 'object',
                  description: 'Datos especificos del tipo de nodo.'
                }
              },
              required: ['id', 'tipo', 'datos']
            }
          },
          edges: {
            type: 'array',
            description: 'Array de conexiones entre nodos.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                origen: { type: 'string', description: 'ID del nodo de origen' },
                destino: { type: 'string', description: 'ID del nodo de destino' },
                condicion: {
                  description: 'Condicion de la conexion. null para conexion simple.',
                  oneOf: [
                    { type: 'null' },
                    {
                      type: 'object',
                      properties: {
                        tipo: {
                          type: 'string',
                          enum: ['respuesta_exacta', 'respuesta_contiene', 'boton', 'variable_igual', 'variable_existe', 'regex', 'resultado_true', 'resultado_false', 'default']
                        },
                        valor: { type: ['string', 'null'] },
                        variable: { type: ['string', 'null'] }
                      },
                      required: ['tipo']
                    }
                  ]
                }
              },
              required: ['id', 'origen', 'destino', 'condicion']
            }
          },
          variables_schema: {
            type: 'object',
            description: 'Mapa de variables usadas en el flujo con tipo y descripcion.'
          }
        },
        required: ['mensaje', 'nodos', 'edges', 'variables_schema']
      }
    }
  }
]

export const toolResponseMapper = {
  hacer_pregunta: (args) => ({
    tipo: 'pregunta_ia',
    contenido: args.pregunta,
    opciones: args.opciones || null
  }),

  generar_flujo: (args) => ({
    tipo: 'flujo_generado',
    contenido: args.mensaje,
    flujo: {
      nodos: args.nodos,
      edges: args.edges,
      variables_schema: args.variables_schema || {}
    }
  })
}
