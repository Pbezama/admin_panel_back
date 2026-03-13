/**
 * API: /api/google/archivos/[id]/pestanas
 * GET  - Listar pestanas disponibles en el Sheet (desde Google API)
 * POST - Seleccionar pestanas para vincular
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, obtenerInfoSheet, leerDatosSheet } from '@/lib/google'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    // Obtener archivo
    const { data: archivo, error: archError } = await supabase
      .from('google_archivos')
      .select('id, id_conexion, google_file_id, tipo_archivo')
      .eq('id', id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (archError || !archivo) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    if (archivo.tipo_archivo !== 'sheet') {
      return NextResponse.json({ error: 'Este archivo no es un Google Sheet' }, { status: 400 })
    }

    // Obtener pestanas desde Google
    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const sheetInfo = await obtenerInfoSheet(access_token, archivo.google_file_id)

    // Obtener pestanas ya seleccionadas en BD
    const { data: seleccionadas } = await supabase
      .from('google_pestanas')
      .select('sheet_id')
      .eq('id_archivo', id)

    const seleccionadasIds = new Set((seleccionadas || []).map(p => p.sheet_id))

    const pestanas = (sheetInfo.sheets || []).map(s => ({
      sheet_id: s.properties.sheetId,
      nombre: s.properties.title,
      index: s.properties.index,
      filas: s.properties.gridProperties?.rowCount || 0,
      columnas: s.properties.gridProperties?.columnCount || 0,
      seleccionada: seleccionadasIds.has(s.properties.sheetId)
    }))

    return NextResponse.json({ success: true, pestanas })
  } catch (error) {
    console.error('Error GET /api/google/archivos/[id]/pestanas:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestanas } = await request.json()

    if (!pestanas || !Array.isArray(pestanas) || pestanas.length === 0) {
      return NextResponse.json({ error: 'pestanas (array) es requerido' }, { status: 400 })
    }

    // Verificar archivo
    const { data: archivo } = await supabase
      .from('google_archivos')
      .select('id, id_conexion, google_file_id')
      .eq('id', id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (!archivo) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    // Obtener headers de cada pestana
    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const registros = []

    for (const p of pestanas) {
      let headers = []
      let totalFilas = 0
      try {
        const data = await leerDatosSheet(access_token, archivo.google_file_id, `${p.nombre}!1:1`)
        headers = data.values?.[0] || []
        // Leer conteo aproximado
        const allData = await leerDatosSheet(access_token, archivo.google_file_id, p.nombre)
        totalFilas = Math.max(0, (allData.values?.length || 0) - 1)
      } catch (e) {
        console.warn(`No se pudieron leer headers de ${p.nombre}:`, e.message)
      }

      registros.push({
        id_archivo: parseInt(id),
        id_marca: idMarca,
        sheet_id: p.sheet_id,
        nombre_pestana: p.nombre,
        alias: p.alias || p.nombre,
        descripcion: p.descripcion || '',
        headers: JSON.stringify(headers),
        total_filas: totalFilas
      })
    }

    // Insertar (ignorar duplicados)
    const { data: creadas, error } = await supabase
      .from('google_pestanas')
      .upsert(registros, { onConflict: 'id_archivo,sheet_id' })
      .select()

    if (error) throw error

    return NextResponse.json({ success: true, pestanas: creadas }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/archivos/[id]/pestanas:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
