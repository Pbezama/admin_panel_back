import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { getConversacionesAgente } from '@/lib/agentes'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const url = new URL(request.url)
    const estado = url.searchParams.get('estado') || null

    const resultado = await getConversacionesAgente(id, estado)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversaciones: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes/:id/conversaciones:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
