import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { subirArchivoTarea } from '@/lib/supabase'

// POST /api/tareas/[id]/upload - Subir archivo a una tarea
export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { id } = await params
    const formData = await request.formData()
    const archivo = formData.get('archivo')

    if (!archivo) {
      return NextResponse.json(
        { success: false, error: 'Archivo requerido' },
        { status: 400 }
      )
    }

    // Convertir a buffer para Supabase
    const buffer = Buffer.from(await archivo.arrayBuffer())

    // Crear objeto similar a File para supabase
    const archivoParaSubir = {
      name: archivo.name,
      type: archivo.type,
      size: archivo.size
    }

    const resultado = await subirArchivoTarea(buffer, parseInt(id), archivoParaSubir)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en POST /api/tareas/[id]/upload:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
