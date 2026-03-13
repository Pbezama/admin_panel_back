/**
 * API: /api/google/sheets/escribir
 * POST - Escribir filas al final de una pestana
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, escribirFilasSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, filas } = await request.json()

    if (!pestana_id || !filas || !Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'pestana_id y filas (array de arrays) son requeridos' }, { status: 400 })
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
    const rango = pestana.nombre_pestana
    const inicio = Date.now()

    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const resultado = await escribirFilasSheet(access_token, archivo.google_file_id, rango, filas)

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'escribir', origen: 'manual',
      datosRequest: { pestana_id, num_filas: filas.length },
      datosResponse: { updatedRange: resultado.updates?.updatedRange },
      filasAfectadas: filas.length, exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      filas_escritas: filas.length,
      rango_actualizado: resultado.updates?.updatedRange
    })
  } catch (error) {
    console.error('Error POST /api/google/sheets/escribir:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
