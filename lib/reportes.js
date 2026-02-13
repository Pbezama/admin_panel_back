/**
 * Motor de Reportes - CreceTec Admin Panel
 *
 * Genera reportes desde todas las fuentes de datos del sistema,
 * con soporte para exportar en CSV, Excel, PDF y HTML interactivo.
 */

import { supabase } from './supabase.js'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ============================================
// DEFINICIONES DE TIPOS DE REPORTE
// ============================================

export const TIPOS_REPORTE = {
  comentarios: {
    id: 'comentarios',
    label: 'Comentarios RRSS',
    tabla: 'logs_comentarios',
    adminOnly: false,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'comentario_original', label: 'Comentario' },
      { key: 'respuesta_comentario', label: 'Respuesta' },
      { key: 'clasificacion', label: 'Clasificacion' },
      { key: 'es_inapropiado', label: 'Inapropiado' },
      { key: 'nombre_usuario', label: 'Usuario' },
      { key: 'plataforma', label: 'Plataforma' },
      { key: 'creado_en', label: 'Fecha' }
    ]
  },
  tareas: {
    id: 'tareas',
    label: 'Tareas',
    tabla: 'tareas',
    adminOnly: false,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'titulo', label: 'Titulo' },
      { key: 'descripcion', label: 'Descripcion' },
      { key: 'estado', label: 'Estado' },
      { key: 'prioridad', label: 'Prioridad' },
      { key: 'asignado_a', label: 'Asignado a' },
      { key: 'creado_por_nombre', label: 'Creado por' },
      { key: 'fecha_creacion', label: 'Creacion' },
      { key: 'fecha_completada', label: 'Completada' }
    ]
  },
  usuarios: {
    id: 'usuarios',
    label: 'Usuarios de la Marca',
    tabla: 'usuarios',
    adminOnly: true,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'usuario', label: 'Email' },
      { key: 'tipo_usuario', label: 'Tipo' },
      { key: 'activo', label: 'Activo' },
      { key: 'plan', label: 'Plan' },
      { key: 'ultimo_login', label: 'Ultimo Login' },
      { key: 'fecha_registro', label: 'Registro' }
    ]
  },
  base_datos: {
    id: 'base_datos',
    label: 'Base de Datos (Reglas)',
    tabla: 'base_cuentas',
    adminOnly: true,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'clave', label: 'Clave' },
      { key: 'valor', label: 'Valor' },
      { key: 'prioridad', label: 'Prioridad' },
      { key: 'Estado', label: 'Activo' },
      { key: 'estado_aprobacion', label: 'Aprobacion' },
      { key: 'creado_en', label: 'Fecha' }
    ]
  },
  mensajes_chat: {
    id: 'mensajes_chat',
    label: 'Mensajes DM',
    tabla: 'dm_conversaciones',
    adminOnly: false,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'sender_id', label: 'Remitente' },
      { key: 'platform', label: 'Plataforma' },
      { key: 'role', label: 'Rol' },
      { key: 'content', label: 'Contenido' },
      { key: 'instagram_id', label: 'Cuenta IG' },
      { key: 'created_at', label: 'Fecha' }
    ]
  },
  flujos: {
    id: 'flujos',
    label: 'Flujos Conversacionales',
    tabla: 'flujos',
    adminOnly: false,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'descripcion', label: 'Descripcion' },
      { key: 'trigger_tipo', label: 'Trigger' },
      { key: 'estado', label: 'Estado' },
      { key: 'canales', label: 'Canales' },
      { key: 'creado_en', label: 'Fecha Creacion' }
    ]
  },
  conversaciones_transferidas: {
    id: 'conversaciones_transferidas',
    label: 'Conversaciones Transferidas',
    tabla: 'conversaciones_flujo',
    adminOnly: false,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'canal', label: 'Canal' },
      { key: 'identificador_usuario', label: 'Usuario' },
      { key: 'estado', label: 'Estado' },
      { key: 'flujo_nombre', label: 'Flujo' },
      { key: 'creado_en', label: 'Iniciada' },
      { key: 'actualizado_en', label: 'Actualizada' }
    ]
  },
  conocimiento: {
    id: 'conocimiento',
    label: 'Conocimiento de Marca',
    tabla: 'conocimiento_marca',
    adminOnly: false,
    columnas: [
      { key: 'id', label: 'ID' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'titulo', label: 'Titulo' },
      { key: 'contenido', label: 'Contenido' },
      { key: 'confianza', label: 'Confianza' },
      { key: 'estado', label: 'Estado' }
    ]
  }
}

