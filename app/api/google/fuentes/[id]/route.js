/**
 * API: /api/google/fuentes/[id]
 * GET    - Detalle de fuente con pestanas y documentos
 * PUT    - Actualizar fuente (nombre, descripcion, pestanas, documentos)
 * DELETE - Eliminar fuente
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    const { data, error } = await supabase
      .from('google_fuentes_datos')
      .select(`
        *,
        google_fuente_pestanas(
          id, orden,
          google_pestanas(id, nombre_pestana, alias, descripcion, headers, total_filas,
            google_archivos(id, nombre_archivo, alias, google_file_id, id_conexion)
          )
        ),
        google_fuente_documentos(
          id, orden,
          google_archivos(id, nombre_archivo, alias, tipo_archivo, google_file_id, id_conexion)
        )
      `)
      .eq('id', id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Fuente no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ success: true, fuente: data })
  } catch (error) {
    console.error('Error GET /api/google/fuentes/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json()

    // Actualizar campos basicos
    const updates = { actualizado_en: new Date().toISOString() }
    if (body.nombre !== undefined) updates.nombre = body.nombre
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion
    if (body.tipo !== undefined) updates.tipo = body.tipo
    if (body.estado !== undefined) updates.estado = body.estado

    const { data, error } = await supabase
      .from('google_fuentes_datos')
      .update(updates)
      .eq('id', id)
      .eq('id_marca', idMarca)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Fuente no encontrada' }, { status: 404 })
    }

    // Reemplazar pestanas si se envian
    if (body.pestana_ids !== undefined) {
      await supabase.from('google_fuente_pestanas').delete().eq('id_fuente', id)
      if (body.pestana_ids.length > 0) {
        const rows = body.pestana_ids.map((pid, i) => ({ id_fuente: parseInt(id), id_pestana: pid, orden: i }))
        await supabase.from('google_fuente_pestanas').insert(rows)
      }
    }

    // Reemplazar documentos si se envian
    if (body.archivo_ids !== undefined) {
      await supabase.from('google_fuente_documentos').delete().eq('id_fuente', id)
      if (body.archivo_ids.length > 0) {
        const rows = body.archivo_ids.map((aid, i) => ({ id_fuente: parseInt(id), id_archivo: aid, orden: i }))
        await supabase.from('google_fuente_documentos').insert(rows)
      }
    }

    return NextResponse.json({ success: true, fuente: data })
  } catch (error) {
    console.error('Error PUT /api/google/fuentes/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    const { error } = await supabase
      .from('google_fuentes_datos')
      .delete()
      .eq('id', id)
      .eq('id_marca', idMarca)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/google/fuentes/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
