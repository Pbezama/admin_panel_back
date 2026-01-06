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
