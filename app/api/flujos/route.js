/**
 * API: /api/flujos
 * GET  - Listar flujos de la marca
 * POST - Crear nuevo flujo
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerFlujos, crearFlujo } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerFlujos(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, flujos: resultado.data })
  } catch (error) {
    console.error('Error GET /api/flujos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    if (!body.nombre) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    const resultado = await crearFlujo({
      ...body,
      id_marca: idMarca,
      creado_por: auth.usuario.id
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, flujo: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/flujos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
