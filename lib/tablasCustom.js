/**
 * Funciones DB para tablas_custom y registros_custom
 */
import { supabase } from '@/lib/supabase'
const supabaseAdmin = supabase

// ─── Tablas (esquemas) ────────────────────────────────────────────────────────

export async function listarTablasCustom(idMarca) {
  try {
    // Obtener tablas con conteo de registros
    const { data, error } = await supabaseAdmin
      .from('tablas_custom')
      .select('*, registros_custom(count)')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (error) return { success: false, error: error.message }

    const tablas = (data || []).map(t => ({
      ...t,
      total_registros: t.registros_custom?.[0]?.count ?? 0,
      registros_custom: undefined
    }))

    return { success: true, data: tablas }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function crearTablaCustom(idMarca, { nombre, descripcion, columnas }) {
  try {
    const { data, error } = await supabaseAdmin
      .from('tablas_custom')
      .insert({ id_marca: idMarca, nombre, descripcion: descripcion || null, columnas: columnas || [] })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function obtenerTablaCustom(id, idMarca) {
  try {
    const { data, error } = await supabaseAdmin
      .from('tablas_custom')
      .select('*')
      .eq('id', id)
      .eq('id_marca', idMarca)
      .single()

    if (error) return { success: false, error: error.message }

    const { count } = await supabaseAdmin
      .from('registros_custom')
      .select('*', { count: 'exact', head: true })
      .eq('tabla_id', id)
      .eq('id_marca', idMarca)

    return { success: true, data: { ...data, total_registros: count || 0 } }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function actualizarTablaCustom(id, idMarca, { nombre, descripcion, columnas }) {
  try {
    const update = { actualizado_en: new Date().toISOString() }
    if (nombre !== undefined) update.nombre = nombre
    if (descripcion !== undefined) update.descripcion = descripcion
    if (columnas !== undefined) update.columnas = columnas

    const { data, error } = await supabaseAdmin
      .from('tablas_custom')
      .update(update)
      .eq('id', id)
      .eq('id_marca', idMarca)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function eliminarTablaCustom(id, idMarca) {
  try {
    const { error } = await supabaseAdmin
      .from('tablas_custom')
      .delete()
      .eq('id', id)
      .eq('id_marca', idMarca)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ─── Registros (datos) ────────────────────────────────────────────────────────

export async function listarRegistrosCustom(tablaId, idMarca, { pagina = 1, porPagina = 50, filtros = {} } = {}) {
  try {
    const desde = (pagina - 1) * porPagina

    let query = supabaseAdmin
      .from('registros_custom')
      .select('*', { count: 'exact' })
      .eq('tabla_id', tablaId)
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })
      .range(desde, desde + porPagina - 1)

    // Filtros sobre columnas JSONB: datos->>'columna' = valor
    for (const [col, val] of Object.entries(filtros)) {
      if (col && val !== undefined && val !== '') {
        query = query.filter(`datos->>${col}`, 'eq', String(val))
      }
    }

    const { data, error, count } = await query
    if (error) return { success: false, error: error.message }

    return { success: true, data: data || [], total: count || 0, pagina, porPagina }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function insertarRegistroCustom(tablaId, tablaNombre, idMarca, datos, conversacionId = null) {
  try {
    const { data, error } = await supabaseAdmin
      .from('registros_custom')
      .insert({
        id_marca: idMarca,
        tabla_id: tablaId,
        tabla_nombre: tablaNombre,
        datos: datos || {},
        conversacion_id: conversacionId || null
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function actualizarRegistrosCustom(tablaId, idMarca, datosActualizar, filtros = []) {
  try {
    let query = supabaseAdmin
      .from('registros_custom')
      .update({ datos: datosActualizar, actualizado_en: new Date().toISOString() })
      .eq('tabla_id', tablaId)
      .eq('id_marca', idMarca)

    query = _aplicarFiltros(query, filtros)

    const { error, count } = await query.select('*', { count: 'exact', head: true })
    if (error) return { success: false, error: error.message }
    return { success: true, actualizados: count || 0 }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function eliminarRegistrosCustom(tablaId, idMarca, filtros = []) {
  try {
    let query = supabaseAdmin
      .from('registros_custom')
      .delete()
      .eq('tabla_id', tablaId)
      .eq('id_marca', idMarca)

    query = _aplicarFiltros(query, filtros)

    const { error } = await query
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function insertarRegistrosBulk(tablaId, tablaNombre, idMarca, filas) {
  try {
    const registros = filas.map(datos => ({
      id_marca: idMarca,
      tabla_id: tablaId,
      tabla_nombre: tablaNombre,
      datos: datos || {}
    }))

    const BATCH = 500
    let insertados = 0
    for (let i = 0; i < registros.length; i += BATCH) {
      const lote = registros.slice(i, i + BATCH)
      const { error } = await supabaseAdmin.from('registros_custom').insert(lote)
      if (error) return { success: false, error: error.message }
      insertados += lote.length
    }

    return { success: true, insertados }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _aplicarFiltros(query, filtros) {
  for (const f of filtros) {
    const col = f.columna || f.col
    const op = f.operador || f.op || 'eq'
    const val = String(f.valor ?? f.val ?? '')
    if (!col) continue
    const jsonCol = `datos->>${col}`
    if (op === 'eq')   query = query.filter(jsonCol, 'eq', val)
    if (op === 'neq')  query = query.filter(jsonCol, 'neq', val)
    if (op === 'like') query = query.filter(jsonCol, 'ilike', `%${val}%`)
    if (op === 'gt')   query = query.filter(jsonCol, 'gt', val)
    if (op === 'lt')   query = query.filter(jsonCol, 'lt', val)
  }
  return query
}
