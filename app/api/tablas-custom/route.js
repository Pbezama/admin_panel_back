/**
 * API: /api/tablas-custom
 * GET  → listar tablas de la marca
 * POST → crear nueva tabla
 */
import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { listarTablasCustom, crearTablaCustom } from '@/lib/tablasCustom'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const resultado = await listarTablasCustom(auth.idMarca)
    if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })

    return NextResponse.json({ success: true, tablas: resultado.data })
  } catch (error) {
    console.error('Error GET /api/tablas-custom:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { nombre, descripcion, columnas } = body

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre de la tabla es requerido' }, { status: 400 })
    }

    const resultado = await crearTablaCustom(auth.idMarca, {
      nombre: nombre.trim().toLowerCase().replace(/\s+/g, '_'),
      descripcion,
      columnas: columnas || []
    })

    if (!resultado.success) {
      const msg = resultado.error?.includes('unique') || resultado.error?.includes('duplicate')
        ? 'Ya existe una tabla con ese nombre'
        : resultado.error
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ success: true, tabla: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/tablas-custom:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
