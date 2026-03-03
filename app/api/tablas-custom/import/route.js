/**
 * API: /api/tablas-custom/import
 * POST FormData: archivo (CSV o Excel) + tabla_id? (opcional)
 *
 * Sin tabla_id → detecta columnas y tipos, devuelve preview
 * Con tabla_id → inserta todos los registros en la tabla existente
 */
import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTablaCustom, insertarRegistrosBulk } from '@/lib/tablasCustom'

// Tipos inferidos desde valores
function inferirTipo(valor) {
  if (valor === null || valor === undefined || valor === '') return 'texto'
  const str = String(valor).trim()
  if (/^-?\d+(\.\d+)?$/.test(str)) return 'numero'
  if (/^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(str)) return 'fecha'
  if (/^(true|false|si|no|sí|yes)$/i.test(str)) return 'booleano'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return 'email'
  return 'texto'
}

// Normalizar nombre de columna (snake_case, sin espacios)
function normalizarNombre(nombre) {
  return String(nombre)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'columna'
}

async function parsearArchivo(buffer, nombre) {
  const ext = nombre.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    // Parsear CSV simple
    const texto = Buffer.from(buffer).toString('utf-8')
    const lineas = texto.split(/\r?\n/).filter(l => l.trim())
    if (lineas.length === 0) return { headers: [], filas: [] }

    const sep = lineas[0].includes(';') ? ';' : ','
    const headers = lineas[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))
    const filas = lineas.slice(1).map(l => {
      const cols = l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
      const obj = {}
      headers.forEach((h, i) => { obj[h] = cols[i] ?? '' })
      return obj
    })
    return { headers, filas }
  }

  // Excel (xls, xlsx, ods)
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (jsonData.length === 0) return { headers: [], filas: [] }

  const headers = jsonData[0].map(h => String(h).trim())
  const filas = jsonData.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
  return { headers, filas }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await request.formData()
    const archivo = formData.get('archivo')
    const tablaId = formData.get('tabla_id') ? Number(formData.get('tabla_id')) : null

    if (!archivo || typeof archivo === 'string') {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    const buffer = await archivo.arrayBuffer()
    const { headers, filas } = await parsearArchivo(buffer, archivo.name)

    if (headers.length === 0) {
      return NextResponse.json({ error: 'El archivo está vacío o no tiene encabezados' }, { status: 400 })
    }

    // Detectar tipos analizando primeras 10 filas
    const muestraFilas = filas.slice(0, 10)
    const columnasDetectadas = headers.map(h => {
      const nombreNorm = normalizarNombre(h)
      const tiposFila = muestraFilas
        .map(f => inferirTipo(f[h]))
        .filter(t => t !== 'texto')
      // Tipo mayoritario (o texto por defecto)
      const conteo = {}
      tiposFila.forEach(t => { conteo[t] = (conteo[t] || 0) + 1 })
      const tipoMayoritario = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || 'texto'
      return {
        nombre: nombreNorm,
        nombre_original: h,
        tipo: tipoMayoritario,
        requerido: false
      }
    })

    // Si no hay tabla_id → solo devolver preview
    if (!tablaId) {
      return NextResponse.json({
        success: true,
        columnas_detectadas: columnasDetectadas,
        preview_filas: filas.slice(0, 5),
        total_filas: filas.length
      })
    }

    // Verificar que la tabla existe y pertenece a la marca
    const tablaRes = await obtenerTablaCustom(tablaId, auth.idMarca)
    if (!tablaRes.success) return NextResponse.json({ error: 'Tabla no encontrada' }, { status: 404 })

    // Normalizar filas: renombrar claves al nombre normalizado
    const filasNorm = filas.map(f => {
      const obj = {}
      columnasDetectadas.forEach(col => {
        const val = f[col.nombre_original]
        obj[col.nombre] = (val !== undefined && val !== '') ? val : null
      })
      return obj
    })

    const resultado = await insertarRegistrosBulk(
      tablaId,
      tablaRes.data.nombre,
      auth.idMarca,
      filasNorm
    )
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({
      success: true,
      insertados: resultado.insertados,
      total_filas: filas.length
    })
  } catch (error) {
    console.error('Error POST /api/tablas-custom/import:', error)
    return NextResponse.json({ error: 'Error interno: ' + error.message }, { status: 500 })
  }
}
