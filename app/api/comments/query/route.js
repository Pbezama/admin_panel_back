import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { consultarComentarios } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { filtros } = await request.json()

    const opciones = {
      ...filtros,
      idMarca: filtros?.idMarca || auth.usuario.id_marca
    }

    const resultado = await consultarComentarios(opciones)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/comments/query:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
