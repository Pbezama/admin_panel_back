import { NextResponse } from 'next/server'
import { asociarMarcaAUsuario } from '@/lib/supabase'

/**
 * POST /api/onboarding/associate-marca
 * Asocia el ID de marca encontrado en base_cuentas al usuario
 * Se llama después de que el polling detecta que la marca fue conectada
 *
 * Body:
 * {
 *   user_id: number,
 *   id_marca: string,
 *   nombre_marca: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   error?: string
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { user_id, id_marca, nombre_marca } = body

    // Validar parámetros requeridos
    if (!user_id || !id_marca) {
      return NextResponse.json(
        { success: false, error: 'user_id e id_marca son requeridos' },
        { status: 400 }
      )
    }

    const resultado = await asociarMarcaAUsuario(user_id, id_marca, nombre_marca)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Marca asociada exitosamente'
    })

  } catch (error) {
    console.error('Error en POST /api/onboarding/associate-marca:', error)
    return NextResponse.json(
      { success: false, error: 'Error al asociar marca' },
      { status: 500 }
    )
  }
}
