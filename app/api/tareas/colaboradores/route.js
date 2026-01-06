import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerColaboradores } from '@/lib/supabase'

// GET /api/tareas/colaboradores - Obtener lista de colaboradores
export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden ver la lista de colaboradores
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para ver colaboradores' },
        { status: 403 }
      )
    }

    const resultado = await obtenerColaboradores(auth.usuario.id_marca)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/tareas/colaboradores:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
