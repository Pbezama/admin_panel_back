/**
 * Tools del Agente ChatIA
 */

export const tools = [
  {
    type: 'function',
    function: {
      name: 'responder_texto',
      description: 'Responder con texto al usuario. Usar para ideas, sugerencias, explicaciones, brainstorming, análisis, redacción y cualquier conversación.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Respuesta amigable y útil. Puede incluir **negrita**, listas con - , y saltos de línea \\n para formato.'
          }
        },
        required: ['mensaje'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sugerir_delegacion',
      description: 'Sugerir que el Controlador maneje operaciones de BD: agregar, modificar, eliminar datos.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje explicando QUÉ se va a delegar. NUNCA decir "ya quedó guardado".'
          },
          agente_destino: {
            type: 'string',
            enum: ['controlador'],
            description: 'Agente destino'
          },
          razon: {
            type: 'string',
            description: 'Razón de la delegación'
          },
          datos_sugeridos: {
            type: ['object', 'null'],
            description: 'Sugerencia de datos para agregar/modificar',
            properties: {
              categoria: { type: ['string', 'null'] },
              clave: { type: ['string', 'null'] },
              valor: { type: ['string', 'null'] },
              prioridad: { type: ['number', 'null'] }
            },
            required: ['categoria', 'clave', 'valor', 'prioridad'],
            additionalProperties: false
          }
        },
        required: ['mensaje', 'agente_destino', 'razon', 'datos_sugeridos'],
        additionalProperties: false
      }
    }
  }
]

export const toolResponseMapper = {
  responder_texto: (args) => ({
    tipo: 'texto',
    contenido: args.mensaje
  }),

  sugerir_delegacion: (args) => ({
    tipo: 'texto',
    contenido: args.mensaje,
    delegacion: {
      sugerida: true,
      agenteDestino: args.agente_destino,
      razon: args.razon,
      datosParaDelegar: args.datos_sugeridos
    }
  })
}

export default { tools, toolResponseMapper }
