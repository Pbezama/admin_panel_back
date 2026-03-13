/**
 * API: /api/google/sheets/buscar
 * POST - Buscar filas por criterio en una pestana
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, buscarFilasSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, columna, valor } = await request.json()

    if (!pestana_id || !columna || valor === undefined) {
      return NextResponse.json({ error: 'pestana_id, columna y valor son requeridos' }, { status: 400 })
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
    const rango = pestana.rango_datos || pestana.nombre_pestana
    const inicio = Date.now()

    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const resultado = await buscarFilasSheet(access_token, archivo.google_file_id, rango, columna, valor)

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'buscar', origen: 'manual',
      datosRequest: { pestana_id, columna, valor },
      filasAfectadas: resultado.total, exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      headers: resultado.headers,
      resultados: resultado.resultados,
      total: resultado.total
    })
  } catch (error) {
    console.error('Error POST /api/google/sheets/buscar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
