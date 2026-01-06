import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTodosLosArchivos } from '@/lib/supabase'

// GET /api/tareas/archivos - Obtener todos los archivos (solo admin)
export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden ver todos los archivos
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para ver todos los archivos' },
        { status: 403 }
      )
    }

    const resultado = await obtenerTodosLosArchivos()
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/tareas/archivos:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
