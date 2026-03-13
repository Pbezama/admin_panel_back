/**
 * API: /api/google/fuentes
 * GET  - Listar fuentes de datos virtuales de la marca
 * POST - Crear fuente de datos virtual
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    const { data, error } = await supabase
      .from('google_fuentes_datos')
      .select(`
        id, nombre, descripcion, tipo, estado, creado_por, creado_en,
        google_fuente_pestanas(
          id, orden,
          google_pestanas(id, nombre_pestana, alias, headers, total_filas,
            google_archivos(id, nombre_archivo, alias, google_file_id)
          )
        ),
        google_fuente_documentos(
          id, orden,
          google_archivos(id, nombre_archivo, alias, tipo_archivo, google_file_id)
        )
      `)
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, fuentes: data })
  } catch (error) {
    console.error('Error GET /api/google/fuentes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { nombre, descripcion, tipo, pestana_ids, archivo_ids } = await request.json()

    if (!nombre) {
      return NextResponse.json({ error: 'nombre es requerido' }, { status: 400 })
    }

    // Crear fuente
    const { data: fuente, error } = await supabase
      .from('google_fuentes_datos')
      .insert({
        id_marca: idMarca,
        nombre,
        descripcion: descripcion || '',
        tipo: tipo || 'sheets',
        creado_por: auth.usuario.id
      })
      .select()
      .single()

    if (error) throw error

    // Vincular pestanas
    if (pestana_ids && pestana_ids.length > 0) {
      const pestanaRows = pestana_ids.map((id, i) => ({
        id_fuente: fuente.id,
        id_pestana: id,
        orden: i
      }))
      await supabase.from('google_fuente_pestanas').insert(pestanaRows)
    }

    // Vincular documentos
    if (archivo_ids && archivo_ids.length > 0) {
      const docRows = archivo_ids.map((id, i) => ({
        id_fuente: fuente.id,
        id_archivo: id,
        orden: i
      }))
      await supabase.from('google_fuente_documentos').insert(docRows)
    }

    return NextResponse.json({ success: true, fuente }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/fuentes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
