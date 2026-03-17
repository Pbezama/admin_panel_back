/**
 * Google Sheets - PreUCV
 * Replica EXACTA de la logica Python de BOT_PRUEBAS.py
 * Usa service account para acceder a las hojas de matriculas y datos clientes.
 *
 * Env vars requeridas:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - JSON completo del service account (contactarmastarde-fa26c41a0a86.json)
 *
 * Si no se configura, las herramientas retornan un mensaje indicando que no hay credenciales.
 */

import { google } from 'googleapis'

// IDs de los spreadsheets (mismos que en Python)
const SPREADSHEET_MATRICULAS = '1bAQG1qQoP9JIRoTN2H9B3hHNzsBdpcUqLPuSzgYwOnY'
const SPREADSHEET_DATOS_CLIENTES = '1-eHZTmqj--2OsUpDBtaNDEDbNfG8uyqI0dXEWCSJSDQ'

/**
 * Crea cliente autenticado de Google Sheets con service account
 */
function getAuthClient() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) {
    return null
  }

  try {
    const credentials = JSON.parse(saJson)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    })
    return auth
  } catch (e) {
    console.error('[Sheets-PreUCV] Error parseando credenciales:', e.message)
    return null
  }
}

/**
 * Extrae solo digitos de un string
 */
function soloDigitos(str) {
  return (str || '').replace(/\D/g, '')
}

/**
 * Compara telefonos por los ultimos 8 digitos (de derecha a izquierda)
 */
function telefonosCoinciden(tel1, tel2) {
  const d1 = soloDigitos(tel1)
  const d2 = soloDigitos(tel2)
  if (d1.length < 8 || d2.length < 8) return false
  return d1.slice(-8) === d2.slice(-8)
}

/**
 * Normaliza RUT/documento: quita puntos, guiones, espacios y pasa a minusculas
 */
function normalizarRut(rut) {
  return (rut || '').replace(/[\.\-\s]/g, '').toLowerCase().trim()
}

/**
 * Lee una hoja completa y retorna array de objetos {columna: valor}
 */
