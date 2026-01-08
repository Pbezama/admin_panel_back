/**
 * Tools del Agente Controlador
 *
 * Todas las tools usan strict: true y additionalProperties: false
 * para garantizar JSON válido desde OpenAI.
 */

/**
 * Tools disponibles para el Controlador
 * Cada tool mapea a un tipo de respuesta del frontend
 */
export const tools = [
  // 1. RESPONDER TEXTO - Conversación normal
  {
    type: 'function',
    function: {
      name: 'responder_texto',
      description: 'Responder con texto conversacional al usuario. Usar para saludos, explicaciones, preguntas aclaratorias, o cuando no se requiere acción en BD.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje amigable para el usuario. Puede incluir **negrita** y saltos de línea \\n para formato.'
          }
        },
        required: ['mensaje'],
        additionalProperties: false
      }
    }
  },

  // 2. MOSTRAR DATOS - Tablas
  {
    type: 'function',
    function: {
      name: 'mostrar_datos',
      description: 'Mostrar datos de la marca en formato tabla. IMPORTANTE: Usar los IDs reales de la base de datos que aparecen como [ID:XX].',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje introductorio para la tabla'
          },
          columnas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nombres de columnas. Típicamente: ID, Categoría, Clave, Valor, Prioridad, Vigencia'
          },
          filas: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' }
            },
            description: 'Filas de datos. Cada fila es un array de strings en el mismo orden que las columnas.'
          }
        },
        required: ['mensaje', 'columnas', 'filas'],
        additionalProperties: false
      }
    }
  },

  // 3. PEDIR CONFIRMACIÓN - Antes de CRUD
  {
    type: 'function',
    function: {
      name: 'pedir_confirmacion',
      description: 'Solicitar confirmación al usuario ANTES de agregar/modificar/desactivar. OBLIGATORIO para cualquier cambio en la base de datos.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Resumen legible del cambio propuesto. Incluir qué se va a hacer y con qué datos.'
          },
          accion: {
            type: 'string',
            enum: ['agregar', 'modificar', 'desactivar'],
            description: 'Tipo de acción a confirmar'
          },
          parametros: {
            type: 'object',
            properties: {
              categoria: {
                type: ['string', 'null'],
                description: 'Categoría del dato: prompt, promocion, regla, horario, info, precio, estilo_respuesta, observacion'
              },
              clave: {
                type: ['string', 'null'],
                description: 'Nombre/título del dato'
              },
              valor: {
                type: ['string', 'null'],
                description: 'Contenido/descripción del dato'
              },
              prioridad: {
                type: ['number', 'null'],
                description: 'Prioridad 1-6 (1=obligatorio, 6=opcional)'
              },
              id_fila: {
                type: ['number', 'null'],
                description: 'ID del registro a modificar/desactivar. DEBE ser un ID real existente.'
              },
              fecha_inicio: {
                type: ['string', 'null'],
                description: 'Fecha de inicio en formato YYYY-MM-DD (requerido para promociones)'
              },
              fecha_caducidad: {
                type: ['string', 'null'],
                description: 'Fecha de caducidad en formato YYYY-MM-DD (requerido para promociones)'
              },
              updates: {
                type: ['object', 'null'],
                description: 'Para modificar: objeto con campos a actualizar',
                properties: {
                  prioridad: {
                    type: ['number', 'null'],
                    description: 'Nueva prioridad 1-6'
                  },
                  fecha_caducidad: {
                    type: ['string', 'null'],
                    description: 'Nueva fecha caducidad YYYY-MM-DD'
                  },
                  fecha_inicio: {
                    type: ['string', 'null'],
                    description: 'Nueva fecha inicio YYYY-MM-DD'
                  },
                  valor: {
                    type: ['string', 'null'],
                    description: 'Nuevo valor/contenido'
                  },
                  clave: {
                    type: ['string', 'null'],
                    description: 'Nueva clave/título'
                  },
                  categoria: {
                    type: ['string', 'null'],
                    description: 'Nueva categoría'
                  }
                },
                required: ['prioridad', 'fecha_caducidad', 'fecha_inicio', 'valor', 'clave', 'categoria'],
                additionalProperties: false
              }
            },
            required: ['categoria', 'clave', 'valor', 'prioridad', 'id_fila', 'fecha_inicio', 'fecha_caducidad', 'updates'],
            additionalProperties: false
          }
        },
        required: ['mensaje', 'accion', 'parametros'],
        additionalProperties: false
      }
    }
  },

  // 4. EJECUTAR ACCIÓN - Después de confirmación
  {
    type: 'function',
    function: {
      name: 'ejecutar_accion',
      description: 'Ejecutar acción YA CONFIRMADA por el usuario. SOLO usar cuando el usuario dijo sí/ok/dale/confirmo/hazlo después de pedir_confirmacion.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje breve indicando que se procesa la acción'
          },
          accion: {
            type: 'string',
            enum: ['agregar', 'modificar', 'desactivar'],
            description: 'Tipo de acción a ejecutar'
          },
          parametros: {
            type: 'object',
            properties: {
              categoria: {
                type: ['string', 'null'],
                description: 'Categoría del dato'
              },
              clave: {
                type: ['string', 'null'],
                description: 'Nombre/título del dato'
              },
              valor: {
                type: ['string', 'null'],
                description: 'Contenido del dato'
              },
              prioridad: {
                type: ['number', 'null'],
                description: 'Prioridad 1-6'
              },
              id_fila: {
                type: ['number', 'null'],
                description: 'ID del registro'
              },
              fecha_inicio: {
                type: ['string', 'null'],
                description: 'Fecha inicio YYYY-MM-DD'
              },
              fecha_caducidad: {
                type: ['string', 'null'],
                description: 'Fecha caducidad YYYY-MM-DD'
              },
              updates: {
                type: ['object', 'null'],
                description: 'Campos a actualizar',
                properties: {
                  prioridad: {
                    type: ['number', 'null'],
                    description: 'Nueva prioridad 1-6'
                  },
                  fecha_caducidad: {
                    type: ['string', 'null'],
                    description: 'Nueva fecha caducidad YYYY-MM-DD'
                  },
                  fecha_inicio: {
                    type: ['string', 'null'],
                    description: 'Nueva fecha inicio YYYY-MM-DD'
                  },
                  valor: {
                    type: ['string', 'null'],
                    description: 'Nuevo valor/contenido'
                  },
                  clave: {
                    type: ['string', 'null'],
                    description: 'Nueva clave/título'
                  },
                  categoria: {
                    type: ['string', 'null'],
                    description: 'Nueva categoría'
                  }
                },
                required: ['prioridad', 'fecha_caducidad', 'fecha_inicio', 'valor', 'clave', 'categoria'],
                additionalProperties: false
              }
            },
            required: ['categoria', 'clave', 'valor', 'prioridad', 'id_fila', 'fecha_inicio', 'fecha_caducidad', 'updates'],
            additionalProperties: false
          }
        },
        required: ['mensaje', 'accion', 'parametros'],
        additionalProperties: false
      }
    }
  },

  // 5. CONSULTAR COMENTARIOS
  {
    type: 'function',
    function: {
      name: 'consultar_comentarios',
      description: 'Buscar y filtrar comentarios de la marca en logs_comentarios. Útil para ver qué están diciendo los clientes.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje indicando que se buscan comentarios'
          },
          filtros: {
            type: 'object',
            properties: {
              soloInapropiados: {
                type: ['boolean', 'null'],
                description: 'true para solo mostrar comentarios marcados como inapropiados/ofensivos'
              },
              clasificacion: {
                type: ['string', 'null'],
                description: 'Filtrar por clasificación: ofensivo, spam, consulta, queja, etc.'
              },
              filtroTexto: {
                type: ['string', 'null'],
                description: 'Buscar texto específico en los comentarios'
              },
              limite: {
                type: ['number', 'null'],
                description: 'Límite de resultados (default 50)'
              },
              fechaDesde: {
                type: ['string', 'null'],
                description: 'Filtrar desde fecha YYYY-MM-DD'
              },
              fechaHasta: {
                type: ['string', 'null'],
                description: 'Filtrar hasta fecha YYYY-MM-DD'
              }
            },
            required: ['soloInapropiados', 'clasificacion', 'filtroTexto', 'limite', 'fechaDesde', 'fechaHasta'],
            additionalProperties: false
          }
        },
        required: ['mensaje', 'filtros'],
        additionalProperties: false
      }
    }
  },

  // 6. SUGERIR DELEGACIÓN
  {
    type: 'function',
    function: {
      name: 'sugerir_delegacion',
      description: 'Sugerir derivar a otro agente. Usar para: ChatIA (tareas creativas), Meta Ads (ver campanas, publicidad, anuncios).',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje explicando por qué se sugiere delegar'
          },
          agente_destino: {
            type: 'string',
            enum: ['chatia', 'meta-ads'],
            description: 'Agente destino: chatia para creatividad, meta-ads para campanas publicitarias'
          },
          razon: {
            type: 'string',
            description: 'Razón breve de la delegación'
          },
          datos_contexto: {
            type: ['object', 'null'],
            description: 'Datos relevantes para el otro agente (contexto, datos consultados, etc.)',
            properties: {
              tema: {
                type: ['string', 'null'],
                description: 'Tema o contexto de la tarea'
              },
              datos_relevantes: {
                type: ['string', 'null'],
                description: 'Datos relevantes en formato texto'
              },
              solicitud_original: {
                type: ['string', 'null'],
                description: 'Solicitud original del usuario'
              }
            },
            required: ['tema', 'datos_relevantes', 'solicitud_original'],
            additionalProperties: false
          }
        },
        required: ['mensaje', 'agente_destino', 'razon', 'datos_contexto'],
        additionalProperties: false
      }
    }
  },

  // 7. CREAR TAREA - Para asignar trabajo a colaboradores
  {
    type: 'function',
    function: {
      name: 'crear_tarea',
      description: 'Crear una tarea para un colaborador humano. OBLIGATORIO asignar a un colaborador usando su ID. Usar cuando se necesita trabajo manual como: crear imágenes, verificar respuestas, revisar contenido, etc.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            description: 'Mensaje confirmando la creación de la tarea y a quién se asignó'
          },
          tarea: {
            type: 'object',
            description: 'Datos de la tarea a crear',
            properties: {
              titulo: {
                type: 'string',
                description: 'Título breve y descriptivo de la tarea'
              },
              descripcion: {
                type: ['string', 'null'],
                description: 'Descripción detallada de lo que se debe hacer'
              },
              tipo: {
                type: 'string',
                enum: ['crear_imagen', 'verificar_respuesta', 'revisar_contenido', 'responder_cliente', 'otro'],
                description: 'Tipo de tarea'
              },
              prioridad: {
                type: 'string',
                enum: ['alta', 'media', 'baja'],
                description: 'Prioridad de la tarea'
              },
              fecha_limite: {
                type: ['string', 'null'],
                description: 'Fecha límite en formato YYYY-MM-DD (opcional)'
              },
              asignado_a: {
                type: 'number',
                description: 'ID del colaborador al que se asigna la tarea. OBLIGATORIO. Usar un ID de la lista de colaboradores disponibles.'
              }
            },
            required: ['titulo', 'descripcion', 'tipo', 'prioridad', 'fecha_limite', 'asignado_a'],
            additionalProperties: false
          }
        },
        required: ['mensaje', 'tarea'],
        additionalProperties: false
      }
    }
  }
]

