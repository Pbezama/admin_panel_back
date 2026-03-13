/**
 * API: /api/google/archivos/[id]
 * GET    - Detalle de archivo + pestanas seleccionadas
 * PUT    - Actualizar alias/descripcion
 * DELETE - Desvincular archivo
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

    const { data: archivo, error } = await supabase
      .from('google_archivos')
      .select(`
        *,
        google_conexiones(nombre_cuenta, email_google, estado),
        google_pestanas(id, sheet_id, nombre_pestana, alias, descripcion, rango_datos, headers, total_filas, estado)
      `)
      .eq('id', id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (error || !archivo) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, archivo })
  } catch (error) {
    console.error('Error GET /api/google/archivos/[id]:', error)
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

    const updates = { actualizado_en: new Date().toISOString() }
    if (body.alias !== undefined) updates.alias = body.alias
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion

    const { data, error } = await supabase
      .from('google_archivos')
      .update(updates)
      .eq('id', id)
      .eq('id_marca', idMarca)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, archivo: data })
  } catch (error) {
    console.error('Error PUT /api/google/archivos/[id]:', error)
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
      .from('google_archivos')
      .delete()
      .eq('id', id)
      .eq('id_marca', idMarca)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/google/archivos/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
