import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { modificarDato } from '@/lib/supabase'

export async function PUT(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { id, updates } = await request.json()

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID es requerido' },
        { status: 400 }
      )
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Updates son requeridos' },
        { status: 400 }
      )
    }

    const resultado = await modificarDato(id, updates)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/data/update:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
