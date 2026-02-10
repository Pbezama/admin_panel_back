import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerMarcasDesdeInstagram } from '@/lib/supabase'

/**
 * GET /api/marcas/instagram
 * Retorna marcas desde cuentas_instagram con id_marca mapeado via cuentas_facebook.
 * Solo accesible por super admin.
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

    if (!auth.usuario.es_super_admin) {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado' },
        { status: 403 }
      )
    }

    const resultado = await obtenerMarcasDesdeInstagram()
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/marcas/instagram:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
