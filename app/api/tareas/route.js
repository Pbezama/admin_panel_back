import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTareas, crearTarea, obtenerUsuarioPorId } from '@/lib/supabase'
import { enviarNotificacionTarea } from '@/lib/whatsapp'

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

    // Asignado_a es obligatorio
    if (!asignado_a) {
      return NextResponse.json(
        { success: false, error: 'Debes asignar la tarea a un colaborador' },
        { status: 400 }
      )
    }

    // Obtener datos del colaborador para el nombre_asignado
    const colaborador = await obtenerUsuarioPorId(asignado_a)
    const nombreAsignado = colaborador.success ? colaborador.data.nombre : null

    const tarea = {
      titulo,
      descripcion: descripcion || null,
      tipo,
      prioridad: prioridad || 'media',
      fecha_limite: fecha_limite || null,
      id_marca: auth.usuario.id_marca,
      nombre_marca: auth.usuario.nombre_marca,
      asignado_a: asignado_a,
      nombre_asignado: nombreAsignado,
      creado_por: auth.usuario.id,
      creado_por_sistema: creado_por_sistema || false
    }

    const resultado = await crearTarea(tarea)

    // Enviar notificación WhatsApp al colaborador
    let whatsappEnviado = false
    let whatsappDestinatario = null

    if (resultado.success && colaborador.success && colaborador.data.telefono) {
      try {
        const whatsappResult = await enviarNotificacionTarea(
          colaborador.data.telefono,
          colaborador.data.nombre
        )
        if (whatsappResult.success) {
          whatsappEnviado = true
          whatsappDestinatario = colaborador.data.nombre
          console.log(`WhatsApp enviado a ${colaborador.data.nombre} (${colaborador.data.telefono})`)
        }
      } catch (whatsappError) {
        console.error('Error enviando WhatsApp (no bloquea):', whatsappError)
      }
    }

    return NextResponse.json({
      ...resultado,
      whatsappEnviado,
      whatsappDestinatario
    })

  } catch (error) {
    console.error('Error en POST /api/tareas:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
