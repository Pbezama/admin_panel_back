/**
 * API: /api/google/sheets/eliminar
 * POST - Eliminar filas de una pestana por indice
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, eliminarFilasSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, fila_inicio, fila_fin } = await request.json()

    if (!pestana_id || fila_inicio === undefined || fila_fin === undefined) {
      return NextResponse.json({ error: 'pestana_id, fila_inicio y fila_fin son requeridos (indices 0-based)' }, { status: 400 })
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
    await eliminarFilasSheet(access_token, archivo.google_file_id, pestana.sheet_id, fila_inicio, fila_fin)

    const filasEliminadas = fila_fin - fila_inicio

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'eliminar_filas', origen: 'manual',
      datosRequest: { pestana_id, fila_inicio, fila_fin },
      filasAfectadas: filasEliminadas, exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({ success: true, filas_eliminadas: filasEliminadas })
  } catch (error) {
    console.error('Error POST /api/google/sheets/eliminar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
