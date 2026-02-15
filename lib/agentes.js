import { supabase } from './supabase.js'

// ============================================
// AGENTES - CRUD
// ============================================

export async function obtenerAgentes(idMarca) {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .select('*')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (error) throw error

    // Contar conversaciones activas por agente
    const { data: convActivas } = await supabase
      .from('conversaciones_flujo')
      .select('agente_activo_id')
      .eq('estado', 'activa')
      .not('agente_activo_id', 'is', null)

    const conteo = {}
    if (convActivas) {
      convActivas.forEach(c => {
        conteo[c.agente_activo_id] = (conteo[c.agente_activo_id] || 0) + 1
      })
    }

    const agentesConStats = data.map(a => ({
      ...a,
      conversaciones_activas: conteo[a.id] || 0
    }))

    return { success: true, data: agentesConStats }
  } catch (error) {
    console.error('Error en obtenerAgentes:', error)
    return { success: false, error: error.message }
  }
}

export async function obtenerAgente(id) {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    // Obtener herramientas del catálogo
    const { data: herramientas } = await supabase
      .from('agente_herramientas')
      .select('*')
      .eq('id_agente', id)

    // Obtener herramientas custom asignadas
    const { data: customAsignadas } = await supabase
      .from('agente_herramientas_custom')
      .select('*, herramientas_custom(*)')
      .eq('id_agente', id)

    // Contar conversaciones activas
    const { count } = await supabase
      .from('conversaciones_flujo')
      .select('id', { count: 'exact', head: true })
      .eq('agente_activo_id', id)
      .eq('estado', 'activa')

    return {
      success: true,
      data: {
        ...data,
        herramientas: herramientas || [],
        herramientas_custom: customAsignadas || [],
        conversaciones_activas: count || 0
      }
    }
  } catch (error) {
    console.error('Error en obtenerAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function crearAgente(datos) {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .insert({
        id_marca: datos.id_marca,
        nombre: datos.nombre,
        descripcion: datos.descripcion || null,
        objetivo: datos.objetivo || null,
        tono: datos.tono || 'profesional',
        instrucciones: datos.instrucciones || '',
        condiciones_cierre: datos.condiciones_cierre || null,
        estado: 'borrador',
        icono: datos.icono || '🤖',
        color: datos.color || '#8b5cf6',
        temperatura: datos.temperatura || 0.7,
        modelo: datos.modelo || 'gpt-4o-mini',
        categorias_conocimiento: datos.categorias_conocimiento || [],
        agentes_delegables: datos.agentes_delegables || [],
        max_turnos: datos.max_turnos || 50,
        creado_por: datos.creado_por || null
      })
      .select()
      .single()

    if (error) throw error

    // Crear herramientas del catálogo por defecto (todas habilitadas)
    const herramientasCatalogo = [
      'buscar_conocimiento', 'guardar_bd', 'crear_tarea', 'agendar_cita',
      'transferir_humano', 'finalizar_conversacion', 'enviar_mensaje', 'guardar_variable'
    ]

    const rows = herramientasCatalogo.map(tipo => ({
      id_agente: data.id,
      tipo,
      nombre: tipo,
      habilitada: true
    }))

    await supabase.from('agente_herramientas').insert(rows)

    return { success: true, data }
  } catch (error) {
    console.error('Error en crearAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function actualizarAgente(id, datos) {
  try {
    const campos = { actualizado_en: new Date().toISOString() }
    if (datos.nombre !== undefined) campos.nombre = datos.nombre
    if (datos.descripcion !== undefined) campos.descripcion = datos.descripcion
    if (datos.objetivo !== undefined) campos.objetivo = datos.objetivo
    if (datos.tono !== undefined) campos.tono = datos.tono
    if (datos.instrucciones !== undefined) campos.instrucciones = datos.instrucciones
    if (datos.condiciones_cierre !== undefined) campos.condiciones_cierre = datos.condiciones_cierre
    if (datos.estado !== undefined) campos.estado = datos.estado
    if (datos.icono !== undefined) campos.icono = datos.icono
    if (datos.color !== undefined) campos.color = datos.color
    if (datos.temperatura !== undefined) campos.temperatura = datos.temperatura
    if (datos.modelo !== undefined) campos.modelo = datos.modelo
    if (datos.categorias_conocimiento !== undefined) campos.categorias_conocimiento = datos.categorias_conocimiento
    if (datos.agentes_delegables !== undefined) campos.agentes_delegables = datos.agentes_delegables
    if (datos.max_turnos !== undefined) campos.max_turnos = datos.max_turnos

    const { data, error } = await supabase
      .from('agentes')
      .update(campos)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function eliminarAgente(id) {
  try {
    // Verificar que no haya conversaciones activas
    const { count } = await supabase
      .from('conversaciones_flujo')
      .select('id', { count: 'exact', head: true })
      .eq('agente_activo_id', id)
      .eq('estado', 'activa')

    if (count > 0) {
      return { success: false, error: 'No se puede eliminar: hay conversaciones activas con este agente' }
    }

    const { error } = await supabase
      .from('agentes')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en eliminarAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function duplicarAgente(id) {
  try {
    const { data: original, error: fetchError } = await supabase
      .from('agentes')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    const { id: _, creado_en, actualizado_en, ...resto } = original

    const { data: copia, error: insertError } = await supabase
      .from('agentes')
      .insert({
        ...resto,
        nombre: `${original.nombre} (copia)`,
        estado: 'borrador'
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Copiar herramientas
    const { data: herramientas } = await supabase
      .from('agente_herramientas')
      .select('tipo, nombre, habilitada')
      .eq('id_agente', id)

    if (herramientas?.length) {
      await supabase.from('agente_herramientas').insert(
        herramientas.map(h => ({ ...h, id_agente: copia.id }))
      )
    }

    // Copiar asignaciones custom
    const { data: customAsign } = await supabase
      .from('agente_herramientas_custom')
      .select('id_herramienta, habilitada')
      .eq('id_agente', id)

    if (customAsign?.length) {
      await supabase.from('agente_herramientas_custom').insert(
        customAsign.map(h => ({ ...h, id_agente: copia.id }))
      )
    }

    return { success: true, data: copia }
  } catch (error) {
    console.error('Error en duplicarAgente:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// HERRAMIENTAS DEL CATÁLOGO (por agente)
// ============================================

export async function getHerramientasAgente(idAgente) {
  try {
    const { data, error } = await supabase
      .from('agente_herramientas')
      .select('*')
      .eq('id_agente', idAgente)

    if (error) throw error

    // También obtener custom asignadas
    const { data: custom } = await supabase
      .from('agente_herramientas_custom')
      .select('*, herramientas_custom(*)')
      .eq('id_agente', idAgente)

    return { success: true, data: { catalogo: data || [], custom: custom || [] } }
  } catch (error) {
    console.error('Error en getHerramientasAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function setHerramientasAgente(idAgente, herramientas) {
  try {
    // Actualizar catálogo
    if (herramientas.catalogo) {
      for (const h of herramientas.catalogo) {
        await supabase
          .from('agente_herramientas')
          .update({ habilitada: h.habilitada })
          .eq('id_agente', idAgente)
          .eq('tipo', h.tipo)
      }
    }

    // Actualizar custom: eliminar todas y reinsertar
    if (herramientas.custom_ids !== undefined) {
      await supabase
        .from('agente_herramientas_custom')
        .delete()
        .eq('id_agente', idAgente)

      if (herramientas.custom_ids.length > 0) {
        await supabase.from('agente_herramientas_custom').insert(
          herramientas.custom_ids.map(idH => ({
            id_agente: idAgente,
            id_herramienta: idH,
            habilitada: true
          }))
        )
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error en setHerramientasAgente:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// HERRAMIENTAS CUSTOM (por marca)
// ============================================

export async function getHerramientasCustom(idMarca) {
  try {
    const { data, error } = await supabase
      .from('herramientas_custom')
      .select('*')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en getHerramientasCustom:', error)
    return { success: false, error: error.message }
  }
}

export async function crearHerramientaCustom(datos) {
  try {
    const { data, error } = await supabase
      .from('herramientas_custom')
      .insert({
        id_marca: datos.id_marca,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        parametros: datos.parametros || [],
        endpoint_url: datos.endpoint_url,
        metodo_http: datos.metodo_http || 'POST',
        headers: datos.headers || {},
        body_template: datos.body_template || {}
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en crearHerramientaCustom:', error)
    return { success: false, error: error.message }
  }
}

export async function actualizarHerramientaCustom(id, datos) {
  try {
    const campos = {}
    if (datos.nombre !== undefined) campos.nombre = datos.nombre
    if (datos.descripcion !== undefined) campos.descripcion = datos.descripcion
    if (datos.parametros !== undefined) campos.parametros = datos.parametros
    if (datos.endpoint_url !== undefined) campos.endpoint_url = datos.endpoint_url
    if (datos.metodo_http !== undefined) campos.metodo_http = datos.metodo_http
    if (datos.headers !== undefined) campos.headers = datos.headers
    if (datos.body_template !== undefined) campos.body_template = datos.body_template
    if (datos.estado !== undefined) campos.estado = datos.estado

    const { data, error } = await supabase
      .from('herramientas_custom')
      .update(campos)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en actualizarHerramientaCustom:', error)
    return { success: false, error: error.message }
  }
}

export async function eliminarHerramientaCustom(id) {
  try {
    const { error } = await supabase
      .from('herramientas_custom')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en eliminarHerramientaCustom:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CONOCIMIENTO DEL AGENTE
// ============================================

export async function getConocimientoAgente(idAgente) {
  try {
    const { data, error } = await supabase
      .from('agente_conocimiento')
      .select('*')
      .eq('id_agente', idAgente)
      .order('creado_en', { ascending: false })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en getConocimientoAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function addConocimientoAgente(idAgente, fragmento) {
  try {
    const { data, error } = await supabase
      .from('agente_conocimiento')
      .insert({
        id_agente: idAgente,
        titulo: fragmento.titulo || null,
        contenido: fragmento.contenido,
        categoria: fragmento.categoria || null,
        estado: 'aprobado'
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en addConocimientoAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteConocimientoAgente(idFragmento) {
  try {
    const { error } = await supabase
      .from('agente_conocimiento')
      .delete()
      .eq('id', idFragmento)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Error en deleteConocimientoAgente:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// DOCUMENTOS DEL AGENTE
// ============================================

export async function getDocumentosAgente(idAgente) {
  try {
    const { data, error } = await supabase
      .from('agente_documentos')
      .select('*')
      .eq('id_agente', idAgente)
      .order('creado_en', { ascending: false })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en getDocumentosAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function crearDocumentoAgente(datos) {
  try {
    const { data, error } = await supabase
      .from('agente_documentos')
      .insert({
        id_agente: datos.id_agente,
        nombre: datos.nombre,
        tipo: datos.tipo || null,
        url_archivo: datos.url_archivo || null,
        contenido_extraido: datos.contenido_extraido || null,
        estado: 'pendiente'
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en crearDocumentoAgente:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CONVERSACIONES DE AGENTES
// ============================================

export async function getConversacionesAgente(idAgente, estado = null) {
  try {
    let query = supabase
      .from('conversaciones_flujo')
      .select('*')
      .eq('agente_activo_id', idAgente)
      .order('actualizado_en', { ascending: false })

    if (estado) {
      query = query.eq('estado', estado)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en getConversacionesAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function getMensajesConversacionAgente(convId) {
  try {
    const { data, error } = await supabase
      .from('mensajes_flujo')
      .select('*')
      .eq('conversacion_id', convId)
      .order('creado_en', { ascending: true })

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en getMensajesConversacionAgente:', error)
    return { success: false, error: error.message }
  }
}

export async function cerrarConversacionAgente(convId) {
  try {
    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .update({
        estado: 'completada',
        agente_activo_id: null,
        actualizado_en: new Date().toISOString()
      })
      .eq('id', convId)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error en cerrarConversacionAgente:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CATEGORÍAS DE CONOCIMIENTO DE MARCA
// ============================================

export async function getCategoriasConocimientoMarca(idMarca) {
  try {
    const { data, error } = await supabase
      .from('conocimiento_marca')
      .select('categoria')
      .eq('id_marca', idMarca)
      .eq('estado', 'aprobado')

    if (error) throw error

    // Agrupar por categoría con conteo
    const categorias = {}
    ;(data || []).forEach(item => {
      const cat = item.categoria || 'sin_categoria'
      categorias[cat] = (categorias[cat] || 0) + 1
    })

    return {
      success: true,
      data: Object.entries(categorias).map(([nombre, count]) => ({ nombre, count }))
    }
  } catch (error) {
    console.error('Error en getCategoriasConocimientoMarca:', error)
    return { success: false, error: error.message }
  }
}
