/**
 * API: /api/webchat/widget.js
 * GET - Sirve el archivo JavaScript del widget de chat (publico)
 */

import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

let cachedWidget = null
let cacheTime = 0
const CACHE_TTL = 60000 // 1 minuto en dev, en produccion usar mas

export async function GET() {
  try {
    // Cache en memoria
    if (cachedWidget && Date.now() - cacheTime < CACHE_TTL) {
      return createJSResponse(cachedWidget)
    }

    const filePath = join(process.cwd(), 'services', 'widget', 'crecetec-chat-widget.js')
    cachedWidget = readFileSync(filePath, 'utf-8')
    cacheTime = Date.now()

    return createJSResponse(cachedWidget)
  } catch (error) {
    console.error('Error GET /api/webchat/widget.js:', error)
    return new NextResponse('// Widget not found', {
      status: 500,
      headers: { 'Content-Type': 'application/javascript' }
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    }
  })
}

function createJSResponse(content) {
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    }
  })
}
