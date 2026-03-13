/**
 * API: /api/chat-academico/config
 * GET  - Obtener config chat academico de la marca actual
 * POST - Crear config inicial + seed herramientas default
 * PUT  - Actualizar config
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  obtenerChatAcademicoConfig,
  crearChatAcademicoConfig,
  actualizarChatAcademicoConfig,
  registrarChatAcademicoCambio
} from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerChatAcademicoConfig(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error GET /api/chat-academico/config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json().catch(() => ({}))

    const resultado = await crearChatAcademicoConfig(idMarca, body, auth.usuario.nombre)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    await registrarChatAcademicoCambio(idMarca, auth.usuario.nombre, 'instrucciones', 'crear', { nota: 'Config inicial creada' })

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error POST /api/chat-academico/config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json()

    const resultado = await actualizarChatAcademicoConfig(idMarca, body, auth.usuario.nombre)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    const seccion = body._seccion || 'instrucciones'
    await registrarChatAcademicoCambio(idMarca, auth.usuario.nombre, seccion, 'actualizar', { campos: Object.keys(body).filter(k => k !== '_seccion') })

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error PUT /api/chat-academico/config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
