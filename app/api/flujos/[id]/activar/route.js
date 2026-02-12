/**
 * API: /api/flujos/:id/activar
 * POST - Activar o pausar un flujo
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { actualizarFlujo } from '@/lib/supabase'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const nuevoEstado = body.estado || 'activo' // 'activo' o 'pausado'

    if (!['activo', 'pausado', 'borrador'].includes(nuevoEstado)) {
      return NextResponse.json({ error: 'Estado invalido' }, { status: 400 })
    }

    const resultado = await actualizarFlujo(id, { estado: nuevoEstado })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, flujo: resultado.data })
  } catch (error) {
    console.error('Error POST /api/flujos/:id/activar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
