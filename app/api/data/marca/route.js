import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerDatosMarca, obtenerTodasLasMarcas } from '@/lib/supabase'

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
    const idMarca = searchParams.get('id')
    const all = searchParams.get('all') === 'true'

    let resultado

    if (all && auth.usuario.es_super_admin) {
      // Super admin puede ver todas las marcas
      resultado = await obtenerTodasLasMarcas()
    } else if (idMarca) {
      // Obtener datos de marca específica
      resultado = await obtenerDatosMarca(idMarca)
    } else if (auth.usuario.id_marca) {
      // Usar marca del usuario autenticado
      resultado = await obtenerDatosMarca(auth.usuario.id_marca)
    } else {
      return NextResponse.json(
        { success: false, error: 'ID de marca requerido' },
        { status: 400 }
      )
    }

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/data/marca:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
