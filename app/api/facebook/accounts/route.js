import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerCuentasFacebook } from '@/lib/supabase'

/**
 * GET /api/facebook/accounts
 * Obtiene las cuentas de Facebook/Instagram conectadas para el usuario
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Query params (opcional):
 * - marca_id: ID de la marca (si no se envía, usa la del usuario)
 */
export async function GET(request) {
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

    // Obtener marca_id de query params o del usuario
    const { searchParams } = new URL(request.url)
    const marcaIdParam = searchParams.get('marca_id')
    const marcaId = marcaIdParam ? parseInt(marcaIdParam) : usuario.id_marca

    // Verificar que el usuario tiene acceso a esta marca
    // Super admin puede ver cualquier marca, otros solo la suya
    if (!usuario.es_super_admin && usuario.id_marca !== marcaId) {
      return NextResponse.json(
        { success: false, error: 'No tienes acceso a esta marca' },
        { status: 403 }
      )
    }

    // Obtener cuentas conectadas
    const resultado = await obtenerCuentasFacebook(marcaId)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      accounts: resultado.data,
      total: resultado.data.length
    })

  } catch (error) {
    console.error('Error en GET /api/facebook/accounts:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener cuentas conectadas' },
      { status: 500 }
    )
  }
}
