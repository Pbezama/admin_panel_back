import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { actualizarEstadoConocimiento, editarConocimiento } from '@/lib/supabase'

/**
 * POST /api/entrenador/aprobar
 * Aprueba o rechaza conocimiento (individual o en lote)
 *
 * Lote:     { ids: [1,2,3], accion: 'aprobar' | 'rechazar' }
 * Individual: { id: 1, accion: 'aprobar', edicion: { titulo, contenido, categoria, confianza } }
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

    const body = await request.json()
    const { ids, id, accion, edicion } = body

    if (!accion || !['aprobar', 'rechazar'].includes(accion)) {
      return NextResponse.json(
        { success: false, error: 'Acción debe ser "aprobar" o "rechazar"' },
        { status: 400 }
      )
    }

    // Individual con edición
    if (id && edicion) {
      const editResult = await editarConocimiento(id, edicion)
      if (!editResult.success) {
        return NextResponse.json(
          { success: false, error: editResult.error },
          { status: 400 }
        )
      }

      if (accion === 'aprobar') {
        const estado = 'aprobado'
        await actualizarEstadoConocimiento([id], estado)
      }

      return NextResponse.json({ success: true, editado: true })
    }

    // Lote o individual sin edición
    const idsToUpdate = ids || (id ? [id] : [])
    if (idsToUpdate.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere "ids" o "id"' },
        { status: 400 }
      )
    }

    const estado = accion === 'aprobar' ? 'aprobado' : 'rechazado'
    const result = await actualizarEstadoConocimiento(idsToUpdate, estado)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      actualizados: idsToUpdate.length,
      estado
    })
  } catch (error) {
    console.error('Error en aprobar conocimiento:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
