/**
 * API: /api/conversaciones-flujo/:id
 * GET - Obtener detalle de una conversacion de flujo
 * PATCH - Detener/cancelar una conversacion de flujo
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params

    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .select('*, flujos(id, nombre)')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversacion: data })
  } catch (error) {
    console.error('Error GET /api/conversaciones-flujo/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { estado } = body

    if (!estado || !['cancelada', 'completada'].includes(estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('conversaciones_flujo')
      .update({
        estado,
        actualizado_en: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, estado')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversacion: data })
  } catch (error) {
    console.error('Error PATCH /api/conversaciones-flujo/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
