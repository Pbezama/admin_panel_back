/**
 * API: /api/google/conexiones
 * GET  - Listar conexiones Google de la marca
 * POST - Crear nueva conexion e iniciar OAuth automaticamente
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { buildGoogleOAuthUrl, encodeGoogleState } from '@/lib/google'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    const { data, error } = await supabase
      .from('google_conexiones')
      .select('id, nombre_cuenta, email_google, estado, scopes, conectado_por, creado_en, actualizado_en')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, conexiones: data })
  } catch (error) {
    console.error('Error GET /api/google/conexiones:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'Solo administradores pueden crear conexiones' }, { status: 403 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json()
    const { nombre_cuenta, callback_url } = body

    if (!nombre_cuenta) {
      return NextResponse.json({ error: 'nombre_cuenta es requerido' }, { status: 400 })
    }

    // Crear registro de conexion (sin tokens aun, estado pendiente)
    const { data: conexion, error } = await supabase
      .from('google_conexiones')
      .insert({
        id_marca: idMarca,
        nombre_cuenta,
        estado: 'pendiente',
        conectado_por: auth.usuario.id
      })
      .select()
      .single()

    if (error) throw error

    // Generar URL de OAuth con credenciales globales de CreceTec
    const state = encodeGoogleState(conexion.id, auth.usuario.id, idMarca, callback_url || process.env.DASHBOARD_URL || '')
    const oauthUrl = buildGoogleOAuthUrl(state)

    return NextResponse.json({
      success: true,
      conexion: { id: conexion.id, nombre_cuenta: conexion.nombre_cuenta, estado: conexion.estado },
      oauth_url: oauthUrl
    }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/conexiones:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
