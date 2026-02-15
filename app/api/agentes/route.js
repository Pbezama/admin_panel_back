/**
 * API: /api/agentes
 * GET  - Listar agentes de la marca
 * POST - Crear nuevo agente
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerAgentes, crearAgente } from '@/lib/agentes'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerAgentes(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, agentes: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes:', error)
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

    const resultado = await crearAgente({
      ...body,
      id_marca: idMarca,
      creado_por: auth.usuario.id
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, agente: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/agentes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
