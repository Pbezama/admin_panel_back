import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { getConocimientoAgente, addConocimientoAgente, deleteConocimientoAgente } from '@/lib/agentes'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await getConocimientoAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, conocimiento: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes/:id/conocimiento:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    if (!body.contenido) {
      return NextResponse.json({ error: 'El contenido es requerido' }, { status: 400 })
    }

    const resultado = await addConocimientoAgente(id, body)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, fragmento: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/agentes/:id/conocimiento:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const url = new URL(request.url)
    const fragmentoId = url.searchParams.get('fragmentoId')

    if (!fragmentoId) {
      return NextResponse.json({ error: 'fragmentoId es requerido' }, { status: 400 })
    }

    const resultado = await deleteConocimientoAgente(fragmentoId)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/agentes/:id/conocimiento:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
