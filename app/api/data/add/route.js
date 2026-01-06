import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { agregarDato } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { dato } = await request.json()

    if (!dato) {
      return NextResponse.json(
        { success: false, error: 'Dato es requerido' },
        { status: 400 }
      )
    }

    // Asegurar que tenga ID de marca
    const datoConMarca = {
      ...dato,
      'ID marca': dato['ID marca'] || auth.usuario.id_marca,
      'Nombre marca': dato['Nombre marca'] || auth.usuario.nombre_marca
    }

    const resultado = await agregarDato(datoConMarca)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/data/add:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
