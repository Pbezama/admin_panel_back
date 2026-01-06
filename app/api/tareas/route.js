import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTareas, crearTarea } from '@/lib/supabase'

// GET /api/tareas - Obtener lista de tareas
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
    const estado = searchParams.get('estado')

    const opciones = {
      idMarca: auth.usuario.id_marca,
      asignadoA: auth.usuario.id,
      tipoUsuario: auth.usuario.tipo_usuario,
      estado: estado || undefined
    }

    const resultado = await obtenerTareas(opciones)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/tareas:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST /api/tareas - Crear nueva tarea
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden crear tareas
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para crear tareas' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { titulo, descripcion, tipo, prioridad, fecha_limite, asignado_a, creado_por_sistema } = body

    if (!titulo || !tipo) {
      return NextResponse.json(
        { success: false, error: 'Título y tipo son requeridos' },
        { status: 400 }
      )
    }

    const tarea = {
      titulo,
      descripcion: descripcion || null,
      tipo,
      prioridad: prioridad || 'media',
      fecha_limite: fecha_limite || null,
      id_marca: auth.usuario.id_marca,
      nombre_marca: auth.usuario.nombre_marca,
      asignado_a: asignado_a || null,
      creado_por: auth.usuario.id,
      creado_por_sistema: creado_por_sistema || false
    }

    const resultado = await crearTarea(tarea)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en POST /api/tareas:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
