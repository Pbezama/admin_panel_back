/**
 * API: /api/chat-academico/herramientas
 * GET  - Listar herramientas de la marca
 * POST - Crear nueva herramienta
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  obtenerChatAcademicoHerramientas,
  crearChatAcademicoHerramienta,
  registrarChatAcademicoCambio
} from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerChatAcademicoHerramientas(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error GET /api/chat-academico/herramientas:', error)
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
    const body = await request.json()

    if (!body.nombre || !body.descripcion) {
      return NextResponse.json({ error: 'nombre y descripcion son requeridos' }, { status: 400 })
    }

    const resultado = await crearChatAcademicoHerramienta(idMarca, body, auth.usuario.nombre)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    await registrarChatAcademicoCambio(idMarca, auth.usuario.nombre, 'herramienta', 'crear', { nombre: body.nombre })

    return NextResponse.json({ success: true, data: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/chat-academico/herramientas:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
