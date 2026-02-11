import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerDocumentosMarca } from '@/lib/supabase'

/**
 * GET /api/entrenador/documentos
 * Lista todos los documentos de la marca
 * Query params: ?estado=pendiente|procesando|procesado|error
 */
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

    const result = await obtenerDocumentosMarca(auth.usuario.id_marca, estado)

    return NextResponse.json({
      success: true,
      documentos: result.data || []
    })
  } catch (error) {
    console.error('Error en GET documentos entrenador:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
