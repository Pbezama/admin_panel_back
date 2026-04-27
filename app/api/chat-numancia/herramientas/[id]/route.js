/**
 * API: /api/chat-numancia/herramientas/[id]
 * PUT    - Actualizar herramienta
 * DELETE - Eliminar herramienta (solo si no es semilla)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  actualizarChatNumanciaHerramienta,
  eliminarChatNumanciaHerramienta,
  registrarChatNumanciaCambio
} from '@/lib/supabase'

export async function PUT(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json()

    const resultado = await actualizarChatNumanciaHerramienta(id, idMarca, body, auth.usuario.nombre)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    const accion = body.activo !== undefined ? (body.activo ? 'activar' : 'desactivar') : 'actualizar'
    await registrarChatNumanciaCambio(idMarca, auth.usuario.nombre, 'herramienta', accion, { id, campos: Object.keys(body) })

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error PUT /api/chat-numancia/herramientas/[id]:', error)
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
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    const resultado = await eliminarChatNumanciaHerramienta(id, idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    await registrarChatNumanciaCambio(idMarca, auth.usuario.nombre, 'herramienta', 'eliminar', { id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/chat-numancia/herramientas/[id]:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
