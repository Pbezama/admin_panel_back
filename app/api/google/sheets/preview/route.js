/**
 * API: /api/google/sheets/preview
 * POST - Preview de primeras filas de una pestana
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, leerDatosSheet } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, max_filas } = await request.json()

    if (!pestana_id) {
      return NextResponse.json({ error: 'pestana_id es requerido' }, { status: 400 })
    }

    const limit = Math.min(max_filas || 10, 50) // Maximo 50 filas en preview

    const { data: pestana } = await supabase
      .from('google_pestanas')
      .select('*, google_archivos(id, google_file_id, id_conexion)')
      .eq('id', pestana_id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (!pestana) {
      return NextResponse.json({ error: 'Pestana no encontrada' }, { status: 404 })
    }

    const archivo = pestana.google_archivos
    const rango = `${pestana.nombre_pestana}!1:${limit + 1}`

    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const data = await leerDatosSheet(access_token, archivo.google_file_id, rango)

    const rows = data.values || []
    const headers = rows[0] || []
    const filas = rows.slice(1)

    return NextResponse.json({
      success: true,
      nombre_pestana: pestana.nombre_pestana,
      alias: pestana.alias,
      headers,
      filas,
      total_preview: filas.length
    })
  } catch (error) {
    console.error('Error POST /api/google/sheets/preview:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
