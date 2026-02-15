import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { getHerramientasAgente, setHerramientasAgente } from '@/lib/agentes'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await getHerramientasAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, herramientas: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes/:id/herramientas:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const resultado = await setHerramientasAgente(id, body)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error PUT /api/agentes/:id/herramientas:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
