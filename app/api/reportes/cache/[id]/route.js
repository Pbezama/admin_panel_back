import { verificarAutenticacion } from '@/lib/auth'

// Import the shared cache from the html route
// Note: In Next.js serverless this cache is per-instance
let htmlCache

async function getCache() {
  if (!htmlCache) {
    try {
      const mod = await import('../../html/route.js')
      htmlCache = mod.htmlCache
    } catch {
      htmlCache = new Map()
    }
  }
  return htmlCache
}

/**
 * GET /api/reportes/cache/:id
 * Sirve un reporte HTML cacheado directamente
 * Soporta token por header o query param (para nueva pestaña)
 */
export async function GET(request, { params }) {
  try {
    let auth = await verificarAutenticacion(request)

    if (!auth.autenticado) {
      const { searchParams } = new URL(request.url)
      const tokenParam = searchParams.get('token')
      if (tokenParam) {
        const { verificarToken } = await import('@/lib/auth')
        const resultado = await verificarToken(tokenParam)
        if (resultado.success) {
          auth = { autenticado: true, usuario: resultado.usuario }
        }
      }
    }

    if (!auth.autenticado) {
      return new Response('<html><body><h1>No autorizado</h1></body></html>', {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    const { id } = await params
    const cache = await getCache()
    const entry = cache.get(id)

    if (!entry) {
      return new Response('<html><body><h1>Reporte no encontrado o expirado</h1><p>Los reportes cacheados expiran despues de 1 hora.</p></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    // Verify the user has access to this brand's report
    const idMarca = auth.usuario.id_marca
    if (String(entry.idMarca) !== String(idMarca) && !auth.usuario.es_super_admin) {
      return new Response('<html><body><h1>Sin permisos para ver este reporte</h1></body></html>', {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    return new Response(entry.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=3600'
      }
    })
  } catch (error) {
    console.error('Error en GET /api/reportes/cache/[id]:', error)
    return new Response('<html><body><h1>Error interno</h1></body></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}
