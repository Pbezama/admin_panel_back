/**
 * API: /api/google/sheets/duplicar-pestana
 * POST - Duplicar una pestana existente como plantilla
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, duplicarPestanaSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, nuevo_titulo, auto_vincular } = await request.json()

    if (!pestana_id || !nuevo_titulo) {
      return NextResponse.json({ error: 'pestana_id y nuevo_titulo son requeridos' }, { status: 400 })
    }

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
    const inicio = Date.now()

    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const resultado = await duplicarPestanaSheet(access_token, archivo.google_file_id, pestana.sheet_id, nuevo_titulo)

    const newSheet = resultado.replies?.[0]?.duplicateSheet?.properties

    let pestanaDb = null
    if (auto_vincular !== false && newSheet) {
      const { data } = await supabase
        .from('google_pestanas')
        .insert({
          id_archivo: archivo.id,
          id_marca: idMarca,
          sheet_id: newSheet.sheetId,
          nombre_pestana: newSheet.title,
          alias: newSheet.title,
          descripcion: `Copia de ${pestana.nombre_pestana}`,
          headers: pestana.headers,
          total_filas: pestana.total_filas
        })
        .select()
        .single()
      pestanaDb = data
    }

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'duplicar_pestana', origen: 'manual',
      datosRequest: { pestana_origen: pestana.nombre_pestana, nuevo_titulo },
      exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      pestana_google: newSheet ? { sheet_id: newSheet.sheetId, titulo: newSheet.title } : null,
      pestana_db: pestanaDb
    }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/sheets/duplicar-pestana:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
