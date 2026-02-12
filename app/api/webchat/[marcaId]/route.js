/**
 * API: /api/webchat/:marcaId
 * POST - Procesar mensaje del web chat (endpoint publico, sin auth)
 *
 * El web chat usa patron request-response: el browser envia un mensaje,
 * el flujo se ejecuta, y todas las respuestas se devuelven en un array.
 */

import { NextResponse } from 'next/server'
import { procesarMensajeConFlujo } from '@/services/flowRouter'
import { crearWebChatAdapter } from '@/services/channels/webChatAdapter'
import { obtenerConfigWebChat } from '@/lib/supabase'

// Rate limiting simple por session_id
const rateLimits = new Map()
const MAX_MSGS_PER_MINUTE = 30
const RATE_WINDOW = 60000

function checkRateLimit(sessionId) {
  const ahora = Date.now()
  const entry = rateLimits.get(sessionId)

  if (!entry || ahora - entry.inicio > RATE_WINDOW) {
    rateLimits.set(sessionId, { inicio: ahora, count: 1 })
    return true
  }

  if (entry.count >= MAX_MSGS_PER_MINUTE) {
    return false
  }

  entry.count++
  return true
}

export async function POST(request, { params }) {
  try {
    const { marcaId } = await params

    if (!marcaId) {
      return NextResponse.json({ error: 'marcaId requerido' }, { status: 400 })
    }

    const body = await request.json()
    const { session_id, mensaje } = body

    if (!session_id || !mensaje) {
      return NextResponse.json({ error: 'session_id y mensaje requeridos' }, { status: 400 })
    }

    // Rate limiting
    if (!checkRateLimit(session_id)) {
      return NextResponse.json({ error: 'Demasiados mensajes, espera un momento' }, { status: 429 })
    }

    // Verificar que la marca existe
    const configResult = await obtenerConfigWebChat(marcaId)
    if (!configResult.success || !configResult.data) {
      return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })
    }

    // Crear adapter web chat con acumulador
    const { adapter, respuestas } = crearWebChatAdapter(session_id)

    // Procesar mensaje con el flow router
    const result = await procesarMensajeConFlujo({
      canal: 'web',
      identificador: session_id,
      mensaje,
      idMarca: parseInt(marcaId),
      adapter
    })

    if (!result.handled) {
      // Si no hay flujo activo, enviar mensaje por defecto
      return NextResponse.json({
        success: true,
        handled: false,
        respuestas: [{
          tipo: 'texto',
          contenido: 'No hay un flujo activo en este momento. Intenta enviar una palabra clave para comenzar.'
        }]
      })
    }

    return NextResponse.json({
      success: true,
      handled: true,
      respuestas
    })
  } catch (error) {
    console.error('Error POST /api/webchat/:marcaId:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