async function getSheetData(sheets, spreadsheetId, sheetName, range = 'A:AS') {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${range}`
    })
    const values = result.data.values || []
    if (values.length < 2) return []

    const headers = values[0]
    return values.slice(1).map(row => {
      const obj = {}
      headers.forEach((col, i) => {
        obj[col] = row[i] || ''
      })
      return obj
    })
  } catch (e) {
    console.error(`[Sheets-PreUCV] Error leyendo ${sheetName}:`, e.message)
    return []
  }
}

/**
 * obtenerAgenteCuentaDesdeSheets(telefono)
 * Replica exacta de Python: busca en 'Datos Clientes' por celular alumno o apoderado
 */
async function obtenerAgenteCuentaDesdeSheets(sheets, telefono) {
  const rows = await getSheetData(sheets, SPREADSHEET_DATOS_CLIENTES, 'Datos Clientes', 'A:BR')
  if (rows.length === 0) return 'No se encontraron datos en la hoja.'

  const filtradas = rows.filter(row =>
    telefonosCoinciden(row['CELULAR ALU'], telefono) || telefonosCoinciden(row['CELULAR APO'], telefono)
  )

  if (filtradas.length === 0) return ''

  const descriptions = filtradas.map(row => {
    let header
    const matchAlu = telefonosCoinciden(row['CELULAR ALU'], telefono)
    const matchApo = telefonosCoinciden(row['CELULAR APO'], telefono)
    if (matchAlu && matchApo) {
      header = 'Informacion del Alumno y Apoderado'
    } else if (matchAlu) {
      header = 'Informacion del Alumno'
    } else if (matchApo) {
      header = 'Informacion del Apoderado'
    } else {
      header = 'Informacion Desconocida'
    }

    return `${header}:\n  - CONTRATO: ${row['CONTRATO'] || ''}  - ESTADO CONTRATO: ${row['ESTADO CONTRATO'] || ''}  - AGENTE: ${row['AGENTE'] || ''}`
  })

  return descriptions.join('\n\n').trim()
}

/**
 * obtenerDatosAlumnoDesdeSheets(telefono)
 * Replica exacta de Python: busca en MATRICULAS por celular alumno o apoderado
 */
export async function obtenerDatosAlumnoDesdeSheets(telefono) {
  const auth = getAuthClient()
  if (!auth) return '[SIN CREDENCIALES] No se configuró GOOGLE_SERVICE_ACCOUNT_JSON'

  const sheets = google.sheets({ version: 'v4', auth })

  // Leer ambas hojas (igual que Python)
  const [matriculasAyer, matriculas] = await Promise.all([
    getSheetData(sheets, SPREADSHEET_MATRICULAS, 'MATRICULAS MENSUALES HASTA AYER'),
    getSheetData(sheets, SPREADSHEET_MATRICULAS, 'MATRICULAS')
  ])

  const allRows = [...matriculasAyer, ...matriculas]

  // Filtrar por celular alumno o apoderado (ultimos 8 digitos)
  const filtradas = allRows.filter(row =>
    telefonosCoinciden(row['alumno.celular'], telefono) || telefonosCoinciden(row['apoderado.celular'], telefono)
  )

  // Eliminar duplicados (por todas las columnas, como Python drop_duplicates)
  const seen = new Set()
  const unique = filtradas.filter(row => {
    const key = JSON.stringify(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (unique.length === 0) return ''

  // Construir string legible (replica exacta del formato Python)
  const descriptions = []
  for (const row of unique) {
    const matchAlumno = telefonosCoinciden(row['alumno.celular'], telefono)
    const matchApoderado = telefonosCoinciden(row['apoderado.celular'], telefono)
    let header
    if (matchAlumno && matchApoderado) {
      header = 'Informacion del Alumno y Apoderado'
    } else if (matchAlumno) {
      header = 'Informacion del Alumno'
    } else if (matchApoderado) {
      header = 'Informacion del Apoderado'
    } else {
      header = 'Informacion Desconocida'
    }

    // Obtener datos del agente (misma sub-llamada que Python)
    const datosAgente = await obtenerAgenteCuentaDesdeSheets(sheets, telefono)

    descriptions.push(
      `${header}:\n` +
      `  - OC: ${row['oc'] || ''}\n` +
      `  - Estado del Contrato: ${row['estado_contrato'] || ''}\n` +
      `  - Estado de Emision: ${row['estado_emision'] || ''}\n` +
      `  - Estado de Firma del Apoderado: ${row['estado_firma_apo'] || ''}\n` +
      `  - Subtipo: ${row['subtipo'] || ''}\n` +
      `  - Sede de Venta: ${row['sede'] || ''}\n` +
      `  - Cursos: ${row['cursos'] || ''}\n` +
      `  - Total Servicio: ${row['totalServicio'] || ''}\n` +
      `  - Alumno: ${row['alumno.nombre'] || ''} ${row['alumno.apellidom'] || ''}\n` +
      `  - Apoderado: ${row['apoderado.nombre'] || ''} ${row['apoderado.apellidop'] || ''}\n` +
      `  - Celular del Alumno: ${row['alumno.celular'] || ''}\n` +
      `  - Celular del Apoderado: ${row['apoderado.celular'] || ''}\n` +
      `  - Rut Alumno: ${row['alumno.rut'] || ''}\n` +
      `  - Rut Apoderado: ${row['apoderado.rut'] || ''}\n` +
      `  - Vendedor: ${row['vendedor'] || ''}\n` +
      `  - Fecha del Contrato: ${row['fecha_contrato'] || ''}\n` +
      `  - Saldo Moroso: ${row['pagares.total_ing_moroso'] || ''}\n` +
      `  - ${datosAgente}\n` +
      `----------------------------------------`
    )
  }

  return descriptions.join('\n')
}

/**
 * obtenerDatosAlumnoPorRutDesdeSheets(rut)
 * Replica exacta de Python: busca en MATRICULAS por RUT alumno o apoderado
 */
export async function obtenerDatosAlumnoPorRutDesdeSheets(rut) {
  const auth = getAuthClient()
  if (!auth) return '[SIN CREDENCIALES] No se configuró GOOGLE_SERVICE_ACCOUNT_JSON'

  const sheets = google.sheets({ version: 'v4', auth })

  const [matriculasAyer, matriculas] = await Promise.all([
    getSheetData(sheets, SPREADSHEET_MATRICULAS, 'MATRICULAS MENSUALES HASTA AYER'),
    getSheetData(sheets, SPREADSHEET_MATRICULAS, 'MATRICULAS')
  ])

  const allRows = [...matriculasAyer, ...matriculas]

  const rutNorm = normalizarRut(rut)

  const filtradas = allRows.filter(row =>
    normalizarRut(row['alumno.rut']) === rutNorm || normalizarRut(row['apoderado.rut']) === rutNorm
  )

  const seen = new Set()
  const unique = filtradas.filter(row => {
    const key = JSON.stringify(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (unique.length === 0) return ''

  const descriptions = unique.map(row => {
    const matchAlumnoRut = normalizarRut(row['alumno.rut']) === rutNorm
    const matchApoderadoRut = normalizarRut(row['apoderado.rut']) === rutNorm
    let header
    if (matchAlumnoRut && matchApoderadoRut) {
      header = 'Informacion del Alumno y Apoderado'
    } else if (matchAlumnoRut) {
      header = 'Informacion del Alumno'
    } else if (matchApoderadoRut) {
      header = 'Informacion del Apoderado'
    } else {
      header = 'Informacion Desconocida'
    }

    return (
      `${header}:\n` +
      `  - OC: ${row['oc'] || ''}\n` +
      `  - Estado del Contrato: ${row['estado_contrato'] || ''}\n` +
      `  - Estado de Emision: ${row['estado_emision'] || ''}\n` +
      `  - Estado de Firma del Apoderado: ${row['estado_firma_apo'] || ''}\n` +
      `  - Subtipo: ${row['subtipo'] || ''}\n` +
      `  - Sede de Venta: ${row['sede'] || ''}\n` +
      `  - Cursos: ${row['cursos'] || ''}\n` +
      `  - Total Servicio: ${row['totalServicio'] || ''}\n` +
      `  - Alumno: ${row['alumno.nombre'] || ''} ${row['alumno.apellidom'] || ''}\n` +
      `  - Apoderado: ${row['apoderado.nombre'] || ''} ${row['apoderado.apellidop'] || ''}\n` +
      `  - Celular del Alumno: ${row['alumno.celular'] || ''}\n` +
      `  - Celular del Apoderado: ${row['apoderado.celular'] || ''}\n` +
      `  - Rut Alumno: ${row['alumno.rut'] || ''}\n` +
      `  - Rut Apoderado: ${row['apoderado.rut'] || ''}\n` +
      `  - Vendedor: ${row['vendedor'] || ''}\n` +
      `  - Fecha del Contrato: ${row['fecha_contrato'] || ''}\n` +
      `  - Saldo Moroso: ${row['pagares.total_ing_moroso'] || ''}\n` +
      `----------------------------------------`
    )
  })

  return descriptions.join('\n')
}
