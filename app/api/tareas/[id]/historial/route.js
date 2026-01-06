import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerHistorialTarea } from '@/lib/supabase'

// GET /api/tareas/[id]/historial - Obtener historial de cambios de una tarea
export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { id } = await params
    const resultado = await obtenerHistorialTarea(parseInt(id))
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/tareas/[id]/historial:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
