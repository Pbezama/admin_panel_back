/**
 * Ejecutor: Nodo Crear Tarea
 * Crea una tarea interna para un colaborador.
 * Auto-ejecutable.
 */

import { interpolarVariables } from '../flowEngine'
import { supabase } from '@/lib/supabase'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true }
 */
export async function ejecutarCrearTarea(nodo, contexto) {
  const { conversacion } = contexto
  const datos = nodo.datos || {}

  const titulo = interpolarVariables(datos.titulo || 'Tarea desde flujo', conversacion.variables)
  const descripcion = interpolarVariables(datos.descripcion || '', conversacion.variables)
  const tipo = datos.tipo || 'otro'
  const prioridad = datos.prioridad || 'media'

  try {
    // Si asignar_a es 'auto', buscar primer colaborador disponible
    let asignadoA = datos.asignar_a
    let nombreAsignado = null

    if (asignadoA === 'auto' || !asignadoA) {
      const { data: colaboradores } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .eq('id_marca', conversacion.id_marca)
        .eq('activo', true)
        .limit(1)

      if (colaboradores?.length > 0) {
        asignadoA = colaboradores[0].id
        nombreAsignado = colaboradores[0].nombre
      }
    }

    const { data, error } = await supabase
      .from('tareas')
      .insert({
        id_marca: conversacion.id_marca,
        titulo,
        descripcion,
        tipo,
        prioridad,
        estado: 'pendiente',
        asignado_a: asignadoA !== 'auto' ? asignadoA : null,
        nombre_asignado: nombreAsignado,
        creado_por_sistema: true,
        activo: true,
        fecha_creacion: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    console.log(`   📋 Tarea creada: ${titulo} (ID: ${data.id})`)

    return {
      continuar: true,
      variablesActualizadas: {
        ...conversacion.variables,
        ultima_tarea_id: data.id
      }
    }
  } catch (error) {
    console.error('Error creando tarea:', error)
    return { continuar: true }
  }
}
