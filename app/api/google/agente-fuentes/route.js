/**
 * API: /api/google/agente-fuentes
 * GET    - Listar fuentes asignadas a un agente
 * POST   - Asignar fuente a agente
 * DELETE - Desasignar fuente de agente
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

    const agenteId = request.nextUrl.searchParams.get('agente_id')
    if (!agenteId) {
      return NextResponse.json({ error: 'agente_id es requerido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('agente_google_fuentes')
      .select(`
        id, permisos, prioridad,
        google_fuentes_datos(id, nombre, descripcion, tipo, estado)
      `)
      .eq('id_agente', agenteId)
      .order('prioridad', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, fuentes: data })
  } catch (error) {
    console.error('Error GET /api/google/agente-fuentes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { agente_id, fuente_id, permisos, prioridad } = await request.json()

    if (!agente_id || !fuente_id) {
      return NextResponse.json({ error: 'agente_id y fuente_id son requeridos' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('agente_google_fuentes')
      .upsert({
        id_agente: agente_id,
        id_fuente: fuente_id,
        permisos: permisos || 'lectura',
        prioridad: prioridad || 0
      }, { onConflict: 'id_agente,id_fuente' })
      .select(`
        id, permisos, prioridad,
        google_fuentes_datos(id, nombre, descripcion)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, asignacion: data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/google/agente-fuentes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado || !esAdmin(auth.usuario)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const agenteId = request.nextUrl.searchParams.get('agente_id')
    const fuenteId = request.nextUrl.searchParams.get('fuente_id')

    if (!agenteId || !fuenteId) {
      return NextResponse.json({ error: 'agente_id y fuente_id son requeridos' }, { status: 400 })
    }

    const { error } = await supabase
      .from('agente_google_fuentes')
      .delete()
      .eq('id_agente', agenteId)
      .eq('id_fuente', fuenteId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/google/agente-fuentes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
