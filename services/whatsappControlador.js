/**
 * WhatsApp Controlador Adapter
 * Conecta mensajes de WhatsApp con el AgentManager existente
 */

import { createAgentManager } from './agentManager'
import { obtenerFechaActual } from '@/lib/openai'
import {
  agregarDato,
  modificarDato,
  desactivarDato,
  consultarComentarios
} from '@/lib/supabase'

/**
 * Procesar mensaje con el chat controlador
 * @param {string} mensaje - Mensaje del usuario
 * @param {object} contexto - Contexto de la conversacion
 * @returns {Promise<object>} Respuesta formateada para WhatsApp
 */
export async function procesarMensajeControlador(mensaje, contexto) {
  try {
    console.log(`\n🤖 === WhatsApp Controlador ===`)
    console.log(`   Mensaje: "${mensaje}"`)

    // Crear manager para esta request
    const agentManager = createAgentManager()
    agentManager.setAgent('controlador')

    // Agregar fecha al contexto
    const context = {
      ...contexto,
      fechaInfo: obtenerFechaActual()
    }

    // Procesar mensaje
    const respuesta = await agentManager.processMessage(
      mensaje,
      context,
      contexto.historial || []
    )

    console.log(`   📤 Tipo respuesta: ${respuesta.tipo}`)

    // Mapear respuesta para WhatsApp
    return await mapearRespuestaParaWhatsApp(respuesta, contexto)

  } catch (error) {
    console.error('Error en procesarMensajeControlador:', error)
    return {
      tipo: 'error',
      contenido: `Error procesando mensaje: ${error.message}`
    }
  }
}

/**
 * Mapear respuesta del AgentManager a formato WhatsApp
 */
async function mapearRespuestaParaWhatsApp(respuesta, contexto) {
  switch (respuesta.tipo) {
    case 'texto':
      return {
        tipo: 'texto',
        contenido: limpiarFormatoParaWhatsApp(respuesta.contenido)
      }

    case 'tabla':
      // Convertir tabla a texto legible
      const tablaTexto = formatearTablaComoTexto(respuesta)
      return {
        tipo: 'texto',
        contenido: tablaTexto
      }

    case 'confirmacion':
      // Devolver confirmacion para que el handler muestre botones
      return {
        tipo: 'confirmacion',
        contenido: limpiarFormatoParaWhatsApp(respuesta.contenido),
        datos: respuesta.accionPendiente
      }

    case 'accion_confirmada':
      // Ejecutar la accion
      const resultadoAccion = await ejecutarAccion(respuesta.ejecutar, contexto)
      return resultadoAccion

    case 'consultar_comentarios':
      // Ejecutar consulta de comentarios
      const resultadoComentarios = await ejecutarConsultaComentarios(
        respuesta.filtros,
        contexto.idMarca
      )
      return {
        tipo: 'texto',
        contenido: `${respuesta.contenido}\n\n${resultadoComentarios}`
      }

    case 'crear_tarea':
      // Por ahora solo informar, la creacion real se hara en el handler
      return {
        tipo: 'texto',
        contenido: `📋 ${respuesta.contenido}\n\nTarea: ${respuesta.tarea?.titulo || 'Nueva tarea'}`
      }

    case 'error':
      return {
        tipo: 'error',
        contenido: respuesta.contenido
      }

    default:
      return {
        tipo: 'texto',
        contenido: respuesta.contenido || 'Respuesta procesada.'
      }
  }
}

/**
 * Formatear tabla como texto para WhatsApp
 */
function formatearTablaComoTexto(respuesta) {
  let texto = respuesta.contenido + '\n\n'

  if (respuesta.datos?.columnas && respuesta.datos?.filas) {
    const columnas = respuesta.datos.columnas
    const filas = respuesta.datos.filas

    filas.slice(0, 15).forEach((fila, i) => {
      texto += `*${i + 1}.* `
      columnas.forEach((col, j) => {
        const valor = fila[j] || '-'
        // Mostrar solo columnas importantes
        if (col.toLowerCase() !== 'id' || valor.length <= 5) {
          texto += `${col}: ${valor} | `
        }
      })
      texto = texto.slice(0, -3) + '\n'
    })

    if (filas.length > 15) {
      texto += `\n... y ${filas.length - 15} registros mas`
    }
  }

  return texto
}

/**
 * Limpiar formato markdown para WhatsApp
 */
