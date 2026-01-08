import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase credentials not configured')
}

// Cliente server-side con service role key (acceso completo)
export const supabase = createClient(
  supabaseUrl || '',
  supabaseServiceKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// ============================================
// AUTENTICACIÓN
// ============================================

export async function loginUsuario(usuario, contrasena) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('usuario', usuario)
      .eq('contrasena', contrasena)
      .eq('activo', true)
      .single()

    if (error || !data) {
      return { success: false, error: 'Usuario o contraseña incorrectos' }
    }

    // Actualizar último login
    await supabase
      .from('usuarios')
      .update({ ultimo_login: new Date().toISOString() })
      .eq('id', data.id)

    return { success: true, usuario: data }
  } catch (error) {
    console.error('Error en loginUsuario:', error)
    return { success: false, error: 'Error al iniciar sesión' }
  }
}

// ============================================
// DATOS DE MARCA
// ============================================

export async function obtenerDatosMarca(idMarca) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('ID marca', idMarca)
      .eq('Estado', true)
      .order('prioridad', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerDatosMarca:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function obtenerTodasLasMarcas() {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('Estado', true)
      .order('Nombre marca', { ascending: true })
      .order('prioridad', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerTodasLasMarcas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function agregarDato(dato) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .insert([{
        ...dato,
        Estado: true,
        creado_en: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en agregarDato:', error)
    return { success: false, error: error.message }
  }
}

export async function modificarDato(id, updates) {
  try {
    // Obtener registro anterior para comparación
    const { data: registroAnterior } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('base_cuentas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data, registroAnterior }
  } catch (error) {
    console.error('Error en modificarDato:', error)
    return { success: false, error: error.message }
  }
}

export async function desactivarDato(id) {
  try {
    const { data: registroAnterior } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('base_cuentas')
      .update({ Estado: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data, registroAnterior }
  } catch (error) {
    console.error('Error en desactivarDato:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// COMENTARIOS
// ============================================

export async function consultarComentarios(opciones = {}) {
  try {
    const {
      idMarca,
      limite = 50,
      filtroTexto,
      soloInapropiados,
      clasificacion,
      fechaDesde,
      fechaHasta
    } = opciones

    let query = supabase
      .from('logs_comentarios')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(limite)

    if (idMarca) {
      query = query.eq('id_marca', idMarca)
    }

    if (filtroTexto) {
      query = query.or(`comentario_original.ilike.%${filtroTexto}%,respuesta_comentario.ilike.%${filtroTexto}%`)
    }

    if (soloInapropiados) {
      query = query.eq('es_inapropiado', true)
    }

    if (clasificacion) {
      query = query.eq('clasificacion', clasificacion)
    }

    if (fechaDesde) {
      query = query.gte('creado_en', fechaDesde)
    }

    if (fechaHasta) {
      query = query.lte('creado_en', fechaHasta)
    }

    const { data, error, count } = await query

    if (error) throw error
    return { success: true, data: data || [], total: count }
  } catch (error) {
    console.error('Error en consultarComentarios:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function obtenerLogsComentarios(idMarca, limite = 100) {
  try {
    let query = supabase
      .from('logs_comentarios')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(limite)

    if (idMarca) {
      query = query.eq('id_marca', idMarca)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerLogsComentarios:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function obtenerEstadisticasComentarios(idMarca, dias = 30) {
  try {
    const fechaDesde = new Date()
    fechaDesde.setDate(fechaDesde.getDate() - dias)

    let query = supabase
      .from('logs_comentarios')
      .select('*')
      .gte('creado_en', fechaDesde.toISOString())

    if (idMarca) {
      query = query.eq('id_marca', idMarca)
    }

    const { data, error } = await query

    if (error) throw error

    const total = data?.length || 0
    const inapropiados = data?.filter(c => c.es_inapropiado).length || 0

    return {
      success: true,
      estadisticas: {
        total,
        inapropiados,
        apropiados: total - inapropiados,
        porcentajeInapropiados: total > 0 ? ((inapropiados / total) * 100).toFixed(2) : 0
      }
    }
  } catch (error) {
    console.error('Error en obtenerEstadisticasComentarios:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// LOGS Y CHAT
// ============================================

export async function guardarMensajeChat(mensaje) {
  try {
    const { data, error } = await supabase
      .from('mensajes_chat')
      .insert([{
        ...mensaje,
        creado_en: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarMensajeChat:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerHistorialChat(sesionId, limite = 50) {
  try {
    const { data, error } = await supabase
      .from('mensajes_chat')
      .select('*')
      .eq('sesion_id', sesionId)
      .order('creado_en', { ascending: true })
      .limit(limite)

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerHistorialChat:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function guardarLogAccion(log) {
  try {
    const { data, error } = await supabase
      .from('logs_acciones_admin')
      .insert([{
        ...log,
        timestamp: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarLogAccion:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// TAREAS
// ============================================

export async function obtenerTareas(opciones = {}) {
  try {
    const {
      idMarca,
      asignadoA,
      estado,
      tipoUsuario,
      limite = 100
    } = opciones

    let query = supabase
      .from('tareas')
      .select('*')
      .eq('activo', true)
      .order('fecha_creacion', { ascending: false })
      .limit(limite)

    // Si es colaborador, solo ve sus tareas asignadas
    if (tipoUsuario === 'colaborador' && asignadoA) {
      query = query.eq('asignado_a', asignadoA)
    } else if (idMarca) {
      // Si es admin, ve todas las tareas de su marca
      query = query.eq('id_marca', idMarca)
    }

    if (estado) {
      query = query.eq('estado', estado)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerTareas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function crearTarea(tarea) {
  try {
    const { data, error } = await supabase
      .from('tareas')
      .insert([{
        ...tarea,
        estado: tarea.estado || 'pendiente',
        prioridad: tarea.prioridad || 'media',
        fecha_creacion: new Date().toISOString(),
        activo: true
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en crearTarea:', error)
    return { success: false, error: error.message }
  }
}

export async function actualizarTarea(id, updates) {
  try {
    const { data, error } = await supabase
      .from('tareas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarTarea:', error)
    return { success: false, error: error.message }
  }
}

export async function cambiarEstadoTarea(id, nuevoEstado, extras = {}) {
  try {
    const updates = {
      estado: nuevoEstado,
      ...extras
    }

    // Si se completa, agregar fecha de completado
    if (nuevoEstado === 'completada') {
      updates.fecha_completada = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('tareas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en cambiarEstadoTarea:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerColaboradores(idMarca = null) {
  try {
    let query = supabase
      .from('usuarios')
      .select('id, nombre, usuario, id_marca, nombre_marca, telefono')
      .eq('activo', true)
      .eq('tipo_usuario', 'colaborador')

    if (idMarca) {
      query = query.eq('id_marca', idMarca)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerColaboradores:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function obtenerUsuarioPorId(id) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, telefono, usuario, tipo_usuario')
      .eq('id', id)
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerUsuarioPorId:', error)
    return { success: false, error: error.message }
  }
}

export async function desactivarTarea(id) {
  try {
    const { data, error } = await supabase
      .from('tareas')
      .update({ activo: false })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en desactivarTarea:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// NOTAS DE TAREAS
// ============================================

export async function obtenerNotasTarea(idTarea) {
  try {
    const { data, error } = await supabase
      .from('notas_tareas')
      .select('*')
      .eq('id_tarea', idTarea)
      .order('fecha_creacion', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerNotasTarea:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function agregarNotaTarea(nota) {
  try {
    const { data, error } = await supabase
      .from('notas_tareas')
      .insert([{
        ...nota,
        fecha_creacion: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en agregarNotaTarea:', error)
    return { success: false, error: error.message }
  }
}

// Obtener todos los archivos (solo los que tienen archivo_url)
export async function obtenerTodosLosArchivos() {
  try {
    const { data, error } = await supabase
      .from('notas_tareas')
      .select(`
        id,
        id_tarea,
        archivo_url,
        archivo_nombre,
        archivo_tipo,
        archivo_tamano,
        nombre_creador,
        fecha_creacion
      `)
      .not('archivo_url', 'is', null)
      .order('fecha_creacion', { ascending: false })

    if (error) throw error

    // Obtener info de las tareas para cada archivo
    const archivosConTarea = await Promise.all(
      (data || []).map(async (archivo) => {
        const { data: tarea } = await supabase
          .from('tareas')
          .select('id, titulo, estado')
          .eq('id', archivo.id_tarea)
          .single()

        return {
          ...archivo,
          tarea_titulo: tarea?.titulo || 'Tarea eliminada',
          tarea_estado: tarea?.estado || 'desconocido'
        }
      })
    )

    return { success: true, data: archivosConTarea }
  } catch (error) {
    console.error('Error en obtenerTodosLosArchivos:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// ============================================
// HISTORIAL DE TAREAS
// ============================================

export async function obtenerHistorialTarea(idTarea) {
  try {
    const { data, error } = await supabase
      .from('historial_tareas')
      .select('*')
      .eq('id_tarea', idTarea)
      .order('fecha_modificacion', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerHistorialTarea:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function registrarCambioTarea(cambio) {
  try {
    const { data, error } = await supabase
      .from('historial_tareas')
      .insert([{
        ...cambio,
        fecha_modificacion: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en registrarCambioTarea:', error)
    return { success: false, error: error.message }
  }
}

// Funcion mejorada para cambiar estado con historial
export async function cambiarEstadoTareaConHistorial(id, nuevoEstado, usuario, extras = {}) {
  try {
    // Obtener estado anterior
    const { data: tareaAnterior } = await supabase
      .from('tareas')
      .select('estado')
      .eq('id', id)
      .single()

    const updates = {
      estado: nuevoEstado,
      ...extras
    }

    if (nuevoEstado === 'completada') {
      updates.fecha_completada = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('tareas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Registrar en historial
    if (tareaAnterior && tareaAnterior.estado !== nuevoEstado) {
      await registrarCambioTarea({
        id_tarea: id,
        campo_modificado: 'estado',
        valor_anterior: tareaAnterior.estado,
        valor_nuevo: nuevoEstado,
        modificado_por: usuario?.id,
        nombre_modificador: usuario?.nombre
      })
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error en cambiarEstadoTareaConHistorial:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// STORAGE - ARCHIVOS
// ============================================

export async function subirArchivoTarea(buffer, idTarea, infoArchivo) {
  try {
    const timestamp = Date.now()
    // Limpiar nombre de archivo
    const nombreLimpio = infoArchivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const nombreArchivo = `tarea_${idTarea}/${timestamp}_${nombreLimpio}`

    const { data, error } = await supabase.storage
      .from('tareas-archivos')
      .upload(nombreArchivo, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: infoArchivo.type
      })

    if (error) throw error

    // Obtener URL publica
    const { data: urlData } = supabase.storage
      .from('tareas-archivos')
      .getPublicUrl(nombreArchivo)

    return {
      success: true,
      data: {
        path: data.path,
        url: urlData.publicUrl,
        nombre: infoArchivo.name,
        tipo: infoArchivo.type,
        tamano: infoArchivo.size
      }
    }
  } catch (error) {
    console.error('Error en subirArchivoTarea:', error)
    return { success: false, error: error.message }
  }
}

export async function eliminarArchivoTarea(path) {
  try {
    const { error } = await supabase.storage
      .from('tareas-archivos')
      .remove([path])

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en eliminarArchivoTarea:', error)
    return { success: false, error: error.message }
  }
}
