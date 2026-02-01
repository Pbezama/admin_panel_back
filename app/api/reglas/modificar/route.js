import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { modificarYAprobarRegla, obtenerPublicacionPorId } from '@/lib/supabase'

/**
 * PUT /api/reglas/modificar
 * Modifica campos de una publicación y la aprueba automáticamente
 *
 * Body:
 * {
 *   id: number,           // ID del registro en base_cuentas
 *   campos: {             // Campos a actualizar (todos opcionales)
 *     clave?: string,
 *     valor?: string,
 *     prioridad?: number,
 *     fecha_inicio?: string,
 *     fecha_caducidad?: string
 *   }
 * }
 */
export async function PUT(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden modificar reglas
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para modificar publicaciones' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, campos } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'El ID de la publicación es requerido' },
        { status: 400 }
      )
    }

    if (!campos || typeof campos !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Debe proporcionar los campos a modificar' },
        { status: 400 }
      )
    }

    // Verificar que la publicación existe y pertenece a la marca del usuario
    const publicacion = await obtenerPublicacionPorId(id)
    if (!publicacion.success || !publicacion.data) {
      return NextResponse.json(
        { success: false, error: 'Publicación no encontrada' },
        { status: 404 }
      )
    }

    // Verificar que pertenece a la marca del usuario
    if (publicacion.data['ID marca'] != auth.usuario.id_marca) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para modificar esta publicación' },
        { status: 403 }
      )
    }

    // Verificar que está pendiente
    if (publicacion.data.estado_aprobacion !== 'pendiente') {
      return NextResponse.json(
        { success: false, error: 'Esta publicación ya fue procesada' },
        { status: 400 }
      )
    }

    // Modificar y aprobar
    const resultado = await modificarYAprobarRegla(id, campos)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error || 'Error al modificar la publicación' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      mensaje: 'Publicación modificada y aprobada exitosamente',
      data: resultado.data
    })

  } catch (error) {
    console.error('Error en PUT /api/reglas/modificar:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
