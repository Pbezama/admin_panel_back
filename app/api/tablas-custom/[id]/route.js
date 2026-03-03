/**
 * API: /api/tablas-custom/:id
 * GET    → obtener tabla con conteo de registros
 * PUT    → editar nombre/descripcion/columnas
 * DELETE → eliminar tabla y todos sus registros
 */
import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTablaCustom, actualizarTablaCustom, eliminarTablaCustom } from '@/lib/tablasCustom'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const resultado = await obtenerTablaCustom(Number(id), auth.idMarca)
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 404 })

    return NextResponse.json({ success: true, tabla: resultado.data })
  } catch (error) {
    console.error('Error GET /api/tablas-custom/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const resultado = await actualizarTablaCustom(Number(id), auth.idMarca, body)
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({ success: true, tabla: resultado.data })
  } catch (error) {
    console.error('Error PUT /api/tablas-custom/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const resultado = await eliminarTablaCustom(Number(id), auth.idMarca)
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/tablas-custom/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
