/**
 * API: /api/conversaciones-flujo/:id/logs
 * GET - Obtener logs de ejecución de una conversación de flujo
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerLogsFlujo } from '@/lib/supabase'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params

    const resultado = await obtenerLogsFlujo(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, logs: resultado.data })
  } catch (error) {
    console.error('Error GET /api/conversaciones-flujo/:id/logs:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
