import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import {
  aprobarRegla,
  rechazarRegla,
  actualizarTarea,
  registrarCambioTarea
} from '@/lib/supabase'

/**
 * POST /api/reglas/aprobar
 * Aprobar o rechazar una regla desde el dashboard web
 *
 * Body:
 * {
 *   postId: string,      // ID de la publicación (clave en base_cuentas)
 *   tareaId?: number,    // ID de la tarea asociada (opcional)
 *   accion: 'aprobar' | 'rechazar'
 * }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden aprobar/rechazar reglas
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para aprobar reglas' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { postId, tareaId, accion } = body

    if (!postId || !accion) {
      return NextResponse.json(
        { success: false, error: 'postId y accion son requeridos' },
        { status: 400 }
      )
    }

    if (!['aprobar', 'rechazar'].includes(accion)) {
      return NextResponse.json(
        { success: false, error: 'Acción inválida. Debe ser "aprobar" o "rechazar"' },
        { status: 400 }
      )
    }

    let resultado

    if (accion === 'aprobar') {
      resultado = await aprobarRegla(postId)
    } else {
      resultado = await rechazarRegla(postId)
    }

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error || 'Error procesando la acción' },
        { status: 500 }
      )
    }

    // Actualizar tarea asociada si existe
    if (tareaId) {
      try {
        await actualizarTarea(tareaId, {
          estado: 'completada',
          fecha_completada: new Date().toISOString()
        })

        // Registrar en historial
        await registrarCambioTarea({
          id_tarea: tareaId,
          campo_modificado: 'estado',
          valor_anterior: 'pendiente',
          valor_nuevo: 'completada',
          modificado_por: auth.usuario.id,
          nombre_modificador: `${auth.usuario.nombre} (dashboard) - ${accion === 'aprobar' ? 'aprobada' : 'rechazada'}`
        })
      } catch (tareaError) {
        console.error('Error actualizando tarea:', tareaError)
        // No fallar la respuesta, la regla ya se procesó
      }
    }

    return NextResponse.json({
      success: true,
      accion: accion,
      mensaje: accion === 'aprobar'
        ? 'Regla aprobada. La publicación ahora se usará para respuestas automáticas.'
        : 'Regla rechazada. La publicación no se usará para respuestas automáticas.',
      data: resultado.data
    })

  } catch (error) {
    console.error('Error en POST /api/reglas/aprobar:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
