import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { desconectarCuentaFacebook } from '@/lib/supabase'

/**
 * DELETE /api/facebook/disconnect
 * Desconecta una cuenta de Facebook/Instagram
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Body:
 * - page_id: ID de la página de Facebook a desconectar
 * - marca_id: (opcional) ID de la marca
 */
export async function DELETE(request) {
  try {
    // Verificar autenticación
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const usuario = auth.usuario

    // Parsear body
    const body = await request.json()
    const { page_id: pageId, marca_id: marcaIdParam } = body

    if (!pageId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere page_id' },
        { status: 400 }
      )
    }

    // Determinar marca_id
    const marcaId = marcaIdParam ? parseInt(marcaIdParam) : usuario.id_marca

    // Verificar que el usuario tiene acceso a esta marca
    if (!usuario.es_super_admin && usuario.id_marca !== marcaId) {
      return NextResponse.json(
        { success: false, error: 'No tienes acceso a esta marca' },
        { status: 403 }
      )
    }

    // Desconectar cuenta
    const resultado = await desconectarCuentaFacebook(marcaId, pageId)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Cuenta desconectada exitosamente'
    })

  } catch (error) {
    console.error('Error en DELETE /api/facebook/disconnect:', error)
    return NextResponse.json(
      { success: false, error: 'Error al desconectar cuenta' },
      { status: 500 }
    )
  }
}
