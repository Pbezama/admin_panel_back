/**
 * API: /api/google/sheets/actualizar
 * POST - Actualizar celdas especificas en una pestana
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, actualizarCeldasSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { pestana_id, rango, valores } = await request.json()

    if (!pestana_id || !rango || !valores) {
      return NextResponse.json({ error: 'pestana_id, rango y valores son requeridos' }, { status: 400 })
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
    // Prefixar con nombre de pestana si no viene
    const rangoCompleto = rango.includes('!') ? rango : `${pestana.nombre_pestana}!${rango}`
    const inicio = Date.now()

    const { access_token } = await obtenerTokenValido(archivo.id_conexion)
    const resultado = await actualizarCeldasSheet(access_token, archivo.google_file_id, rangoCompleto, valores)

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'actualizar', origen: 'manual',
      datosRequest: { pestana_id, rango: rangoCompleto },
      datosResponse: { updatedCells: resultado.updatedCells },
      filasAfectadas: valores.length, exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      celdas_actualizadas: resultado.updatedCells,
      rango: resultado.updatedRange
    })
  } catch (error) {
    console.error('Error POST /api/google/sheets/actualizar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