/**
 * Mapeo de tool_calls a estructura de respuesta del frontend
 *
 * Cada función recibe los args parseados del tool_call y retorna
 * un objeto compatible con el frontend existente.
 */
export const toolResponseMapper = {
  /**
   * Respuesta de texto simple
   * @param {Object} args - { mensaje: string }
   * @returns {{ tipo: 'texto', contenido: string }}
   */
  responder_texto: (args) => ({
    tipo: 'texto',
    contenido: args.mensaje
  }),

  /**
   * Tabla de datos
   * @param {Object} args - { mensaje: string, columnas: string[], filas: string[][] }
   * @returns {{ tipo: 'tabla', contenido: string, datos: { columnas, filas } }}
   */
  mostrar_datos: (args) => ({
    tipo: 'tabla',
    contenido: args.mensaje,
    datos: {
      columnas: args.columnas,
      filas: args.filas
    }
  }),

  /**
   * Confirmación antes de acción
   * @param {Object} args - { mensaje: string, accion: string, parametros: object }
   * @returns {{ tipo: 'confirmacion', contenido: string, accionPendiente: object }}
   */
  pedir_confirmacion: (args) => ({
    tipo: 'confirmacion',
    contenido: args.mensaje,
    accionPendiente: {
      accion: args.accion,
      parametros: args.parametros
    }
  }),

  /**
   * Ejecutar acción confirmada
   * @param {Object} args - { mensaje: string, accion: string, parametros: object }
   * @returns {{ tipo: 'accion_confirmada', contenido: string, ejecutar: object }}
   */
  ejecutar_accion: (args) => ({
    tipo: 'accion_confirmada',
    contenido: args.mensaje,
    ejecutar: {
      accion: args.accion,
      parametros: args.parametros
    }
  }),

  /**
   * Consultar comentarios
   * @param {Object} args - { mensaje: string, filtros: object }
   * @returns {{ tipo: 'consultar_comentarios', contenido: string, filtros: object }}
   */
  consultar_comentarios: (args) => ({
    tipo: 'consultar_comentarios',
    contenido: args.mensaje,
    filtros: args.filtros
  }),

  /**
   * Sugerir delegación a otro agente
   * @param {Object} args - { mensaje: string, agente_destino: string, razon: string, datos_contexto: object }
   * @returns {{ tipo: 'texto', contenido: string, delegacion: object }}
   */
  sugerir_delegacion: (args) => ({
    tipo: 'texto',
    contenido: args.mensaje,
    delegacion: {
      sugerida: true,
      agenteDestino: args.agente_destino,
      razon: args.razon,
      datosParaDelegar: args.datos_contexto
    }
  }),

  /**
   * Crear tarea para colaborador
   * @param {Object} args - { mensaje: string, tarea: object }
   * @returns {{ tipo: 'crear_tarea', contenido: string, tarea: object }}
   */
  crear_tarea: (args) => ({
    tipo: 'crear_tarea',
    contenido: args.mensaje,
    tarea: {
      ...args.tarea,
      creado_por_sistema: true
    }
  })
}

export default { tools, toolResponseMapper }
