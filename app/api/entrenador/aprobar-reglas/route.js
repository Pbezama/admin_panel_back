import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { aprobarReglasPropuestas, rechazarReglasPropuestas, editarReglaPropuesta } from '@/lib/supabase'

/**
 * POST /api/entrenador/aprobar-reglas
 * Aprueba o rechaza reglas BDM propuestas por la IA
 *
 * Lote:     { ids: [1,2,3], accion: 'aprobar' | 'rechazar' }
 * Individual: { id: 1, accion: 'aprobar', edicion: { categoria, clave, valor, prioridad } }
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
      const editResult = await editarReglaPropuesta(id, edicion)
      if (!editResult.success) {
        return NextResponse.json(
          { success: false, error: editResult.error },
          { status: 400 }
        )
      }

      if (accion === 'aprobar') {
        await aprobarReglasPropuestas([id])
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

    let result
    if (accion === 'aprobar') {
      result = await aprobarReglasPropuestas(idsToUpdate)
    } else {
      result = await rechazarReglasPropuestas(idsToUpdate)
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      actualizados: idsToUpdate.length,
      accion
    })
  } catch (error) {
    console.error('Error en aprobar-reglas entrenador:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
