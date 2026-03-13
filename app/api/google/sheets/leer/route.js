/**
 * API: /api/google/sheets/leer
 * POST - Leer datos de una pestana de Google Sheets
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, leerDatosSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, rango } = await request.json()

    if (!pestana_id) {
      return NextResponse.json({ error: 'pestana_id es requerido' }, { status: 400 })
    }

    // Obtener pestana + archivo + conexion
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
    const rangoFinal = rango || pestana.rango_datos || pestana.nombre_pestana
    const inicio = Date.now()

    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const data = await leerDatosSheet(access_token, archivo.google_file_id, rangoFinal)

    const rows = data.values || []
    const headers = rows[0] || []
    const filas = rows.slice(1).map(row =>
      Object.fromEntries(headers.map((h, i) => [h, row[i] || '']))
    )

    // Actualizar cache de headers y total
    await supabase.from('google_pestanas').update({
      headers: JSON.stringify(headers),
      total_filas: filas.length,
      actualizado_en: new Date().toISOString()
    }).eq('id', pestana_id)

    await supabase.from('google_archivos').update({
      ultimo_acceso: new Date().toISOString()
    }).eq('id', archivo.id)

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'leer', origen: 'manual',
      datosRequest: { pestana_id, rango: rangoFinal },
      filasAfectadas: filas.length, exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      headers,
      filas,
      total: filas.length,
      rango: rangoFinal
    })
  } catch (error) {
    console.error('Error POST /api/google/sheets/leer:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
