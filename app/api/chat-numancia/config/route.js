/**
 * API: /api/chat-numancia/config
 * GET  - Obtener config chat numancia de la marca actual
 * POST - Crear config inicial
 * PUT  - Actualizar config
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  obtenerChatNumanciaConfig,
  crearChatNumanciaConfig,
  actualizarChatNumanciaConfig,
  registrarChatNumanciaCambio
} from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerChatNumanciaConfig(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error GET /api/chat-numancia/config:', error)
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

    const resultado = await crearChatNumanciaConfig(idMarca, body, auth.usuario.nombre)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    await registrarChatNumanciaCambio(idMarca, auth.usuario.nombre, 'instrucciones', 'crear', { nota: 'Config inicial creada' })

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error POST /api/chat-numancia/config:', error)
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

    const resultado = await actualizarChatNumanciaConfig(idMarca, body, auth.usuario.nombre)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    const seccion = body._seccion || 'instrucciones'
    await registrarChatNumanciaCambio(idMarca, auth.usuario.nombre, seccion, 'actualizar', { campos: Object.keys(body).filter(k => k !== '_seccion') })

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error PUT /api/chat-numancia/config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
