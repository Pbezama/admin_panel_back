import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerLogsComentarios } from '@/lib/supabase'

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
    const idMarca = searchParams.get('idMarca') || auth.usuario.id_marca
    const limite = parseInt(searchParams.get('limite')) || 100

    const resultado = await obtenerLogsComentarios(
      auth.usuario.es_super_admin ? null : idMarca,
      limite
    )

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/comments:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
