/**
 * API: /api/dashboard-live/conversaciones/:id/asignar
 * POST - Asignar un ejecutivo a una conversacion transferida
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { actualizarConversacionFlujo } from '@/lib/supabase'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { ejecutivo_id } = body

    if (!ejecutivo_id) {
      return NextResponse.json({ error: 'ejecutivo_id requerido' }, { status: 400 })
    }

    const resultado = await actualizarConversacionFlujo(id, {
      ejecutivo_asignado_id: ejecutivo_id
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversacion: resultado.data })
  } catch (error) {
    console.error('Error POST /api/dashboard-live/conversaciones/:id/asignar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
