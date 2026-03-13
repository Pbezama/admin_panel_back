/**
 * API: /api/google/sheets/crear-pestana
 * POST - Crear nueva pestana en un Google Sheet
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, crearPestanaSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { archivo_id, titulo, alias, descripcion, auto_vincular } = await request.json()

    if (!archivo_id || !titulo) {
      return NextResponse.json({ error: 'archivo_id y titulo son requeridos' }, { status: 400 })
    }

    const { data: archivo } = await supabase
      .from('google_archivos')
      .select('id, google_file_id, id_conexion')
      .eq('id', archivo_id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (!archivo) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    const inicio = Date.now()
    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const resultado = await crearPestanaSheet(access_token, archivo.google_file_id, titulo)

    const newSheet = resultado.replies?.[0]?.addSheet?.properties
    if (!newSheet) {
      return NextResponse.json({ error: 'No se pudo crear la pestana' }, { status: 500 })
    }

    // Auto-vincular si se pide
    let pestanaDb = null
    if (auto_vincular !== false) {
      const { data } = await supabase
        .from('google_pestanas')
        .insert({
          id_archivo: archivo.id,
          id_marca: idMarca,
          sheet_id: newSheet.sheetId,
          nombre_pestana: newSheet.title,
          alias: alias || newSheet.title,
          descripcion: descripcion || '',
          headers: '[]',
          total_filas: 0
        })
        .select()
        .single()
      pestanaDb = data
    }

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'crear_pestana', origen: 'manual',
      datosRequest: { titulo },
      datosResponse: { sheet_id: newSheet.sheetId },
      exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      pestana_google: { sheet_id: newSheet.sheetId, titulo: newSheet.title },
      pestana_db: pestanaDb
    }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/sheets/crear-pestana:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
