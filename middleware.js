import { NextResponse } from 'next/server'

export function middleware(request) {
  // Solo aplicar a rutas de API
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Manejar preflight requests (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': process.env.FRONTEND_URL || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Marca-ID, X-Marca-Nombre',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Para otras requests, agregar headers CORS
  const response = NextResponse.next()

  response.headers.set(
    'Access-Control-Allow-Origin',
    process.env.FRONTEND_URL || '*'
  )
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
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