// ============================================
// MOTOR DE CONSULTAS
// ============================================

/**
 * Consulta datos para un tipo de reporte con filtros
 */
export async function queryReporte(tipo, filtros = {}, idMarca) {
  const config = TIPOS_REPORTE[tipo]
  if (!config) {
    return { success: false, error: `Tipo de reporte no valido: ${tipo}` }
  }

  try {
    const { fechaDesde, fechaHasta, limite = 500, offset = 0 } = filtros

    let data, total

    switch (tipo) {
      case 'comentarios':
        ({ data, total } = await queryComentarios(idMarca, filtros))
        break
      case 'tareas':
        ({ data, total } = await queryTareas(idMarca, filtros))
        break
      case 'usuarios':
        ({ data, total } = await queryUsuarios(idMarca, filtros))
        break
      case 'base_datos':
        ({ data, total } = await queryBaseDatos(idMarca, filtros))
        break
      case 'mensajes_chat':
        ({ data, total } = await queryMensajesChat(idMarca, filtros))
        break
      case 'flujos':
        ({ data, total } = await queryFlujos(idMarca, filtros))
        break
      case 'conversaciones_transferidas':
        ({ data, total } = await queryConversacionesTransferidas(idMarca, filtros))
        break
      case 'conocimiento':
        ({ data, total } = await queryConocimiento(idMarca, filtros))
        break
      default:
        return { success: false, error: 'Tipo no implementado' }
    }

    return {
      success: true,
      data: data || [],
      total: total || (data?.length || 0),
      columnas: config.columnas
    }
  } catch (error) {
    console.error(`Error en queryReporte(${tipo}):`, error)
    return { success: false, error: error.message }
  }
}

// --- Query functions per type ---

