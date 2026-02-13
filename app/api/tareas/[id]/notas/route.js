import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerNotasTarea, agregarNotaTarea, crearNotificacionTarea } from '@/lib/supabase'

// GET /api/tareas/[id]/notas - Obtener notas de una tarea
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
    const resultado = await obtenerNotasTarea(parseInt(id))
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/tareas/[id]/notas:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST /api/tareas/[id]/notas - Agregar nota a una tarea
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
    const body = await request.json()
    const { contenido, tipo, archivo_url, archivo_nombre, archivo_tipo, archivo_tamano } = body

    if (!contenido && !archivo_url) {
      return NextResponse.json(
        { success: false, error: 'Contenido o archivo requerido' },
        { status: 400 }
      )
    }

    const nota = {
      id_tarea: parseInt(id),
      contenido: contenido || null,
      tipo: tipo || 'texto',
      archivo_url: archivo_url || null,
      archivo_nombre: archivo_nombre || null,
      archivo_tipo: archivo_tipo || null,
      archivo_tamano: archivo_tamano || null,
      creado_por: auth.usuario.id,
      nombre_creador: auth.usuario.nombre
    }

    const resultado = await agregarNotaTarea(nota)

    // Notificar al creador (fire-and-forget)
    if (resultado.success) {
      crearNotificacionTarea(
        parseInt(id),
        'nota_agregada',
        'Nueva nota en tarea',
        `${auth.usuario.nombre} agregó una nota`,
        auth.usuario
      ).catch(err => console.error('Error notificación nota:', err))
    }

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en POST /api/tareas/[id]/notas:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
