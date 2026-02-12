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

/**
 * Obtiene usuarios asignables para tareas segun el rol del solicitante
 * - Super admin: TODOS los usuarios activos de todas las marcas
 * - Admin: todos los usuarios activos de su marca (admins + colaboradores)
 */
export async function obtenerUsuariosAsignables(idMarca, esSuperAdmin = false) {
  try {
    let query = supabase
      .from('usuarios')
      .select('id, nombre, usuario, id_marca, nombre_marca, telefono, tipo_usuario')
      .eq('activo', true)
      .in('tipo_usuario', ['adm', 'colaborador'])

    if (!esSuperAdmin && idMarca) {
      query = query.eq('id_marca', idMarca)
    }

    query = query.order('nombre', { ascending: true })

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerUsuariosAsignables:', error)
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

/**
 * Buscar usuario por numero de telefono
 * @param {string} telefono - Numero de telefono (ej: 56991709265)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function obtenerUsuarioPorTelefono(telefono) {
  try {
    if (!telefono) {
      return { success: false, error: 'Telefono requerido' }
    }

    // Normalizar telefono (remover espacios, guiones, +)
    const telefonoNormalizado = telefono.replace(/[\s\-\+]/g, '')

    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, telefono, usuario, tipo_usuario, id_marca, nombre_marca, activo')
      .or(`telefono.eq.${telefonoNormalizado},telefono.eq.+${telefonoNormalizado}`)
      .eq('activo', true)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    if (!data) {
      return { success: false, error: 'Usuario no encontrado' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerUsuarioPorTelefono:', error)
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

// ============================================
// CUENTAS INSTAGRAM (para comentarios_supabase.py)
// ============================================

/**
 * Guarda o actualiza una cuenta de Instagram en la tabla cuentas_instagram
 * Esta tabla es usada por comentarios_supabase.py para responder comentarios
 * NOTA: Normalmente esto se hace desde PythonAnywhere OAuth Gateway
 * @param {Object} datos - Datos de la cuenta de Instagram
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function guardarCuentaInstagram(datos) {
  try {
    const { data: existing } = await supabase
      .from('cuentas_instagram')
      .select('id')
      .eq('instagram_id', datos.instagram_id)
      .single()

    const igData = {
      user_id: datos.user_id?.toString(),
      page_id: datos.page_id,
      page_name: datos.page_name,
      instagram_id: datos.instagram_id,
      instagram_name: datos.instagram_username || datos.instagram_name,
      page_access_token: datos.access_token,
      activo: true,
      fecha_actualizacion: new Date().toISOString()
    }

    let result
    if (existing) {
      result = await supabase
        .from('cuentas_instagram')
        .update(igData)
        .eq('instagram_id', datos.instagram_id)
        .select()
        .single()
    } else {
      igData.fecha_conexion = new Date().toISOString()
      result = await supabase
        .from('cuentas_instagram')
        .insert(igData)
        .select()
        .single()
    }

    if (result.error) throw result.error
    return { success: true, data: result.data }
  } catch (error) {
    console.error('Error en guardarCuentaInstagram:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene las cuentas de Instagram activas para un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function obtenerCuentasInstagram(userId) {
  try {
    const { data, error } = await supabase
      .from('cuentas_instagram')
      .select('*')
      .eq('user_id', userId?.toString())
      .eq('activo', true)
      .order('fecha_conexion', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerCuentasInstagram:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Desactiva una cuenta de Instagram
 * @param {string} instagramId - ID de la cuenta de Instagram
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function desconectarCuentaInstagram(instagramId) {
  try {
    const { error } = await supabase
      .from('cuentas_instagram')
      .update({ activo: false })
      .eq('instagram_id', instagramId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en desconectarCuentaInstagram:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CONEXIÓN FACEBOOK VIA PYTHONANYWHERE (POLLING)
// ============================================

/**
 * Normaliza texto para comparación flexible
 * - Quita acentos
 * - Convierte a minúsculas
 * - Quita espacios extra
 * @param {string} texto - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
function normalizarTexto(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca marca por nombre con matching flexible
 * Estrategia:
 * 1. Búsqueda exacta (case insensitive)
 * 2. Si no hay, buscar si nombreMarca está CONTENIDO en algún "Nombre marca"
 * 3. Si no hay, buscar si algún "Nombre marca" está CONTENIDO en nombreMarca
 * @param {string} nombreMarca - Nombre de la marca a buscar
 * @returns {Promise<{exists: boolean, id_marca: string|null, nombre?: string}>}
 */
export async function buscarMarcaPorNombre(nombreMarca) {
  try {
    if (!nombreMarca) {
      return { exists: false, id_marca: null }
    }

    const nombreNormalizado = normalizarTexto(nombreMarca)

    // Obtener todas las marcas activas
    const { data: marcas, error } = await supabase
      .from('base_cuentas')
      .select('id, "ID marca", "Nombre marca"')
      .eq('Estado', true)

    if (error) {
      console.error('Error buscando marcas:', error)
      return { exists: false, id_marca: null }
    }

    if (!marcas || marcas.length === 0) {
      return { exists: false, id_marca: null }
    }

    // Buscar coincidencia
    for (const marca of marcas) {
      const nombreBaseDatos = normalizarTexto(marca['Nombre marca'] || '')

      // Coincidencia exacta
      if (nombreBaseDatos === nombreNormalizado) {
        return {
          exists: true,
          id_marca: marca['ID marca'],
          nombre: marca['Nombre marca']
        }
      }
    }

    // Segunda pasada: buscar coincidencias parciales
    for (const marca of marcas) {
      const nombreBaseDatos = normalizarTexto(marca['Nombre marca'] || '')

      // nombreMarca está contenido en el nombre de base de datos
      // Ej: "Mi Tienda" está en "Mi Tienda Online"
      if (nombreBaseDatos.includes(nombreNormalizado) && nombreNormalizado.length >= 3) {
        return {
          exists: true,
          id_marca: marca['ID marca'],
          nombre: marca['Nombre marca']
        }
      }

      // nombre de base de datos está contenido en nombreMarca
      // Ej: "Tienda" está en "Mi Tienda de Ropa"
      if (nombreNormalizado.includes(nombreBaseDatos) && nombreBaseDatos.length >= 3) {
        return {
          exists: true,
          id_marca: marca['ID marca'],
          nombre: marca['Nombre marca']
        }
      }
    }

    return { exists: false, id_marca: null }
  } catch (error) {
    console.error('Error en buscarMarcaPorNombre:', error)
    return { exists: false, id_marca: null }
  }
}

/**
 * Asocia un ID de marca de base_cuentas a un usuario
 * Actualiza el usuario con el id_marca encontrado y marca onboarding como completado
 * @param {number} userId - ID del usuario
 * @param {string} idMarca - ID de la marca en base_cuentas
 * @param {string} nombreMarca - Nombre de la marca
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function asociarMarcaAUsuario(userId, idMarca, nombreMarca) {
  try {
    const { error } = await supabase
      .from('usuarios')
      .update({
        id_marca: idMarca,
        nombre_marca: nombreMarca,
        onboarding_completado: true
      })
      .eq('id', userId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en asociarMarcaAUsuario:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// APROBACIÓN DE REGLAS (PUBLICACIONES)
// ============================================

/**
 * Obtiene aprobación pendiente por teléfono
 * @param {string} telefono - Número de teléfono
 * @returns {Promise<Object|null>}
 */
export async function obtenerAprobacionPendiente(telefono) {
  try {
    if (!telefono) return null

    const telefonoNormalizado = telefono.replace(/[\s\-\+]/g, '')

    const { data, error } = await supabase
      .from('whatsapp_pending_approvals')
      .select('*')
      .or(`telefono.eq.${telefonoNormalizado},telefono.eq.+${telefonoNormalizado}`)
      .eq('estado', 'pendiente')
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  } catch (error) {
    console.error('Error en obtenerAprobacionPendiente:', error)
    return null
  }
}

/**
 * Guarda una aprobación pendiente para tracking de WhatsApp
 * @param {Object} datos - Datos de la aprobación pendiente
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function guardarAprobacionPendiente(datos) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_pending_approvals')
      .upsert({
        telefono: datos.telefono,
        tarea_id: datos.tarea_id,
        post_id: datos.post_id,
        tipo: datos.tipo || 'aprobacion_regla',
        estado: 'pendiente',
        creado_en: new Date().toISOString()
      }, { onConflict: 'telefono' })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarAprobacionPendiente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Limpia aprobación pendiente después de respuesta
 * @param {string} telefono - Número de teléfono
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function limpiarAprobacionPendiente(telefono) {
  try {
    const telefonoNormalizado = telefono.replace(/[\s\-\+]/g, '')

    const { error } = await supabase
      .from('whatsapp_pending_approvals')
      .delete()
      .or(`telefono.eq.${telefonoNormalizado},telefono.eq.+${telefonoNormalizado}`)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en limpiarAprobacionPendiente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Aprueba una regla pendiente (activa el registro en base_cuentas)
 * @param {string} postId - ID de la publicación (clave en base_cuentas)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function aprobarRegla(postId) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .update({
        Estado: true,
        estado_aprobacion: 'activo'
      })
      .eq('clave', postId)
      .ilike('categoria', '%publicacion%')
      .eq('estado_aprobacion', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en aprobarRegla:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Rechaza una regla pendiente
 * @param {string} postId - ID de la publicación (clave en base_cuentas)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function rechazarRegla(postId) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .update({
        Estado: false,
        estado_aprobacion: 'rechazada'
      })
      .eq('clave', postId)
      .ilike('categoria', '%publicacion%')
      .eq('estado_aprobacion', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en rechazarRegla:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene reglas pendientes de aprobación para una marca
 * @param {string} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function obtenerReglasPendientes(idMarca) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('ID marca', idMarca)
      .ilike('categoria', '%publicacion%')
      .eq('estado_aprobacion', 'pendiente')
      .order('creado_en', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerReglasPendientes:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Obtiene el admin de una marca por id_marca
 * @param {string|number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function obtenerAdminMarca(idMarca) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, telefono, usuario, id_marca, nombre_marca')
      .eq('id_marca', idMarca)
      .eq('tipo_usuario', 'adm')
      .eq('activo', true)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return { success: !!data, data }
  } catch (error) {
    console.error('Error en obtenerAdminMarca:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Modifica campos de una publicación y la aprueba automáticamente
 * @param {number} id - ID del registro en base_cuentas
 * @param {Object} campos - Campos a actualizar
 * @param {string} [campos.categoria] - Categoría de la publicación
 * @param {string} [campos.clave] - Clave/identificador de la publicación
 * @param {string} [campos.valor] - Contenido/respuesta
 * @param {number} [campos.prioridad] - Prioridad (1-5)
 * @param {string} [campos.fecha_inicio] - Fecha de inicio
 * @param {string} [campos.fecha_caducidad] - Fecha de caducidad
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function modificarYAprobarRegla(id, campos) {
  try {
    // Construir objeto de actualización solo con campos proporcionados
    const updates = {
      Estado: true,
      estado_aprobacion: 'activo'
    }

    if (campos.categoria !== undefined) updates.categoria = campos.categoria
    if (campos.clave !== undefined) updates.clave = campos.clave
    if (campos.valor !== undefined) updates.valor = campos.valor
    if (campos.prioridad !== undefined) updates.prioridad = campos.prioridad
    if (campos.fecha_inicio !== undefined) updates.fecha_inicio = campos.fecha_inicio
    if (campos.fecha_caducidad !== undefined) updates.fecha_caducidad = campos.fecha_caducidad

    const { data, error } = await supabase
      .from('base_cuentas')
      .update(updates)
      .eq('id', id)
      .eq('estado_aprobacion', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en modificarYAprobarRegla:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene una publicación por su ID
 * @param {number} id - ID del registro en base_cuentas
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function obtenerPublicacionPorId(id) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerPublicacionPorId:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// SUPER ADMIN - MARCAS
// ============================================

/**
 * Obtiene el nombre de marca dado un id_marca
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, nombre_marca?: string, error?: string}>}
 */
export async function obtenerNombreMarca(idMarca) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre_marca')
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (error) throw error
    return { success: true, nombre_marca: data.nombre_marca }
  } catch (error) {
    console.error('Error en obtenerNombreMarca:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// INFORMES INSTAGRAM
// ============================================

/**
 * Obtiene los instagram_id vinculados a una marca desde cuentas_facebook
 * @param {number} idMarca - ID de la marca
 * @returns {Promise<string[]>} Lista de instagram_ids
 */
async function obtenerInstagramIdsDeMarca(idMarca) {
  const { data, error } = await supabase
    .from('cuentas_facebook')
    .select('instagram_id')
    .eq('id_marca', idMarca)
    .eq('activo', true)
    .not('instagram_id', 'is', null)

  if (error || !data) return []
  return data.map(c => c.instagram_id).filter(Boolean)
}

/**
 * Obtiene los informes de Instagram para una marca
 * Busca los instagram_id del usuario via cuentas_facebook y filtra informes
 * Excluye html_informe y metricas_raw por ser campos pesados
 * @param {number} idMarca - ID de la marca del usuario
 * @param {string} nombreMarca - Nombre de la marca (fallback)
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function obtenerInformesPorMarca(idMarca, nombreMarca) {
  try {
    // Obtener los instagram_id vinculados a la marca
    const instagramIds = await obtenerInstagramIdsDeMarca(idMarca)

    // Construir filtro: por instagram_id O por nombre_marca como fallback
    let query = supabase
      .from('informes_instagram')
      .select('id, instagram_id, nombre_marca, periodo_desde, periodo_hasta, total_posts, total_likes, total_comments, total_reach, total_impressions, total_saves, total_shares, engagement_rate, followers_count, bot_total, bot_respondidos, bot_inapropiados, industria, sub_industria, fecha_generacion, version_analyzer')

    if (instagramIds.length > 0) {
      query = query.or(`instagram_id.in.(${instagramIds.join(',')}),nombre_marca.eq.${nombreMarca}`)
    } else {
      query = query.eq('nombre_marca', nombreMarca)
    }

    const { data, error } = await query.order('fecha_generacion', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerInformesPorMarca:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene el HTML de un informe específico, validando pertenencia a la marca
 * @param {number} id - ID del informe
 * @param {number} idMarca - ID de la marca del usuario
 * @param {string} nombreMarca - Nombre de la marca (fallback)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function obtenerInformeHtml(id, idMarca, nombreMarca) {
  try {
    const { data, error } = await supabase
      .from('informes_instagram')
      .select('id, html_informe, nombre_marca, instagram_id')
      .eq('id', id)
      .single()

    if (error) throw error

    // Validar que el informe pertenezca a la marca del usuario
    const instagramIds = await obtenerInstagramIdsDeMarca(idMarca)
    const perteneceAMarca = instagramIds.includes(data.instagram_id) || data.nombre_marca === nombreMarca

    if (!perteneceAMarca) {
      return { success: false, error: 'No tienes acceso a este informe' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerInformeHtml:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// MARCAS DESDE CUENTAS INSTAGRAM (SUPER ADMIN)
// ============================================

export async function obtenerMarcasDesdeInstagram() {
  try {
    const { data, error } = await supabase
      .from('cuentas_instagram')
      .select('id, instagram_id, instagram_name, page_name')
      .eq('activo', true)
      .order('instagram_name', { ascending: true })

    if (error) throw error

    // instagram_id se usa como id_marca en el sistema
    const marcas = (data || [])
      .filter(ig => ig.instagram_id)
      .map(ig => ({
        id_marca: ig.instagram_id,
        instagram_name: ig.instagram_name,
        instagram_id: ig.instagram_id,
        page_name: ig.page_name
      }))

    return { success: true, data: marcas }
  } catch (error) {
    console.error('Error en obtenerMarcasDesdeInstagram:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// ============================================
// ENTRENADOR DE MARCA - DOCUMENTOS
// ============================================

export async function guardarDocumentoMarca(datos) {
  try {
    const { data, error } = await supabase
      .from('documentos_marca')
      .insert({
        id_marca: datos.id_marca,
        nombre_archivo: datos.nombre_archivo,
        tipo_archivo: datos.tipo_archivo,
        tamano: datos.tamano,
        url_archivo: datos.url_archivo,
        estado: 'pendiente'
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarDocumentoMarca:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerDocumentosMarca(idMarca, estado = null) {
  try {
    let query = supabase
      .from('documentos_marca')
      .select('*')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (estado) {
      query = query.eq('estado', estado)
    }

    const { data, error } = await query
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerDocumentosMarca:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function actualizarEstadoDocumento(id, estado, textoExtraido = null, errorMsg = null) {
  try {
    const updates = { estado }
    if (textoExtraido !== null) updates.texto_extraido = textoExtraido
    if (errorMsg !== null) updates.error_procesamiento = errorMsg
    if (estado === 'procesado') updates.procesado_en = new Date().toISOString()

    const { data, error } = await supabase
      .from('documentos_marca')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarEstadoDocumento:', error)
    return { success: false, error: error.message }
  }
}

export async function eliminarDocumentoMarca(id) {
  try {
    // Obtener doc para saber la URL del archivo
    const { data: doc, error: fetchError } = await supabase
      .from('documentos_marca')
      .select('url_archivo')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Eliminar archivo de Storage
    if (doc.url_archivo) {
      const path = doc.url_archivo.split('/entrenador-marca/').pop()
      if (path) {
        await supabase.storage.from('entrenador-marca').remove([path])
      }
    }

    // Eliminar registro
    const { error } = await supabase
      .from('documentos_marca')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en eliminarDocumentoMarca:', error)
    return { success: false, error: error.message }
  }
}

export async function subirArchivoEntrenador(buffer, fileName, idMarca) {
  try {
    const nombreLimpio = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${idMarca}/${Date.now()}_${nombreLimpio}`
    const { data, error } = await supabase.storage
      .from('entrenador-marca')
      .upload(path, buffer, {
        contentType: 'application/octet-stream',
        upsert: false
      })

    if (error) throw error

    const { data: urlData } = supabase.storage
      .from('entrenador-marca')
      .getPublicUrl(path)

    return { success: true, url: urlData.publicUrl, path }
  } catch (error) {
    console.error('Error en subirArchivoEntrenador:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// ENTRENADOR DE MARCA - CONOCIMIENTO
// ============================================

export async function guardarConocimientoBatch(entradas) {
  try {
    const { data, error } = await supabase
      .from('conocimiento_marca')
      .insert(entradas)
      .select()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarConocimientoBatch:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Elimina todo el conocimiento pendiente de una marca (para regenerar limpio)
 * Mantiene aprobado/editado intacto
 */
export async function eliminarConocimientoPendiente(idMarca) {
  try {
    const { data, error } = await supabase
      .from('conocimiento_marca')
      .delete()
      .eq('id_marca', idMarca)
      .eq('estado', 'pendiente')
      .select('id')

    if (error) throw error
    const eliminados = data?.length || 0
    console.log(`[Entrenador] Eliminados ${eliminados} conocimientos pendientes de marca ${idMarca}`)
    return { success: true, eliminados }
  } catch (error) {
    console.error('Error en eliminarConocimientoPendiente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Elimina todas las reglas propuestas [IA] no aprobadas de una marca
 */
export async function eliminarReglasPropuestas(idMarca) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .delete()
      .eq('ID marca', idMarca)
      .eq('Estado', false)
      .like('clave', '[IA] %')
      .select('id')

    if (error) throw error
    const eliminados = data?.length || 0
    console.log(`[Entrenador] Eliminadas ${eliminados} reglas [IA] pendientes de marca ${idMarca}`)
    return { success: true, eliminados }
  } catch (error) {
    console.error('Error en eliminarReglasPropuestas:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerConocimientoMarca(idMarca, estado = null) {
  try {
    let query = supabase
      .from('conocimiento_marca')
      .select('*')
      .eq('id_marca', idMarca)
      .order('categoria', { ascending: true })
      .order('confianza', { ascending: false })

    if (estado) {
      query = query.eq('estado', estado)
    }

    const { data, error } = await query
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerConocimientoMarca:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function actualizarEstadoConocimiento(ids, estado) {
  try {
    const updates = { estado }
    if (estado === 'aprobado') updates.aprobado_en = new Date().toISOString()

    const { data, error } = await supabase
      .from('conocimiento_marca')
      .update(updates)
      .in('id', ids)
      .select()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarEstadoConocimiento:', error)
    return { success: false, error: error.message }
  }
}

export async function editarConocimiento(id, updates) {
  try {
    const campos = {}
    if (updates.titulo !== undefined) campos.titulo = updates.titulo
    if (updates.contenido !== undefined) campos.contenido = updates.contenido
    if (updates.categoria !== undefined) campos.categoria = updates.categoria
    if (updates.confianza !== undefined) campos.confianza = updates.confianza
    campos.estado = 'editado'

    const { data, error } = await supabase
      .from('conocimiento_marca')
      .update(campos)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en editarConocimiento:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerConocimientoAprobado(idMarca) {
  try {
    const { data, error } = await supabase
      .from('conocimiento_marca')
      .select('categoria, titulo, contenido, confianza')
      .eq('id_marca', idMarca)
      .in('estado', ['aprobado', 'editado'])
      .order('categoria', { ascending: true })
      .order('confianza', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerConocimientoAprobado:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// ============================================
// ENTRENADOR DE MARCA - REGLAS PROPUESTAS
// ============================================

export async function guardarReglaPropuesta(regla) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .insert({
        'ID marca': regla.id_marca,
        'Nombre marca': regla.nombre_marca,
        categoria: regla.categoria,
        clave: `[IA] ${regla.clave}`,
        valor: regla.valor,
        prioridad: regla.prioridad,
        Estado: false,
        creado_en: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarReglaPropuesta:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerReglasPropuestas(idMarca) {
  try {
    const { data, error } = await supabase
      .from('base_cuentas')
      .select('*')
      .eq('ID marca', idMarca)
      .eq('Estado', false)
      .like('clave', '[IA] %')
      .order('prioridad', { ascending: true })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error en obtenerReglasPropuestas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function aprobarReglasPropuestas(ids) {
  try {
    // Aprobar: activar y quitar prefijo [IA]
    const { data: reglas } = await supabase
      .from('base_cuentas')
      .select('id, clave')
      .in('id', ids)

    for (const regla of (reglas || [])) {
      const claveClean = regla.clave.replace(/^\[IA\] /, '')
      await supabase
        .from('base_cuentas')
        .update({ Estado: true, clave: claveClean })
        .eq('id', regla.id)
    }

    return { success: true, data: reglas }
  } catch (error) {
    console.error('Error en aprobarReglasPropuestas:', error)
    return { success: false, error: error.message }
  }
}

export async function rechazarReglasPropuestas(ids) {
  try {
    const { error } = await supabase
      .from('base_cuentas')
      .delete()
      .in('id', ids)
      .eq('Estado', false)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en rechazarReglasPropuestas:', error)
    return { success: false, error: error.message }
  }
}

export async function editarReglaPropuesta(id, updates) {
  try {
    const campos = {}
    if (updates.categoria !== undefined) campos.categoria = updates.categoria
    if (updates.clave !== undefined) campos.clave = `[IA] ${updates.clave}`
    if (updates.valor !== undefined) campos.valor = updates.valor
    if (updates.prioridad !== undefined) campos.prioridad = updates.prioridad

    const { data, error } = await supabase
      .from('base_cuentas')
      .update(campos)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en editarReglaPropuesta:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// FLUJOS CONVERSACIONALES
// ============================================

/**
 * Crear un nuevo flujo
 */
export async function crearFlujo(datos) {
  try {
    const { data, error } = await supabase
      .from('flujos')
      .insert({
        id_marca: datos.id_marca,
        nombre: datos.nombre,
        descripcion: datos.descripcion || null,
        trigger_tipo: datos.trigger_tipo || 'keyword',
        trigger_valor: datos.trigger_valor || null,
        canales: datos.canales || ['whatsapp'],
        estado: datos.estado || 'borrador',
        es_template: datos.es_template || false,
        template_origen_id: datos.template_origen_id || null,
        nodos: datos.nodos || [],
        edges: datos.edges || [],
        variables_schema: datos.variables_schema || {},
        creado_por: datos.creado_por || null
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en crearFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todos los flujos de una marca
 */
export async function obtenerFlujos(idMarca) {
  try {
    const { data, error } = await supabase
      .from('flujos')
      .select('*')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerFlujos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener un flujo por ID
 */
export async function obtenerFlujo(id) {
  try {
    const { data, error } = await supabase
      .from('flujos')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un flujo
 */
export async function actualizarFlujo(id, datos) {
  try {
    const campos = { actualizado_en: new Date().toISOString() }
    if (datos.nombre !== undefined) campos.nombre = datos.nombre
    if (datos.descripcion !== undefined) campos.descripcion = datos.descripcion
    if (datos.trigger_tipo !== undefined) campos.trigger_tipo = datos.trigger_tipo
    if (datos.trigger_valor !== undefined) campos.trigger_valor = datos.trigger_valor
    if (datos.canales !== undefined) campos.canales = datos.canales
    if (datos.estado !== undefined) campos.estado = datos.estado
    if (datos.nodos !== undefined) campos.nodos = datos.nodos
    if (datos.edges !== undefined) campos.edges = datos.edges
    if (datos.variables_schema !== undefined) campos.variables_schema = datos.variables_schema
    if (datos.version !== undefined) campos.version = datos.version

    const { data, error } = await supabase
      .from('flujos')
      .update(campos)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un flujo
 */
export async function eliminarFlujo(id) {
  try {
    const { error } = await supabase
      .from('flujos')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en eliminarFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Buscar flujo activo que matchee un trigger
 */
export async function buscarFlujoPorTrigger(idMarca, canal, mensaje) {
  try {
    const { data, error } = await supabase
      .from('flujos')
      .select('*')
      .eq('id_marca', idMarca)
      .eq('estado', 'activo')
      .contains('canales', [canal])

    if (error) throw error
    if (!data || data.length === 0) return { success: true, data: null }

    const mensajeLower = mensaje.toLowerCase().trim()

    for (const flujo of data) {
      if (flujo.trigger_tipo === 'first_message') {
        return { success: true, data: flujo }
      }

      if (flujo.trigger_tipo === 'keyword' && flujo.trigger_valor) {
        const keywords = flujo.trigger_valor.split('|').map(k => k.trim().toLowerCase())
        const match = keywords.some(kw => mensajeLower.includes(kw))
        if (match) return { success: true, data: flujo }
      }
    }

    return { success: true, data: null }
  } catch (error) {
    console.error('Error en buscarFlujoPorTrigger:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener templates de flujos disponibles
 */
export async function obtenerFlujosTemplate() {
  try {
    const { data, error } = await supabase
      .from('flujos')
      .select('*')
      .eq('es_template', true)
      .order('nombre')

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerFlujosTemplate:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CONVERSACIONES DE FLUJO
// ============================================

/**
 * Crear nueva conversacion de flujo
 */
export async function crearConversacionFlujo(datos) {
  try {
    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .insert({
        id_marca: datos.id_marca,
        flujo_id: datos.flujo_id,
        canal: datos.canal,
        identificador_usuario: datos.identificador_usuario,
        nodo_actual_id: datos.nodo_actual_id || null,
        variables: datos.variables || {},
        estado: 'activa',
        metadata: datos.metadata || {}
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en crearConversacionFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener conversacion activa de un usuario en un canal
 */
export async function obtenerConversacionActiva(canal, identificadorUsuario) {
  try {
    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .select('*, flujos(*)')
      .eq('canal', canal)
      .eq('identificador_usuario', identificadorUsuario)
      .eq('estado', 'activa')
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerConversacionActiva:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar conversacion de flujo (nodo actual, variables, estado)
 */
export async function actualizarConversacionFlujo(id, datos) {
  try {
    const campos = { actualizado_en: new Date().toISOString() }
    if (datos.nodo_actual_id !== undefined) campos.nodo_actual_id = datos.nodo_actual_id
    if (datos.variables !== undefined) campos.variables = datos.variables
    if (datos.estado !== undefined) campos.estado = datos.estado
    if (datos.ejecutivo_asignado_id !== undefined) campos.ejecutivo_asignado_id = datos.ejecutivo_asignado_id
    if (datos.metadata !== undefined) campos.metadata = datos.metadata

    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .update(campos)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarConversacionFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Finalizar una conversacion de flujo
 */
export async function finalizarConversacion(id, estado = 'completada') {
  try {
    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .update({ estado, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en finalizarConversacion:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Listar conversaciones de flujo de una marca
 */
export async function obtenerConversacionesFlujo(idMarca, estado = null) {
  try {
    let query = supabase
      .from('conversaciones_flujo')
      .select('*, flujos(id, nombre)')
      .eq('id_marca', idMarca)
      .order('actualizado_en', { ascending: false })

    if (estado) query = query.eq('estado', estado)

    const { data, error } = await query
    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerConversacionesFlujo:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// MENSAJES DE FLUJO
// ============================================

/**
 * Guardar mensaje de flujo
 */
export async function guardarMensajeFlujo(datos) {
  try {
    const { data, error } = await supabase
      .from('mensajes_flujo')
      .insert({
        conversacion_id: datos.conversacion_id,
        direccion: datos.direccion,
        contenido: datos.contenido || null,
        tipo_nodo: datos.tipo_nodo || null,
        nodo_id: datos.nodo_id || null,
        metadata: datos.metadata || {}
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarMensajeFlujo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mensajes de una conversacion de flujo
 */
export async function obtenerMensajesFlujo(conversacionId) {
  try {
    const { data, error } = await supabase
      .from('mensajes_flujo')
      .select('*')
      .eq('conversacion_id', conversacionId)
      .order('creado_en', { ascending: true })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerMensajesFlujo:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// GOOGLE CALENDAR TOKENS
// ============================================

/**
 * Guardar o actualizar tokens de Google Calendar para una marca (upsert)
 */
export async function guardarTokenGoogleCalendar(datos) {
  try {
    const { data, error } = await supabase
      .from('google_calendar_tokens')
      .upsert({
        id_marca: datos.id_marca,
        email_calendar: datos.email_calendar || null,
        access_token: datos.access_token,
        refresh_token: datos.refresh_token,
        token_expires_at: datos.token_expires_at || null,
        calendar_id: datos.calendar_id || 'primary',
        conectado_por: datos.conectado_por || null,
        activo: true,
        actualizado_en: new Date().toISOString()
      }, { onConflict: 'id_marca' })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarTokenGoogleCalendar:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener token de Google Calendar activo para una marca
 */
export async function obtenerTokenGoogleCalendar(idMarca) {
  try {
    const { data, error } = await supabase
      .from('google_calendar_tokens')
      .select('*')
      .eq('id_marca', idMarca)
      .eq('activo', true)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return { success: true, data: data || null }
  } catch (error) {
    console.error('Error en obtenerTokenGoogleCalendar:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Desconectar Google Calendar de una marca
 */
export async function desconectarGoogleCalendar(idMarca) {
  try {
    const { data, error } = await supabase
      .from('google_calendar_tokens')
      .update({ activo: false, actualizado_en: new Date().toISOString() })
      .eq('id_marca', idMarca)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en desconectarGoogleCalendar:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CITAS AGENDADAS
// ============================================

/**
 * Guardar una cita agendada
 */
export async function guardarCita(datos) {
  try {
    const { data, error } = await supabase
      .from('citas_agendadas')
      .insert({
        id_marca: datos.id_marca,
        conversacion_id: datos.conversacion_id || null,
        google_event_id: datos.google_event_id || null,
        titulo: datos.titulo,
        fecha_inicio: datos.fecha_inicio,
        fecha_fin: datos.fecha_fin,
        nombre_cliente: datos.nombre_cliente || null,
        email_cliente: datos.email_cliente || null,
        telefono_cliente: datos.telefono_cliente || null,
        canal_origen: datos.canal_origen || null,
        metadata: datos.metadata || {}
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en guardarCita:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// DASHBOARD LIVE - CONVERSACIONES TRANSFERIDAS
// ============================================

/**
 * Obtener conversaciones transferidas de una marca (para dashboard live)
 */
export async function obtenerConversacionesTransferidas(idMarca) {
  try {
    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .select('*, flujos(id, nombre)')
      .eq('id_marca', idMarca)
      .in('estado', ['transferida'])
      .order('actualizado_en', { ascending: false })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en obtenerConversacionesTransferidas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una conversacion de flujo con todos sus mensajes (para dashboard live)
 */
export async function obtenerConversacionFlujoConMensajes(id) {
  try {
    const { data: conversacion, error: errConv } = await supabase
      .from('conversaciones_flujo')
      .select('*, flujos(id, nombre)')
      .eq('id', id)
      .single()

    if (errConv) throw errConv

    const { data: mensajes, error: errMsg } = await supabase
      .from('mensajes_flujo')
      .select('*')
      .eq('conversacion_id', id)
      .order('creado_en', { ascending: true })

    if (errMsg) throw errMsg

    return { success: true, data: { ...conversacion, mensajes } }
  } catch (error) {
    console.error('Error en obtenerConversacionFlujoConMensajes:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// INSTAGRAM / MULTI-CANAL
// ============================================

/**
 * Obtener cuenta de Facebook/Instagram por page_id (para webhook Instagram)
 */
export async function obtenerCuentaFacebookPorPageId(pageId) {
  try {
    const { data, error } = await supabase
      .from('cuentas_facebook')
      .select('*, cuentas_instagram(id_marca)')
      .eq('page_id', pageId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return { success: true, data: data || null }
  } catch (error) {
    console.error('Error en obtenerCuentaFacebookPorPageId:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener configuracion de web chat para una marca (info publica)
 */
export async function obtenerConfigWebChat(idMarca) {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre_marca, id_marca')
      .eq('id_marca', idMarca)
      .eq('activo', true)
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return { success: true, data: data ? { nombre: data.nombre_marca, id_marca: data.id_marca } : null }
  } catch (error) {
    console.error('Error en obtenerConfigWebChat:', error)
    return { success: false, error: error.message }
  }
}
