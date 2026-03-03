/**
 * API: /api/tablas-custom/:id/registros
 * GET    → listar registros paginados (con filtros opcionales)
 * POST   → insertar registro
 * PUT    → actualizar registros con filtros
 * DELETE → eliminar registros con filtros
 */
import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  listarRegistrosCustom,
  insertarRegistroCustom,
  actualizarRegistrosCustom,
  eliminarRegistrosCustom,
  obtenerTablaCustom
} from '@/lib/tablasCustom'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const url = new URL(request.url)
    const pagina = parseInt(url.searchParams.get('pagina') || '1')
    const porPagina = parseInt(url.searchParams.get('por_pagina') || '50')

    // Filtros: ?filtro[columna]=valor
    const filtros = {}
    for (const [key, val] of url.searchParams.entries()) {
      const match = key.match(/^filtro\[(.+)\]$/)
      if (match) filtros[match[1]] = val
    }

    const resultado = await listarRegistrosCustom(Number(id), auth.idMarca, { pagina, porPagina, filtros })
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({
      success: true,
      registros: resultado.data,
      total: resultado.total,
      pagina: resultado.pagina,
      por_pagina: resultado.porPagina
    })
  } catch (error) {
    console.error('Error GET /api/tablas-custom/:id/registros:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    // Obtener nombre de tabla
    const tablaRes = await obtenerTablaCustom(Number(id), auth.idMarca)
    if (!tablaRes.success) return NextResponse.json({ error: 'Tabla no encontrada' }, { status: 404 })

    const resultado = await insertarRegistroCustom(
      Number(id),
      tablaRes.data.nombre,
      auth.idMarca,
      body.datos || {}
    )
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({ success: true, registro: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/tablas-custom/:id/registros:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { datos, filtros } = body

    if (!datos || typeof datos !== 'object') {
      return NextResponse.json({ error: 'datos es requerido' }, { status: 400 })
    }

    const resultado = await actualizarRegistrosCustom(Number(id), auth.idMarca, datos, filtros || [])
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({ success: true, actualizados: resultado.actualizados })
  } catch (error) {
    console.error('Error PUT /api/tablas-custom/:id/registros:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const filtros = body?.filtros || []

    const resultado = await eliminarRegistrosCustom(Number(id), auth.idMarca, filtros)
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/tablas-custom/:id/registros:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
