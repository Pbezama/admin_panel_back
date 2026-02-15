import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { duplicarAgente } from '@/lib/agentes'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await duplicarAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, agente: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/agentes/:id/duplicar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
