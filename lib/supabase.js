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

/**
 * Registra un nuevo usuario y su marca
 * @param {Object} datos - Datos del registro
 * @param {string} datos.nombre - Nombre completo del usuario
 * @param {string} datos.email - Email del usuario (será el usuario para login)
 * @param {string} datos.empresa - Nombre de la empresa/marca
 * @param {string} datos.password - Contraseña
 * @returns {Promise<{success: boolean, usuario?: Object, error?: string}>}
 */
export async function registrarUsuario(datos) {
  try {
    const { nombre, email, empresa, password } = datos

    // Validar datos requeridos
    if (!nombre || !email || !empresa || !password) {
      return { success: false, error: 'Todos los campos son requeridos' }
    }

    // Verificar si el email ya existe
    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('usuario', email)
      .single()

    if (existente) {
      return { success: false, error: 'Este email ya está registrado' }
    }

    // Obtener el próximo ID de marca
    const { data: ultimaMarca } = await supabase
      .from('usuarios')
      .select('id_marca')
      .order('id_marca', { ascending: false })
      .limit(1)
      .single()

    const nuevoIdMarca = (ultimaMarca?.id_marca || 0) + 1

    // Crear el usuario
    const { data: nuevoUsuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .insert({
        usuario: email,
        contrasena: password, // TODO: En producción, hashear la contraseña
        nombre: nombre,
        id_marca: nuevoIdMarca,
        nombre_marca: empresa,
        tipo_usuario: 'adm',
        es_super_admin: false,
        activo: true,
        plan: 'gratuito',
        onboarding_completado: false,
        fecha_registro: new Date().toISOString()
      })
      .select()
      .single()

    if (errorUsuario) {
      console.error('Error creando usuario:', errorUsuario)
      throw errorUsuario
    }

    // Crear registro de límites de uso para la marca
    await supabase
      .from('limites_uso')
      .insert({
        id_marca: nuevoIdMarca,
        comentarios_usados: 0,
        datos_usados: 0,
        tareas_usadas: 0
      })

    // Excluir contraseña del resultado
    const { contrasena: _, ...usuarioSinPassword } = nuevoUsuario

    return { success: true, usuario: usuarioSinPassword }

  } catch (error) {
    console.error('Error en registrarUsuario:', error)
    return { success: false, error: error.message || 'Error al registrar usuario' }
  }
}

/**
 * Verifica si un email ya está registrado
 * @param {string} email - Email a verificar
 * @returns {Promise<boolean>}
 */
export async function emailExiste(email) {
  try {
    const { data } = await supabase
      .from('usuarios')
      .select('id')
      .eq('usuario', email)
      .single()

    return !!data
  } catch {
    return false
  }
}

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

// ============================================
// CUENTAS FACEBOOK / INSTAGRAM
// ============================================

/**
 * Guarda una cuenta de Facebook/Instagram conectada
 * @param {Object} datos - Datos de la cuenta
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function guardarCuentaFacebook(datos) {
  try {
    const { data, error } = await supabase
      .from('cuentas_facebook')
      .upsert({
        usuario_id: datos.usuario_id,
        id_marca: datos.id_marca,
        page_id: datos.page_id,
        page_name: datos.page_name,
        instagram_id: datos.instagram_id || null,
        instagram_username: datos.instagram_username || null,
        access_token: datos.access_token,
        token_expires_at: datos.token_expires_at || null,
        conectado_en: new Date().toISOString(),
        activo: true
      }, {
        onConflict: 'id_marca,page_id'
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarCuentaFacebook:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene las cuentas de Facebook conectadas para una marca
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function obtenerCuentasFacebook(idMarca) {
  try {
    const { data, error } = await supabase
      .from('cuentas_facebook')
      .select('id, page_id, page_name, instagram_id, instagram_username, conectado_en, activo')
      .eq('id_marca', idMarca)
      .eq('activo', true)
      .order('conectado_en', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerCuentasFacebook:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Desconecta (desactiva) una cuenta de Facebook
 * @param {number} idMarca - ID de la marca
 * @param {string} pageId - ID de la página de Facebook
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function desconectarCuentaFacebook(idMarca, pageId) {
  try {
    const { error } = await supabase
      .from('cuentas_facebook')
      .update({ activo: false })
      .eq('id_marca', idMarca)
      .eq('page_id', pageId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en desconectarCuentaFacebook:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Verifica si una página de Facebook ya está conectada para una marca
 * @param {number} idMarca - ID de la marca
 * @param {string} pageId - ID de la página de Facebook
 * @returns {Promise<{exists: boolean, data?: Object}>}
 */
export async function existeCuentaFacebook(idMarca, pageId) {
  try {
    const { data, error } = await supabase
      .from('cuentas_facebook')
      .select('id, activo')
      .eq('id_marca', idMarca)
      .eq('page_id', pageId)
      .single()

    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
    return { exists: !!data, data }
  } catch (error) {
    console.error('Error en existeCuentaFacebook:', error)
    return { exists: false }
  }
}

/**
 * Obtiene el access token de una cuenta de Facebook conectada
 * @param {number} idMarca - ID de la marca
 * @param {string} pageId - ID de la página de Facebook
 * @returns {Promise<{success: boolean, access_token?: string, error?: string}>}
 */
export async function obtenerTokenFacebook(idMarca, pageId) {
  try {
    const { data, error } = await supabase
      .from('cuentas_facebook')
      .select('access_token, token_expires_at')
      .eq('id_marca', idMarca)
      .eq('page_id', pageId)
      .eq('activo', true)
      .single()

    if (error) throw error
    return { success: true, access_token: data.access_token, expires_at: data.token_expires_at }
  } catch (error) {
    console.error('Error en obtenerTokenFacebook:', error)
    return { success: false, error: error.message }
  }
}


// ============================================
// SISTEMA DE LÍMITES Y ONBOARDING
// ============================================

/**
 * Obtiene o crea el registro de uso de límites para una marca
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function obtenerUsoMarca(idMarca) {
  try {
    // Intentar obtener el registro existente
    let { data, error } = await supabase
      .from('limites_uso')
      .select('*')
      .eq('id_marca', idMarca)
      .single()

    // Si no existe, crear uno nuevo
    if (error && error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('limites_uso')
        .insert({
          id_marca: idMarca,
          comentarios_usados: 0,
          datos_usados: 0,
          tareas_usadas: 0
        })
        .select()
        .single()

      if (insertError) throw insertError
      data = newData
    } else if (error) {
      throw error
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerUsoMarca:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Incrementa un contador de uso para una marca
 * @param {number} idMarca - ID de la marca
 * @param {string} campo - Campo a incrementar ('comentarios_usados', 'datos_usados', 'tareas_usadas')
 * @param {number} cantidad - Cantidad a incrementar (default 1)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function incrementarUso(idMarca, campo, cantidad = 1) {
  try {
    // Primero asegurarse de que existe el registro
    await obtenerUsoMarca(idMarca)

    // Usar RPC para incremento atómico, o hacer update manual
    const { data: current } = await supabase
      .from('limites_uso')
      .select(campo)
      .eq('id_marca', idMarca)
      .single()

    const nuevoValor = (current?.[campo] || 0) + cantidad

    const { error } = await supabase
      .from('limites_uso')
      .update({
        [campo]: nuevoValor,
        ultima_actualizacion: new Date().toISOString()
      })
      .eq('id_marca', idMarca)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en incrementarUso:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Decrementa un contador de uso para una marca (útil al eliminar/desactivar)
 * @param {number} idMarca - ID de la marca
 * @param {string} campo - Campo a decrementar
 * @param {number} cantidad - Cantidad a decrementar (default 1)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function decrementarUso(idMarca, campo, cantidad = 1) {
  try {
    const { data: current } = await supabase
      .from('limites_uso')
      .select(campo)
      .eq('id_marca', idMarca)
      .single()

    const nuevoValor = Math.max(0, (current?.[campo] || 0) - cantidad)

    const { error } = await supabase
      .from('limites_uso')
      .update({
        [campo]: nuevoValor,
        ultima_actualizacion: new Date().toISOString()
      })
      .eq('id_marca', idMarca)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en decrementarUso:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cuenta los datos activos de una marca (para sincronizar límites)
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, datos_activos?: number, error?: string}>}
 */
export async function contarDatosActivos(idMarca) {
  try {
    const { count, error } = await supabase
      .from('base_cuentas')
      .select('*', { count: 'exact', head: true })
      .eq('ID marca', idMarca)
      .eq('Estado', true)

    if (error) throw error
    return { success: true, datos_activos: count || 0 }
  } catch (error) {
    console.error('Error en contarDatosActivos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cuenta las tareas activas de una marca
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, tareas_activas?: number, error?: string}>}
 */
export async function contarTareasActivas(idMarca) {
  try {
    const { count, error } = await supabase
      .from('tareas')
      .select('*', { count: 'exact', head: true })
      .eq('id_marca', idMarca)
      .eq('activo', true)

    if (error) throw error
    return { success: true, tareas_activas: count || 0 }
  } catch (error) {
    console.error('Error en contarTareasActivas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Sincroniza los contadores de uso con los datos reales de la BD
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sincronizarUso(idMarca) {
  try {
    const [datosResult, tareasResult] = await Promise.all([
      contarDatosActivos(idMarca),
      contarTareasActivas(idMarca)
    ])

    if (!datosResult.success || !tareasResult.success) {
      throw new Error('Error al contar datos')
    }

    // Asegurar que existe el registro
    await obtenerUsoMarca(idMarca)

    const { error } = await supabase
      .from('limites_uso')
      .update({
        datos_usados: datosResult.datos_activos,
        tareas_usadas: tareasResult.tareas_activas,
        ultima_actualizacion: new Date().toISOString()
      })
      .eq('id_marca', idMarca)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en sincronizarUso:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Verifica el estado de onboarding de un usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<{success: boolean, onboarding_completado?: boolean, plan?: string, error?: string}>}
 */
export async function verificarOnboarding(userId) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('onboarding_completado, plan')
      .eq('id', userId)
      .single()

    if (error) throw error

    return {
      success: true,
      onboarding_completado: data?.onboarding_completado || false,
      plan: data?.plan || 'gratuito'
    }
  } catch (error) {
    console.error('Error en verificarOnboarding:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marca el onboarding como completado para un usuario
 * Solo se puede completar si tiene al menos una cuenta de Facebook conectada
 * @param {number} userId - ID del usuario
 * @param {number} idMarca - ID de la marca del usuario
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function completarOnboarding(userId, idMarca) {
  try {
    // Verificar que tiene cuenta Facebook conectada
    const cuentas = await obtenerCuentasFacebook(idMarca)
    if (!cuentas.success || !cuentas.data || cuentas.data.length === 0) {
      return {
        success: false,
        error: 'Debes conectar una cuenta de Facebook/Instagram para continuar'
      }
    }

    // Marcar onboarding como completado
    const { error } = await supabase
      .from('usuarios')
      .update({ onboarding_completado: true })
      .eq('id', userId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en completarOnboarding:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene el estado completo de onboarding y límites de un usuario
 * @param {number} userId - ID del usuario
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<Object>}
 */
export async function obtenerEstadoUsuario(userId, idMarca) {
  try {
    const [onboardingResult, usoResult, cuentasFbResult] = await Promise.all([
      verificarOnboarding(userId),
      obtenerUsoMarca(idMarca),
      obtenerCuentasFacebook(idMarca)
    ])

    return {
      success: true,
      onboarding_completado: onboardingResult.onboarding_completado || false,
      plan: onboardingResult.plan || 'gratuito',
      uso: usoResult.data || {
        comentarios_usados: 0,
        datos_usados: 0,
        tareas_usadas: 0
      },
      tiene_facebook: cuentasFbResult.success && cuentasFbResult.data?.length > 0,
      cuentas_facebook: cuentasFbResult.data?.length || 0
    }
  } catch (error) {
    console.error('Error en obtenerEstadoUsuario:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Actualiza el plan de un usuario
 * @param {number} userId - ID del usuario
 * @param {string} plan - Nuevo plan ('gratuito' o 'premium')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function actualizarPlan(userId, plan) {
  try {
    const { error } = await supabase
      .from('usuarios')
      .update({ plan })
      .eq('id', userId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en actualizarPlan:', error)
    return { success: false, error: error.message }
  }
}
