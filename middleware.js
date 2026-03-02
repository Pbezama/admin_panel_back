import { NextResponse } from 'next/server'

export function middleware(request) {
  // Solo aplicar a rutas de API
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  const pathname = request.nextUrl.pathname

  // Rutas publicas del webchat widget: CORS abierto (cualquier origen)
  const isWebchatPublic = pathname.startsWith('/api/webchat/widget.js') ||
    pathname.startsWith('/api/webchat/config') && !pathname.includes('config-admin') ||
    pathname.startsWith('/api/webchat/message') ||
    pathname.startsWith('/api/webchat/poll')

  const allowOrigin = isWebchatPublic ? '*' : (process.env.FRONTEND_URL || '*')

  // Manejar preflight requests (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Marca-ID, X-Marca-Nombre',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Para otras requests, agregar headers CORS
  const response = NextResponse.next()

  response.headers.set('Access-Control-Allow-Origin', allowOrigin)
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  )
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  )

  return response
}

export const config = {
  matcher: '/api/:path*',
}
