/**
 * API: /api/agentes/:id
 * GET    - Obtener agente con herramientas y stats
 * PUT    - Actualizar agente
 * DELETE - Eliminar agente
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerAgente, actualizarAgente, eliminarAgente } from '@/lib/agentes'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await obtenerAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    if (!resultado.data) {
      return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, agente: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes/:id:', error)
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
    const resultado = await actualizarAgente(id, body)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, agente: resultado.data })
  } catch (error) {
    console.error('Error PUT /api/agentes/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await eliminarAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/agentes/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
