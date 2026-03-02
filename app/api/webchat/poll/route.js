/**
 * API: /api/webchat/poll
 * GET - Widget consulta por mensajes nuevos (polling)
 * Query: api_key, session_id, last_id
 *
 * Retorna mensajes salientes (del bot o ejecutivo) que el widget aun no ha visto.
 */

import { NextResponse } from 'next/server'
import { obtenerMarcaPorWebChatKey } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const apiKey = searchParams.get('api_key')
    const sessionId = searchParams.get('session_id')
    const lastId = searchParams.get('last_id')

    if (!apiKey || !sessionId) {
      return corsResponse({ error: 'api_key y session_id requeridos' }, 400)
    }

    // Validar API key
    const marcaResult = await obtenerMarcaPorWebChatKey(apiKey)
    if (!marcaResult.success || !marcaResult.id_marca) {
      return corsResponse({ error: 'API key invalida' }, 403)
    }

    // Buscar conversacion activa o transferida para este session_id
    const { data: conv, error: convError } = await supabase
      .from('conversaciones_flujo')
      .select('id, estado')
      .eq('canal', 'web')
      .eq('identificador_usuario', sessionId)
      .in('estado', ['activa', 'transferida'])
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (convError || !conv) {
      return corsResponse({ success: true, mensajes: [] })
    }

    // Obtener mensajes salientes despues del last_id
    let query = supabase
      .from('mensajes_flujo')
      .select('id, contenido, tipo_nodo, metadata, creado_en')
      .eq('conversacion_id', conv.id)
      .eq('direccion', 'saliente')
      .order('id', { ascending: true })
      .limit(20)

    if (lastId) {
      query = query.gt('id', parseInt(lastId))
    }

    const { data: mensajes, error: msgError } = await query

    if (msgError) {
      console.error('[WebChat Poll] Error obteniendo mensajes:', msgError)
      return corsResponse({ success: true, mensajes: [] })
    }

    // Formatear mensajes para el widget
    const formatted = (mensajes || []).map(m => ({
      id: m.id,
      tipo: 'texto',
      contenido: m.contenido || '',
      from: 'bot',
      tipo_nodo: m.tipo_nodo,
      ts: m.creado_en
    }))

    return corsResponse({
      success: true,
      mensajes: formatted,
      estado: conv.estado
    })
  } catch (error) {
    console.error('[WebChat Poll] Error:', error)
    return corsResponse({ error: 'Error interno' }, 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
