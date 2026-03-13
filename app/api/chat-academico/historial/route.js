/**
 * API: /api/chat-academico/historial
 * GET - Obtener ultimos cambios de la marca
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerChatAcademicoHistorial } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const resultado = await obtenerChatAcademicoHistorial(idMarca, limit)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error GET /api/chat-academico/historial:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
