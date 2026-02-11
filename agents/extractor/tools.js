/**
 * Tools del Agente Extractor
 */

export const extractorTools = [
  {
    type: 'function',
    function: {
      name: 'extraer_datos',
      description: 'Retorna los datos estructurados extraídos del documento',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          resumen: {
            type: 'string',
            description: 'Resumen breve (2-3 oraciones) de qué trata el documento'
          },
          datos_extraidos: {
            type: 'array',
            description: 'Lista de datos extraídos del documento',
            items: {
              type: 'object',
              properties: {
                categoria: {
                  type: 'string',
                  enum: ['identidad', 'productos', 'servicios', 'precios', 'publico_objetivo', 'tono_voz', 'competencia', 'promociones', 'horarios', 'politicas', 'contenido', 'faq', 'otro'],
                  description: 'Categoría del dato'
                },
                titulo: {
                  type: 'string',
                  description: 'Título corto del dato (ej: "Horario de atención", "Producto: Hamburguesa clásica")'
                },
                contenido: {
                  type: 'string',
                  description: 'Contenido completo del dato con toda la información relevante'
                },
                confianza: {
                  type: 'integer',
                  description: 'Score de confianza 0-100. 90+: dato explícito y claro. 70-89: inferido con alta certeza. 50-69: inferido con certeza media.'
                }
              },
              required: ['categoria', 'titulo', 'contenido', 'confianza'],
              additionalProperties: false
            }
          }
        },
        required: ['resumen', 'datos_extraidos'],
        additionalProperties: false
      }
    }
  }
]
