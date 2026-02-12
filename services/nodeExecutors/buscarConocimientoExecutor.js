/**
 * Ejecutor: Nodo Buscar Conocimiento
 * Consulta la base de conocimiento del entrenador (conocimiento_marca).
 * Auto-ejecutable. Guarda resultados en variable del flujo.
 */

import { interpolarVariables } from '../flowEngine'
import { supabase } from '@/lib/supabase'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true, variablesActualizadas: object }
 */
export async function ejecutarBuscarConocimiento(nodo, contexto) {
  const { conversacion } = contexto
  const datos = nodo.datos || {}
  const consulta = interpolarVariables(datos.consulta || '', conversacion.variables)
  const categorias = datos.categorias || []
  const variableDestino = datos.variable_destino || 'resultado_busqueda'
  const maxResultados = datos.max_resultados || 5

  try {
    let query = supabase
      .from('conocimiento_marca')
      .select('categoria, titulo, contenido, confianza')
      .eq('id_marca', conversacion.id_marca)
      .eq('estado', 'aprobado')
      .order('confianza', { ascending: false })
      .limit(maxResultados)

    // Filtrar por categorias si se especificaron
    if (categorias.length > 0) {
      query = query.in('categoria', categorias)
    }

    // Buscar por texto si hay consulta
    if (consulta) {
      query = query.or(`titulo.ilike.%${consulta}%,contenido.ilike.%${consulta}%`)
    }

    const { data, error } = await query
    if (error) throw error

    // Formatear resultados como texto legible
    const resultadoTexto = data && data.length > 0
      ? data.map(r => `[${r.categoria}] ${r.titulo}: ${r.contenido}`).join('\n')
      : 'No se encontro informacion relevante'

    console.log(`   🔍 Busqueda conocimiento: ${data?.length || 0} resultados`)

    return {
      continuar: true,
      variablesActualizadas: {
        ...conversacion.variables,
        [variableDestino]: resultadoTexto,
        [`${variableDestino}_raw`]: data || []
      }
    }
  } catch (error) {
    console.error('Error buscando conocimiento:', error)
    return {
      continuar: true,
      variablesActualizadas: {
        ...conversacion.variables,
        [variableDestino]: 'Error buscando informacion'
      }
    }
  }
}
