/**
 * API: /api/google/conexiones/[id]
 * GET    - Detalle de una conexion
 * PUT    - Actualizar nombre/credenciales
 * DELETE - Eliminar conexion
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
      .from('google_conexiones')
      .select('id, nombre_cuenta, email_google, estado, scopes, conectado_por, creado_en, actualizado_en')
      .eq('id', id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Conexion no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ success: true, conexion: data })
  } catch (error) {
    console.error('Error GET /api/google/conexiones/[id]:', error)
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
    if (body.nombre_cuenta) updates.nombre_cuenta = body.nombre_cuenta

    const { data, error } = await supabase
      .from('google_conexiones')
      .update(updates)
      .eq('id', id)
      .eq('id_marca', idMarca)
      .select('id, nombre_cuenta, email_google, estado')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Conexion no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ success: true, conexion: data })
  } catch (error) {
    console.error('Error PUT /api/google/conexiones/[id]:', error)
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
      .from('google_conexiones')
      .delete()
      .eq('id', id)
      .eq('id_marca', idMarca)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/google/conexiones/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
