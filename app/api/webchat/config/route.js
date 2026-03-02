/**
 * API: /api/webchat/config
 * GET ?key=xxx - Obtener config publica del widget por API key (sin auth)
 */

import { NextResponse } from 'next/server'
import { obtenerWebChatConfigPorKey } from '@/lib/supabase'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const apiKey = searchParams.get('key')

    if (!apiKey) {
      return NextResponse.json({ error: 'API key requerida' }, { status: 400 })
    }

    const resultado = await obtenerWebChatConfigPorKey(apiKey)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 404 })
    }

    const response = NextResponse.json({ success: true, config: resultado.data })
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Cache-Control', 'public, max-age=300')
    return response
  } catch (error) {
    console.error('Error GET /api/webchat/config:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
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
