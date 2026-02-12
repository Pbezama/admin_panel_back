/**
 * API: /api/flujos/:id
 * GET    - Obtener flujo individual
 * PUT    - Actualizar flujo
 * DELETE - Eliminar flujo
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerFlujo, actualizarFlujo, eliminarFlujo } from '@/lib/supabase'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await obtenerFlujo(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    if (!resultado.data) {
      return NextResponse.json({ error: 'Flujo no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, flujo: resultado.data })
  } catch (error) {
    console.error('Error GET /api/flujos/:id:', error)
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
    const resultado = await actualizarFlujo(id, body)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, flujo: resultado.data })
  } catch (error) {
    console.error('Error PUT /api/flujos/:id:', error)
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
    const resultado = await eliminarFlujo(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/flujos/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