function limpiarFormatoParaWhatsApp(texto) {
  if (!texto) return ''

  return texto
    // WhatsApp soporta negrita con asteriscos, pero no otros formatos
    .replace(/\*\*(.*?)\*\*/g, '*$1*') // **texto** -> *texto*
    .replace(/__(.*?)__/g, '_$1_')     // __texto__ -> _texto_
    .replace(/`(.*?)`/g, '$1')         // `codigo` -> codigo
    .replace(/#{1,6}\s/g, '')          // Remover headers markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) -> link
}

/**
 * Ejecutar accion confirmada
 */
async function ejecutarAccion(ejecutar, contexto) {
  const { accion, parametros } = ejecutar

  try {
    switch (accion) {
      case 'agregar':
        const nuevoDato = {
          'ID marca': contexto.idMarca,
          'Nombre marca': contexto.nombreMarca,
          Categoria: parametros.categoria,
          Clave: parametros.clave,
          Valor: parametros.valor,
          prioridad: parametros.prioridad || 3,
          fecha_inicio: parametros.fecha_inicio || null,
          fecha_caducidad: parametros.fecha_caducidad || null
        }
        const resultadoAgregar = await agregarDato(nuevoDato)
        if (resultadoAgregar.success) {
          return {
            tipo: 'accion_completada',
            contenido: `Dato agregado correctamente: ${parametros.clave}`
          }
        } else {
          return {
            tipo: 'error',
            contenido: `Error al agregar: ${resultadoAgregar.error}`
          }
        }

      case 'modificar':
        if (!parametros.id_fila) {
          return {
            tipo: 'error',
            contenido: 'No se especifico el ID del registro a modificar'
          }
        }
        const updates = {}
        if (parametros.updates) {
          Object.entries(parametros.updates).forEach(([key, val]) => {
            if (val !== null) {
              // Mapear campos
              const campoMap = {
                categoria: 'Categoria',
                clave: 'Clave',
                valor: 'Valor',
                prioridad: 'prioridad',
                fecha_inicio: 'fecha_inicio',
                fecha_caducidad: 'fecha_caducidad'
              }
              updates[campoMap[key] || key] = val
            }
          })
        }
        const resultadoModificar = await modificarDato(parametros.id_fila, updates)
        if (resultadoModificar.success) {
          return {
            tipo: 'accion_completada',
            contenido: `Registro #${parametros.id_fila} modificado correctamente`
          }
        } else {
          return {
            tipo: 'error',
            contenido: `Error al modificar: ${resultadoModificar.error}`
          }
        }

      case 'desactivar':
        if (!parametros.id_fila) {
          return {
            tipo: 'error',
            contenido: 'No se especifico el ID del registro a desactivar'
          }
        }
        const resultadoDesactivar = await desactivarDato(parametros.id_fila)
        if (resultadoDesactivar.success) {
          return {
            tipo: 'accion_completada',
            contenido: `Registro #${parametros.id_fila} desactivado correctamente`
          }
        } else {
          return {
            tipo: 'error',
            contenido: `Error al desactivar: ${resultadoDesactivar.error}`
          }
        }

      default:
        return {
          tipo: 'error',
          contenido: `Accion no reconocida: ${accion}`
        }
    }
  } catch (error) {
    console.error('Error ejecutando accion:', error)
    return {
      tipo: 'error',
      contenido: `Error ejecutando accion: ${error.message}`
    }
  }
}

/**
 * Ejecutar consulta de comentarios
 */
async function ejecutarConsultaComentarios(filtros, idMarca) {
  try {
    const resultado = await consultarComentarios({
      idMarca,
      limite: filtros.limite || 10,
      filtroTexto: filtros.filtroTexto,
      soloInapropiados: filtros.soloInapropiados,
      clasificacion: filtros.clasificacion,
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta
    })

    if (!resultado.success || !resultado.data?.length) {
      return 'No se encontraron comentarios con esos filtros.'
    }

    let texto = ''
    resultado.data.slice(0, 10).forEach((c, i) => {
      const fecha = new Date(c.creado_en).toLocaleDateString('es-CL')
      texto += `${i + 1}. [${fecha}] "${c.comentario_original || 'N/A'}"\n`
      if (c.respuesta_comentario) {
        texto += `   Respuesta: "${c.respuesta_comentario}"\n`
      }
    })

    if (resultado.data.length > 10) {
      texto += `\n... y ${resultado.data.length - 10} comentarios mas`
    }

    return texto

  } catch (error) {
    console.error('Error consultando comentarios:', error)
    return `Error al consultar comentarios: ${error.message}`
  }
}

export default {
  procesarMensajeControlador
}
