/**
 * Tools del Agente Analizador
 */

export const analizadorTools = [
  {
    type: 'function',
    function: {
      name: 'generar_conocimiento_y_reglas',
      description: 'Genera el mapa de conocimiento unificado y las reglas BDM propuestas',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          conocimiento: {
            type: 'array',
            description: 'Mapa de conocimiento unificado de la marca',
            items: {
              type: 'object',
              properties: {
                categoria: {
                  type: 'string',
                  enum: ['identidad', 'productos', 'servicios', 'precios', 'publico_objetivo', 'tono_voz', 'competencia', 'promociones', 'horarios', 'politicas', 'contenido', 'faq', 'otro']
                },
                titulo: {
                  type: 'string',
                  description: 'Título claro del conocimiento'
                },
                contenido: {
                  type: 'string',
                  description: 'Contenido completo y detallado'
                },
                confianza: {
                  type: 'integer',
                  description: 'Score de confianza 0-100'
                }
              },
              required: ['categoria', 'titulo', 'contenido', 'confianza'],
              additionalProperties: false
            }
          },
          reglas_propuestas: {
            type: 'array',
            description: 'Reglas BDM propuestas para base_cuentas',
            items: {
              type: 'object',
              properties: {
                categoria: {
                  type: 'string',
                  enum: ['prompt', 'regla', 'info', 'precio', 'promocion', 'horario', 'estilo_respuesta', 'observacion']
                },
                clave: {
                  type: 'string',
                  description: 'Identificador corto y descriptivo (ej: saludo_inicial, precio_hamburguesa)'
                },
                valor: {
                  type: 'string',
                  description: 'Contenido completo de la regla'
                },
                prioridad: {
                  type: 'integer',
                  description: 'Prioridad 1-6 (1=obligatorio, 6=complementario)'
                }
              },
              required: ['categoria', 'clave', 'valor', 'prioridad'],
              additionalProperties: false
            }
          }
        },
        required: ['conocimiento', 'reglas_propuestas'],
        additionalProperties: false
      }
    }
  }
]
