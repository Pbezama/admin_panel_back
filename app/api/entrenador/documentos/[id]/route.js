import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { eliminarDocumentoMarca } from '@/lib/supabase'

/**
 * DELETE /api/entrenador/documentos/[id]
 * Elimina un documento y su archivo de Storage
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID de documento requerido' },
        { status: 400 }
      )
    }

    const result = await eliminarDocumentoMarca(parseInt(id))

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error en DELETE documento entrenador:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
