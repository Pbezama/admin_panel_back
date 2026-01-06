import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { desactivarDato } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID es requerido' },
        { status: 400 }
      )
    }

    const resultado = await desactivarDato(id)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/data/deactivate:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
