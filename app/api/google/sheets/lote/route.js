/**
 * API: /api/google/sheets/lote
 * POST - Operaciones en lote (leer o escribir multiples rangos)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, leerLoteSheet, escribirLoteSheet, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { conexion_id, spreadsheet_id, operacion, rangos, datos } = await request.json()

    if (!conexion_id || !spreadsheet_id || !operacion) {
      return NextResponse.json({ error: 'conexion_id, spreadsheet_id y operacion son requeridos' }, { status: 400 })
    }

    const inicio = Date.now()
    const { access_token } = await obtenerTokenValido(conexion_id)

    let resultado

    if (operacion === 'leer') {
      if (!rangos || !Array.isArray(rangos)) {
        return NextResponse.json({ error: 'rangos (array de strings) es requerido para leer' }, { status: 400 })
      }
      resultado = await leerLoteSheet(access_token, spreadsheet_id, rangos)
    } else if (operacion === 'escribir') {
      if (!datos || !Array.isArray(datos)) {
        return NextResponse.json({ error: 'datos (array de {range, values}) es requerido para escribir' }, { status: 400 })
      }
      resultado = await escribirLoteSheet(access_token, spreadsheet_id, datos)
    } else {
      return NextResponse.json({ error: 'operacion debe ser "leer" o "escribir"' }, { status: 400 })
    }

    await registrarOperacionGoogle({
      idMarca, idConexion: conexion_id,
      operacion: `lote_${operacion}`, origen: 'manual',
      datosRequest: { spreadsheet_id, operacion, num_rangos: (rangos || datos).length },
      exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({ success: true, resultado })
  } catch (error) {
    console.error('Error POST /api/google/sheets/lote:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
