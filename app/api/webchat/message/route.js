/**
 * API: /api/webchat/message
 * POST - Procesar mensaje del widget usando API key (sin auth)
 * Body: { api_key, session_id, mensaje }
 */

import { NextResponse } from 'next/server'
import { obtenerMarcaPorWebChatKey } from '@/lib/supabase'
import { procesarMensajeConFlujo } from '@/services/flowRouter'
import { crearWebChatAdapter } from '@/services/channels/webChatAdapter'

// Rate limiting por session_id
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

// Limpiar rate limits viejos cada 5 minutos
setInterval(() => {
  const ahora = Date.now()
  for (const [key, val] of rateLimits) {
    if (ahora - val.inicio > RATE_WINDOW * 2) {
      rateLimits.delete(key)
    }
  }
}, 300000)

export async function POST(request) {
  try {
    const body = await request.json()
    const { api_key, session_id, mensaje } = body

    if (!api_key || !session_id || !mensaje) {
      return corsResponse({ error: 'api_key, session_id y mensaje requeridos' }, 400)
    }

    // Rate limiting
    if (!checkRateLimit(session_id)) {
      return corsResponse({ error: 'Demasiados mensajes, espera un momento' }, 429)
    }

    // Validar API key y obtener marca
    const marcaResult = await obtenerMarcaPorWebChatKey(api_key)
    if (!marcaResult.success || !marcaResult.id_marca) {
      return corsResponse({ error: 'API key invalida o widget desactivado' }, 403)
    }

    const idMarca = marcaResult.id_marca

    console.log(`[WebChat] Mensaje recibido - idMarca: ${idMarca} (tipo: ${typeof idMarca}), session: ${session_id}, mensaje: "${mensaje}"`)

    // Crear adapter y procesar
    const { adapter, respuestas } = crearWebChatAdapter(session_id)

    const result = await procesarMensajeConFlujo({
      canal: 'web',
      identificador: session_id,
      mensaje,
      idMarca: idMarca,
      adapter
    })

    console.log(`[WebChat] Resultado flowRouter:`, JSON.stringify(result))

    if (!result.handled) {
      return corsResponse({
        success: true,
        handled: false,
        respuestas: [{
          tipo: 'texto',
          contenido: 'No hay un flujo activo en este momento. Intenta enviar una palabra clave para comenzar.'
        }]
      })
    }

    return corsResponse({
      success: true,
      handled: true,
      respuestas
    })
  } catch (error) {
    console.error('Error POST /api/webchat/message:', error)
    return corsResponse({ error: 'Error interno' }, 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  })
}

function corsResponse(data, status = 200) {
  const response = NextResponse.json(data, { status })
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}
