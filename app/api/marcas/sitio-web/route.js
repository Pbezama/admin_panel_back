import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerSitioWebMarca } from '@/lib/supabase'

/**
 * GET /api/marcas/sitio-web
 * Obtiene el sitio web de la marca del usuario autenticado
 */
export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const idMarca = auth.usuario.id_marca
    if (!idMarca) {
      return NextResponse.json({ success: true, sitio_web: null })
    }

    const resultado = await obtenerSitioWebMarca(idMarca)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/marcas/sitio-web:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