async function queryComentarios(idMarca, filtros) {
  const { fechaDesde, fechaHasta, clasificacion, esInapropiado, textoLibre, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('logs_comentarios')
    .select('*', { count: 'exact' })
    .eq('id_marca', idMarca)
    .order('creado_en', { ascending: false })

  if (fechaDesde) query = query.gte('creado_en', fechaDesde)
  if (fechaHasta) query = query.lte('creado_en', fechaHasta)
  if (clasificacion) query = query.eq('clasificacion', clasificacion)
  if (esInapropiado !== undefined && esInapropiado !== '') {
    query = query.eq('es_inapropiado', esInapropiado === true || esInapropiado === 'true')
  }
  if (textoLibre) {
    query = query.or(`comentario_original.ilike.%${textoLibre}%,respuesta_comentario.ilike.%${textoLibre}%`)
  }

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function queryTareas(idMarca, filtros) {
  const { fechaDesde, fechaHasta, estado, prioridad, asignadoA, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('tareas')
    .select('*', { count: 'exact' })
    .eq('id_marca', idMarca)
    .order('fecha_creacion', { ascending: false })

  if (fechaDesde) query = query.gte('fecha_creacion', fechaDesde)
  if (fechaHasta) query = query.lte('fecha_creacion', fechaHasta)
  if (estado) query = query.eq('estado', estado)
  if (prioridad) query = query.eq('prioridad', prioridad)
  if (asignadoA) query = query.eq('asignado_a', asignadoA)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function queryUsuarios(idMarca, filtros) {
  const { tipoUsuario, activo, fechaDesde, fechaHasta, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('usuarios')
    .select('id, nombre, usuario, tipo_usuario, activo, plan, ultimo_login, fecha_registro, telefono', { count: 'exact' })
    .eq('id_marca', idMarca)
    .order('fecha_registro', { ascending: false })

  if (tipoUsuario) query = query.eq('tipo_usuario', tipoUsuario)
  if (activo !== undefined && activo !== '') {
    query = query.eq('activo', activo === true || activo === 'true')
  }
  if (fechaDesde) query = query.gte('fecha_registro', fechaDesde)
  if (fechaHasta) query = query.lte('fecha_registro', fechaHasta)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function queryBaseDatos(idMarca, filtros) {
  const { categoria, estadoActivo, prioridad, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('base_cuentas')
    .select('*', { count: 'exact' })
    .eq('ID marca', idMarca)
    .order('creado_en', { ascending: false })

  if (categoria) query = query.ilike('categoria', `%${categoria}%`)
  if (estadoActivo !== undefined && estadoActivo !== '') {
    query = query.eq('Estado', estadoActivo === true || estadoActivo === 'true')
  }
  if (prioridad) query = query.eq('prioridad', prioridad)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function queryMensajesChat(idMarca, filtros) {
  const { fechaDesde, fechaHasta, platform, role, textoLibre, limite = 500, offset = 0 } = filtros

  // Obtener instagram_ids de la marca para filtrar dm_conversaciones
  const instagramIds = await obtenerInstagramIdsMarca(idMarca)

  if (instagramIds.length === 0) {
    return { data: [], total: 0 }
  }

  let query = supabase
    .from('dm_conversaciones')
    .select('*', { count: 'exact' })
    .in('instagram_id', instagramIds)
    .order('created_at', { ascending: false })

  if (fechaDesde) query = query.gte('created_at', fechaDesde)
  if (fechaHasta) query = query.lte('created_at', fechaHasta)
  if (platform) query = query.eq('platform', platform)
  if (role) query = query.eq('role', role)
  if (textoLibre) query = query.ilike('content', `%${textoLibre}%`)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

// Helper: obtener instagram_ids vinculados a una marca
async function obtenerInstagramIdsMarca(idMarca) {
  const { data, error } = await supabase
    .from('cuentas_facebook')
    .select('instagram_id')
    .eq('id_marca', idMarca)
    .eq('activo', true)
    .not('instagram_id', 'is', null)

  if (error || !data) return []
  return data.map(c => c.instagram_id).filter(Boolean)
}

async function queryFlujos(idMarca, filtros) {
  const { estado, canal, fechaDesde, fechaHasta, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('flujos')
    .select('*', { count: 'exact' })
    .eq('id_marca', idMarca)
    .order('creado_en', { ascending: false })

  if (estado) query = query.eq('estado', estado)
  if (fechaDesde) query = query.gte('creado_en', fechaDesde)
  if (fechaHasta) query = query.lte('creado_en', fechaHasta)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error

  // Enrich with conversation counts
  const flujosConStats = await Promise.all((data || []).map(async (flujo) => {
    const { count: convCount } = await supabase
      .from('conversaciones_flujo')
      .select('*', { count: 'exact', head: true })
      .eq('flujo_id', flujo.id)

    return { ...flujo, total_conversaciones: convCount || 0 }
  }))

  return { data: flujosConStats, total: count || 0 }
}

async function queryConversacionesTransferidas(idMarca, filtros) {
  const { estado, fechaDesde, fechaHasta, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('conversaciones_flujo')
    .select('*, flujos(id, nombre)', { count: 'exact' })
    .eq('id_marca', idMarca)
    .in('estado', ['transferida', 'cerrada_agente', 'cerrada'])
    .order('actualizado_en', { ascending: false })

  if (estado) query = query.eq('estado', estado)
  if (fechaDesde) query = query.gte('creado_en', fechaDesde)
  if (fechaHasta) query = query.lte('creado_en', fechaHasta)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error

  const enriched = (data || []).map(conv => ({
    ...conv,
    flujo_nombre: conv.flujos?.nombre || 'Sin flujo'
  }))

  return { data: enriched, total: count || 0 }
}

async function queryConocimiento(idMarca, filtros) {
  const { estado, categoria, fechaDesde, fechaHasta, limite = 500, offset = 0 } = filtros

  let query = supabase
    .from('conocimiento_marca')
    .select('*', { count: 'exact' })
    .eq('id_marca', idMarca)
    .order('categoria', { ascending: true })

  if (estado) query = query.eq('estado', estado)
  if (categoria) query = query.ilike('categoria', `%${categoria}%`)

  query = query.range(offset, offset + limite - 1)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

// ============================================
// EXPORTAR CSV
// ============================================

export function exportarCSV(datos, columnas) {
  if (!datos || datos.length === 0) {
    return columnas.map(c => c.label).join(',') + '\n'
  }

  const header = columnas.map(c => `"${c.label}"`).join(',')
  const rows = datos.map(row => {
    return columnas.map(c => {
      let val = row[c.key]
      if (val === null || val === undefined) val = ''
      if (typeof val === 'object') val = JSON.stringify(val)
      val = String(val).replace(/"/g, '""')
      return `"${val}"`
    }).join(',')
  })

  return '\uFEFF' + header + '\n' + rows.join('\n')
}

// ============================================
// EXPORTAR EXCEL
// ============================================

export function exportarExcel(datos, columnas, titulo = 'Reporte') {
  const wb = XLSX.utils.book_new()

  const headers = columnas.map(c => c.label)
  const rows = datos.map(row => columnas.map(c => {
    let val = row[c.key]
    if (typeof val === 'object' && val !== null) val = JSON.stringify(val)
    return val ?? ''
  }))

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Column widths
  ws['!cols'] = columnas.map((c, i) => {
    const maxLen = Math.max(
      c.label.length,
      ...rows.map(r => String(r[i] || '').length)
    )
    return { wch: Math.min(maxLen + 2, 50) }
  })

  XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 31))

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// ============================================
// EXPORTAR PDF
// ============================================

export async function exportarPDF(datos, columnas, titulo = 'Reporte', nombreMarca = '') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, 148, 14, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${nombreMarca} | Generado: ${new Date().toLocaleDateString('es-CL')} | Total: ${datos.length} registros`,
    148, 21, { align: 'center' }
  )

  // Table
  const maxCols = Math.min(columnas.length, 8)
  const displayCols = columnas.slice(0, maxCols)
  const maxRows = Math.min(datos.length, 200)

  const head = [displayCols.map(c => c.label)]
  const body = datos.slice(0, maxRows).map(row =>
    displayCols.map(col => {
      let val = row[col.key]
      if (val === null || val === undefined) return ''
      if (typeof val === 'object') val = JSON.stringify(val)
      return String(val).substring(0, 80)
    })
  )

  autoTable(doc, {
    startY: 26,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5 },
    styles: { cellPadding: 2, overflow: 'ellipsize' },
    margin: { left: 10, right: 10 }
  })

  if (datos.length > maxRows) {
    const finalY = doc.lastAutoTable?.finalY || 180
    doc.setFontSize(8)
    doc.text(`... y ${datos.length - maxRows} registros mas`, 148, finalY + 8, { align: 'center' })
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// ============================================
// GENERAR HTML INTERACTIVO (estilo informe_marca.py)
// ============================================

export function generarHTMLInteractivo(tipo, datos, config = {}) {
  const tipoConfig = TIPOS_REPORTE[tipo]
  if (!tipoConfig) return '<html><body><h1>Tipo no valido</h1></body></html>'

  const { nombreMarca = 'Marca', filtros = {} } = config
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  const stats = calcularEstadisticas(tipo, datos)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte ${tipoConfig.label} - ${nombreMarca}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f0f2f5; color: #1a1a2e; }

  .header { background: linear-gradient(135deg, hsl(222, 35%, 28%), hsl(222, 25%, 15%)); color: #fff; padding: 32px 24px; text-align: center; }
  .header h1 { font-size: 28px; margin-bottom: 4px; }
  .header .subtitle { opacity: 0.8; font-size: 14px; }
  .header .marca { font-size: 16px; margin-top: 8px; padding: 4px 16px; background: rgba(255,255,255,0.15); border-radius: 20px; display: inline-block; }

  .tabs { display: flex; background: #fff; border-bottom: 2px solid #e2e8f0; padding: 0 24px; overflow-x: auto; }
  .tab { padding: 14px 24px; cursor: pointer; font-weight: 600; font-size: 14px; color: #64748b; border-bottom: 3px solid transparent; transition: all 0.2s; white-space: nowrap; }
  .tab:hover { color: hsl(222, 35%, 28%); }
  .tab.active { color: hsl(222, 35%, 28%); border-bottom-color: hsl(4, 65%, 48%); }

  .content { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .panel { display: none; }
  .panel.active { display: block; }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .stat-card .stat-value { font-size: 28px; font-weight: 700; color: hsl(222, 35%, 28%); }
  .stat-card .stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }

  .chart-container { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .chart-container h3 { margin-bottom: 16px; color: hsl(222, 25%, 18%); }
  .chart-wrapper { position: relative; height: 300px; }

  .table-container { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .table-container h3 { padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: hsl(222, 25%, 18%); }
  table { width: 100%; border-collapse: collapse; }
  th { background: hsl(220, 20%, 96%); padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tr:hover { background: hsl(220, 20%, 98%); }

  .badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }

  .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; }

  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .header h1 { font-size: 20px; }
    .content { padding: 16px; }
    td, th { padding: 8px 6px; font-size: 11px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Reporte: ${tipoConfig.label}</h1>
  <div class="subtitle">${fecha} | ${datos.length} registros</div>
  <div class="marca">${nombreMarca}</div>
</div>

<div class="tabs">
  <div class="tab active" onclick="showTab('resumen')">Resumen</div>
  <div class="tab" onclick="showTab('graficos')">Graficos</div>
  <div class="tab" onclick="showTab('datos')">Datos</div>
</div>

<div class="content">
  <!-- TAB RESUMEN -->
  <div id="tab-resumen" class="panel active">
    <div class="stats-grid">
      ${stats.cards.map(card => `
        <div class="stat-card">
          <div class="stat-value">${card.value}</div>
          <div class="stat-label">${card.label}</div>
        </div>
      `).join('')}
    </div>
    ${stats.resumenHTML || ''}
  </div>

  <!-- TAB GRAFICOS -->
  <div id="tab-graficos" class="panel">
    ${stats.charts.map((chart, i) => `
      <div class="chart-container">
        <h3>${chart.title}</h3>
        <div class="chart-wrapper"><canvas id="chart-${i}"></canvas></div>
      </div>
    `).join('')}
  </div>

  <!-- TAB DATOS -->
  <div id="tab-datos" class="panel">
    <div class="table-container">
      <h3>Datos Detallados (${Math.min(datos.length, 200)} de ${datos.length})</h3>
      <div style="overflow-x: auto;">
        <table>
          <thead><tr>${tipoConfig.columnas.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>
            ${datos.slice(0, 200).map(row => `<tr>${tipoConfig.columnas.map(c => {
              let val = row[c.key]
              if (val === null || val === undefined) val = ''
              if (typeof val === 'boolean') val = val ? 'Si' : 'No'
              if (typeof val === 'object') val = JSON.stringify(val)
              val = String(val)
              if (val.length > 80) val = val.substring(0, 80) + '...'
              return `<td title="${val.replace(/"/g, '&quot;')}">${val}</td>`
            }).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  Generado por CreceTec Admin Panel | ${fecha}
</div>

<script>
function showTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}

const COLORS = {
  primary: 'hsl(222, 35%, 28%)',
  accent: 'hsl(4, 65%, 48%)',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#8b5cf6',
  orange: '#f97316',
  pink: '#ec4899',
  palette: ['hsl(222,35%,28%)', 'hsl(4,65%,48%)', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#f97316', '#ec4899']
};

${stats.charts.map((chart, i) => `
(function() {
  const ctx = document.getElementById('chart-${i}');
  if (!ctx) return;
  new Chart(ctx, {
    type: '${chart.type}',
    data: ${JSON.stringify(chart.data)},
    options: ${JSON.stringify(chart.options || { responsive: true, maintainAspectRatio: false })}
  });
})();
`).join('\n')}
</script>
</body>
</html>`
}

// ============================================
// CALCULAR ESTADISTICAS POR TIPO
// ============================================

function calcularEstadisticas(tipo, datos) {
  const result = { cards: [], charts: [], resumenHTML: '' }

  if (!datos || datos.length === 0) {
    result.cards = [{ label: 'Total Registros', value: '0' }]
    return result
  }

  switch (tipo) {
    case 'comentarios':
      return statsComentarios(datos)
    case 'tareas':
      return statsTareas(datos)
    case 'usuarios':
      return statsUsuarios(datos)
    case 'base_datos':
      return statsBaseDatos(datos)
    case 'mensajes_chat':
      return statsMensajesChat(datos)
    case 'flujos':
      return statsFlujos(datos)
    case 'conversaciones_transferidas':
      return statsConversaciones(datos)
    case 'conocimiento':
      return statsConocimiento(datos)
    default:
      result.cards = [{ label: 'Total Registros', value: String(datos.length) }]
      return result
  }
}

function statsComentarios(datos) {
  const total = datos.length
  const inapropiados = datos.filter(d => d.es_inapropiado).length
  const clasificaciones = contarCampo(datos, 'clasificacion')
  const porDia = agruparPorDia(datos, 'creado_en')

  return {
    cards: [
      { label: 'Total Comentarios', value: formatNum(total) },
      { label: 'Inapropiados', value: formatNum(inapropiados) },
      { label: 'Apropiados', value: formatNum(total - inapropiados) },
      { label: '% Inapropiados', value: total > 0 ? ((inapropiados / total) * 100).toFixed(1) + '%' : '0%' }
    ],
    charts: [
      {
        title: 'Clasificacion de Comentarios',
        type: 'doughnut',
        data: {
          labels: Object.keys(clasificaciones),
          datasets: [{ data: Object.values(clasificaciones), backgroundColor: ['hsl(222,35%,28%)', 'hsl(4,65%,48%)', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Comentarios por Dia',
        type: 'line',
        data: {
          labels: Object.keys(porDia),
          datasets: [{ label: 'Comentarios', data: Object.values(porDia), borderColor: 'hsl(222,35%,28%)', backgroundColor: 'hsla(222,35%,28%,0.1)', fill: true, tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

function statsTareas(datos) {
  const total = datos.length
  const estados = contarCampo(datos, 'estado')
  const prioridades = contarCampo(datos, 'prioridad')
  const completadas = datos.filter(d => d.estado === 'completada').length
  const porDia = agruparPorDia(datos, 'fecha_creacion')

  return {
    cards: [
      { label: 'Total Tareas', value: formatNum(total) },
      { label: 'Completadas', value: formatNum(completadas) },
      { label: 'Pendientes', value: formatNum(estados['pendiente'] || 0) },
      { label: '% Completado', value: total > 0 ? ((completadas / total) * 100).toFixed(1) + '%' : '0%' }
    ],
    charts: [
      {
        title: 'Tareas por Estado',
        type: 'doughnut',
        data: {
          labels: Object.keys(estados),
          datasets: [{ data: Object.values(estados), backgroundColor: ['#eab308', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Tareas por Prioridad',
        type: 'bar',
        data: {
          labels: Object.keys(prioridades),
          datasets: [{ label: 'Cantidad', data: Object.values(prioridades), backgroundColor: ['#22c55e', '#eab308', '#f97316', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      },
      {
        title: 'Tareas Creadas por Dia',
        type: 'line',
        data: {
          labels: Object.keys(porDia),
          datasets: [{ label: 'Tareas', data: Object.values(porDia), borderColor: 'hsl(4,65%,48%)', backgroundColor: 'hsla(4,65%,48%,0.1)', fill: true, tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

function statsUsuarios(datos) {
  const total = datos.length
  const tipos = contarCampo(datos, 'tipo_usuario')
  const activos = datos.filter(d => d.activo).length
  const planes = contarCampo(datos, 'plan')

  return {
    cards: [
      { label: 'Total Usuarios', value: formatNum(total) },
      { label: 'Activos', value: formatNum(activos) },
      { label: 'Administradores', value: formatNum(tipos['adm'] || 0) },
      { label: 'Colaboradores', value: formatNum(tipos['colaborador'] || 0) }
    ],
    charts: [
      {
        title: 'Usuarios por Tipo',
        type: 'doughnut',
        data: {
          labels: Object.keys(tipos),
          datasets: [{ data: Object.values(tipos), backgroundColor: ['hsl(222,35%,28%)', 'hsl(4,65%,48%)'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      }
    ]
  }
}

function statsBaseDatos(datos) {
  const total = datos.length
  const categorias = contarCampo(datos, 'categoria')
  const activos = datos.filter(d => d.Estado === true).length
  const prioridades = contarCampo(datos, 'prioridad')

  return {
    cards: [
      { label: 'Total Reglas', value: formatNum(total) },
      { label: 'Activas', value: formatNum(activos) },
      { label: 'Inactivas', value: formatNum(total - activos) },
      { label: 'Categorias', value: formatNum(Object.keys(categorias).length) }
    ],
    charts: [
      {
        title: 'Reglas por Categoria',
        type: 'bar',
        data: {
          labels: Object.keys(categorias).slice(0, 10),
          datasets: [{ label: 'Reglas', data: Object.values(categorias).slice(0, 10), backgroundColor: 'hsl(222,35%,28%)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

function statsMensajesChat(datos) {
  const total = datos.length
  const roles = contarCampo(datos, 'role')
  const plataformas = contarCampo(datos, 'platform')
  const porDia = agruparPorDia(datos, 'created_at')
  const remitentes = new Set(datos.map(d => d.sender_id)).size

  return {
    cards: [
      { label: 'Total Mensajes', value: formatNum(total) },
      { label: 'Remitentes Unicos', value: formatNum(remitentes) },
      { label: 'Del Bot/Sistema', value: formatNum(roles['assistant'] || roles['bot'] || 0) },
      { label: 'Dias Activos', value: formatNum(Object.keys(porDia).length) }
    ],
    charts: [
      {
        title: 'Mensajes por Rol',
        type: 'doughnut',
        data: {
          labels: Object.keys(roles),
          datasets: [{ data: Object.values(roles), backgroundColor: ['hsl(222,35%,28%)', 'hsl(4,65%,48%)', '#3b82f6', '#22c55e'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Mensajes por Plataforma',
        type: 'doughnut',
        data: {
          labels: Object.keys(plataformas),
          datasets: [{ data: Object.values(plataformas), backgroundColor: ['#8b5cf6', '#f97316', '#22c55e', '#3b82f6'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Actividad de DM por Dia',
        type: 'bar',
        data: {
          labels: Object.keys(porDia),
          datasets: [{ label: 'Mensajes', data: Object.values(porDia), backgroundColor: 'hsl(222,35%,28%)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

function statsFlujos(datos) {
  const total = datos.length
  const estados = contarCampo(datos, 'estado')
  const totalConv = datos.reduce((sum, d) => sum + (d.total_conversaciones || 0), 0)

  return {
    cards: [
      { label: 'Total Flujos', value: formatNum(total) },
      { label: 'Activos', value: formatNum(estados['activo'] || 0) },
      { label: 'Inactivos', value: formatNum(estados['inactivo'] || 0) },
      { label: 'Total Conversaciones', value: formatNum(totalConv) }
    ],
    charts: [
      {
        title: 'Flujos por Estado',
        type: 'doughnut',
        data: {
          labels: Object.keys(estados),
          datasets: [{ data: Object.values(estados), backgroundColor: ['#22c55e', '#94a3b8'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Conversaciones por Flujo',
        type: 'bar',
        data: {
          labels: datos.map(d => d.nombre || `Flujo #${d.id}`).slice(0, 10),
          datasets: [{ label: 'Conversaciones', data: datos.map(d => d.total_conversaciones || 0).slice(0, 10), backgroundColor: 'hsl(222,35%,28%)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

function statsConversaciones(datos) {
  const total = datos.length
  const estados = contarCampo(datos, 'estado')
  const canales = contarCampo(datos, 'canal')
  const porDia = agruparPorDia(datos, 'creado_en')

  return {
    cards: [
      { label: 'Total Conversaciones', value: formatNum(total) },
      { label: 'Transferidas', value: formatNum(estados['transferida'] || 0) },
      { label: 'Cerradas', value: formatNum((estados['cerrada_agente'] || 0) + (estados['cerrada'] || 0)) },
      { label: 'Canales Activos', value: formatNum(Object.keys(canales).length) }
    ],
    charts: [
      {
        title: 'Conversaciones por Estado',
        type: 'doughnut',
        data: {
          labels: Object.keys(estados),
          datasets: [{ data: Object.values(estados), backgroundColor: ['#eab308', '#22c55e', '#3b82f6', '#8b5cf6'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Conversaciones por Dia',
        type: 'line',
        data: {
          labels: Object.keys(porDia),
          datasets: [{ label: 'Conversaciones', data: Object.values(porDia), borderColor: 'hsl(4,65%,48%)', fill: true, backgroundColor: 'hsla(4,65%,48%,0.1)', tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

function statsConocimiento(datos) {
  const total = datos.length
  const estados = contarCampo(datos, 'estado')
  const categorias = contarCampo(datos, 'categoria')

  return {
    cards: [
      { label: 'Total Entradas', value: formatNum(total) },
      { label: 'Aprobado', value: formatNum((estados['aprobado'] || 0) + (estados['editado'] || 0)) },
      { label: 'Pendiente', value: formatNum(estados['pendiente'] || 0) },
      { label: 'Categorias', value: formatNum(Object.keys(categorias).length) }
    ],
    charts: [
      {
        title: 'Conocimiento por Estado',
        type: 'doughnut',
        data: {
          labels: Object.keys(estados),
          datasets: [{ data: Object.values(estados), backgroundColor: ['#22c55e', '#eab308', '#3b82f6', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      },
      {
        title: 'Conocimiento por Categoria',
        type: 'bar',
        data: {
          labels: Object.keys(categorias).slice(0, 10),
          datasets: [{ label: 'Entradas', data: Object.values(categorias).slice(0, 10), backgroundColor: 'hsl(222,35%,28%)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }
    ]
  }
}

// ============================================
// HELPERS
// ============================================

function contarCampo(datos, campo) {
  const conteo = {}
  datos.forEach(d => {
    const val = d[campo] ?? 'Sin dato'
    const key = typeof val === 'boolean' ? (val ? 'Si' : 'No') : String(val)
    conteo[key] = (conteo[key] || 0) + 1
  })
  return conteo
}

function agruparPorDia(datos, campFecha) {
  const grupos = {}
  datos.forEach(d => {
    const fecha = d[campFecha]
    if (!fecha) return
    const dia = new Date(fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
    grupos[dia] = (grupos[dia] || 0) + 1
  })
  return grupos
}

function formatNum(n) {
  if (n === null || n === undefined) return '0'
  return Number(n).toLocaleString('es-CL')
}
