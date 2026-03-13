/**
 * API: /api/google/archivos
 * GET  - Listar archivos seleccionados de la marca
 * POST - Agregar un archivo de Drive a la seleccion
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, obtenerArchivoDrive, obtenerInfoSheet } from '@/lib/google'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const tipoFiltro = request.nextUrl.searchParams.get('tipo') // sheet, doc, pdf

    let query = supabase
      .from('google_archivos')
      .select(`
        id, id_conexion, google_file_id, nombre_archivo, alias, descripcion,
        tipo_archivo, url_archivo, estado, ultimo_acceso, creado_en,
        google_conexiones(nombre_cuenta, email_google, estado)
      `)
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (tipoFiltro) query = query.eq('tipo_archivo', tipoFiltro)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, archivos: data })
  } catch (error) {
    console.error('Error GET /api/google/archivos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { conexion_id, google_file_id, alias, descripcion } = await request.json()

    if (!conexion_id || !google_file_id) {
      return NextResponse.json({ error: 'conexion_id y google_file_id son requeridos' }, { status: 400 })
    }

    // Obtener metadata del archivo desde Google
    const { access_token } = await obtenerTokenValido(conexion_id)
    const fileMeta = await obtenerArchivoDrive(access_token, google_file_id)

    const tipo = fileMeta.mimeType === 'application/vnd.google-apps.spreadsheet' ? 'sheet'
      : fileMeta.mimeType === 'application/vnd.google-apps.document' ? 'doc'
      : fileMeta.mimeType === 'application/pdf' ? 'pdf'
      : 'otro'

    // Guardar en BD
    const { data: archivo, error } = await supabase
      .from('google_archivos')
      .insert({
        id_conexion: conexion_id,
        id_marca: idMarca,
        google_file_id,
        nombre_archivo: fileMeta.name,
        alias: alias || fileMeta.name,
        descripcion: descripcion || '',
        tipo_archivo: tipo,
        mime_type: fileMeta.mimeType,
        url_archivo: fileMeta.webViewLink
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Este archivo ya esta vinculado a esta conexion' }, { status: 409 })
      }
      throw error
    }

    // Si es Sheet, auto-detectar pestanas
    let pestanas = []
    if (tipo === 'sheet') {
      try {
        const sheetInfo = await obtenerInfoSheet(access_token, google_file_id)
        pestanas = (sheetInfo.sheets || []).map(s => ({
          sheet_id: s.properties.sheetId,
          nombre: s.properties.title,
          filas: s.properties.gridProperties?.rowCount || 0,
          columnas: s.properties.gridProperties?.columnCount || 0
        }))
      } catch (e) {
        console.warn('No se pudieron detectar pestanas:', e.message)
      }
    }

    return NextResponse.json({
      success: true,
      archivo,
      pestanas_disponibles: pestanas
    }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/archivos:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
