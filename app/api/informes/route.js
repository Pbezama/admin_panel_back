import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerInformesPorMarca, obtenerNombreMarca } from '@/lib/supabase'

/**
 * GET /api/informes
 * Lista los informes de Instagram de la marca del usuario autenticado
 * Super admin puede pasar ?marca_id=X para ver informes de otra marca
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

    const { searchParams } = new URL(request.url)
    const marcaIdParam = searchParams.get('marca_id')

    let idMarca = auth.usuario.id_marca
    let nombreMarca = auth.usuario.nombre_marca

    // Super admin puede cambiar de marca
    if (marcaIdParam && auth.usuario.es_super_admin) {
      idMarca = parseInt(marcaIdParam)
      const resultado = await obtenerNombreMarca(idMarca)
      if (resultado.success) {
        nombreMarca = resultado.nombre_marca
      }
    }

    const resultado = await obtenerInformesPorMarca(idMarca, nombreMarca)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: resultado.data
    })
  } catch (error) {
    console.error('Error en GET /api/informes:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
