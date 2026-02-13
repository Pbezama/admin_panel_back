import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { actualizarTarea, cambiarEstadoTareaConHistorial, desactivarTarea, crearNotificacionTarea } from '@/lib/supabase'

// PUT /api/tareas/[id] - Actualizar tarea
export async function PUT(request, { params }) {
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
    const { estado, evidencias, notas, ...otrosUpdates } = body

    let resultado

    // Si solo se está cambiando el estado - usar funcion con historial
    if (estado && Object.keys(otrosUpdates).length === 0 && !evidencias && !notas) {
      resultado = await cambiarEstadoTareaConHistorial(parseInt(id), estado, auth.usuario)
    } else if (estado) {
      // Cambio de estado con otros updates
      const extras = {}
      if (evidencias) extras.evidencias = evidencias
      if (notas) extras.notas = notas
      Object.assign(extras, otrosUpdates)
      resultado = await cambiarEstadoTareaConHistorial(parseInt(id), estado, auth.usuario, extras)
    } else {
      // Actualización general sin cambio de estado
      const updates = { ...otrosUpdates }
      if (evidencias) updates.evidencias = evidencias
      if (notas) updates.notas = notas
      resultado = await actualizarTarea(parseInt(id), updates)
    }

    // Notificar al creador (fire-and-forget)
    if (resultado.success) {
      const estadoTexto = estado ? `Estado: ${estado}` : 'Tarea actualizada'
      const tipoNotif = estado ? 'cambio_estado' : 'tarea_actualizada'
      const tituloTarea = resultado.data?.titulo || `Tarea #${id}`
      crearNotificacionTarea(
        parseInt(id),
        tipoNotif,
        `${tituloTarea} - ${estadoTexto}`,
        `${auth.usuario.nombre} ${estado ? `cambió el estado a "${estado}"` : 'actualizó la tarea'}`,
        auth.usuario
      ).catch(err => console.error('Error notificación tarea:', err))
    }

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en PUT /api/tareas/[id]:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE /api/tareas/[id] - Desactivar tarea
export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden eliminar tareas
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para eliminar tareas' },
        { status: 403 }
      )
    }

    const { id } = await params
    const resultado = await desactivarTarea(parseInt(id))
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en DELETE /api/tareas/[id]:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
