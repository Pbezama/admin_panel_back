import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerReglasPendientes } from '@/lib/supabase'

/**
 * GET /api/reglas/pendientes
 * Obtiene las publicaciones pendientes de aprobación para la marca del usuario
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

    // Solo admins pueden ver reglas pendientes
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para ver publicaciones pendientes' },
        { status: 403 }
      )
    }

    const resultado = await obtenerReglasPendientes(auth.usuario.id_marca)

    return NextResponse.json({
      success: true,
      data: resultado.data || []
    })

  } catch (error) {
    console.error('Error en GET /api/reglas/pendientes:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
