import { verificarAutenticacion } from '@/lib/auth'
import { obtenerInformeHtml, obtenerNombreMarca } from '@/lib/supabase'

/**
 * GET /api/informes/:id/html
 * Sirve el HTML del informe directamente para abrir en nueva pestaña
 * Super admin puede acceder a informes de cualquier marca
 */
export async function GET(request, { params }) {
  try {
    // Soportar token por header o por query param (para abrir en nueva pestaña)
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
    const { searchParams } = new URL(request.url)
    const marcaIdParam = searchParams.get('marca_id')

    let idMarca = auth.usuario.id_marca
    let nombreMarca = auth.usuario.nombre_marca

    // Super admin puede acceder a informes de cualquier marca
    if (marcaIdParam && auth.usuario.es_super_admin) {
      idMarca = parseInt(marcaIdParam)
      const resMarca = await obtenerNombreMarca(idMarca)
      if (resMarca.success) {
        nombreMarca = resMarca.nombre_marca
      }
    }

    const resultado = await obtenerInformeHtml(parseInt(id), idMarca, nombreMarca)

    if (!resultado.success) {
      return new Response(`<html><body><h1>${resultado.error}</h1></body></html>`, {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    if (!resultado.data.html_informe) {
      return new Response('<html><body><h1>Este informe no tiene contenido HTML</h1></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    return new Response(resultado.data.html_informe, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=3600'
      }
    })
  } catch (error) {
    console.error('Error en GET /api/informes/[id]/html:', error)
    return new Response('<html><body><h1>Error interno del servidor</h1></body></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}
