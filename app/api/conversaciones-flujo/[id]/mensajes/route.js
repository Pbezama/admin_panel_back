/**
 * API: /api/conversaciones-flujo/:id/mensajes
 * GET - Obtener mensajes de una conversacion de flujo
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerMensajesFlujo } from '@/lib/supabase'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await obtenerMensajesFlujo(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, mensajes: resultado.data })
  } catch (error) {
    console.error('Error GET /api/conversaciones-flujo/:id/mensajes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
