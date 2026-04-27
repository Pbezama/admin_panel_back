/**
 * API: /api/chat-numancia/probar
 * POST - Probar ChatNumancia desde el admin panel.
 *        Hace forward al backend Vercel (chat-numancia-api) con internal_key.
 *        Evita duplicar la logica OpenAI en ambos servicios.
 *
 * Body: { mensaje, session_id? }
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'

const CHAT_NUMANCIA_URL = process.env.CHAT_NUMANCIA_URL || 'https://chat-numancia-api.vercel.app'
const CHAT_NUMANCIA_INTERNAL_KEY = process.env.CHAT_NUMANCIA_INTERNAL_KEY

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    if (!CHAT_NUMANCIA_INTERNAL_KEY) {
      return NextResponse.json({ error: 'CHAT_NUMANCIA_INTERNAL_KEY no configurada en el servidor' }, { status: 500 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const body = await request.json()
    const { mensaje, session_id } = body

    if (!mensaje) {
      return NextResponse.json({ error: 'mensaje es requerido' }, { status: 400 })
    }

    const sessionId = session_id || `prueba_${idMarca}_${auth.usuario.id}_${Date.now()}`

    const resp = await fetch(`${CHAT_NUMANCIA_URL}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        internal_key: CHAT_NUMANCIA_INTERNAL_KEY,
        session_id: sessionId,
        mensaje
      })
    })

    const data = await resp.json()
    if (!resp.ok) {
      return NextResponse.json({ error: data.error || 'Error en backend ChatNumancia', status: resp.status }, { status: 502 })
    }

    return NextResponse.json({
      success: data.success,
      respuesta: data.respuestas?.[0]?.contenido || '',
      estado: data.estado,
      session_id: sessionId
    })
  } catch (error) {
    console.error('Error POST /api/chat-numancia/probar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
