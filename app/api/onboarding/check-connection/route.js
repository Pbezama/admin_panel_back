import { NextResponse } from 'next/server'
import { buscarMarcaPorNombre } from '@/lib/supabase'

/**
 * GET /api/onboarding/check-connection
 * Verifica si existe una conexión en base_cuentas por nombre de marca
 * Usado para polling durante el onboarding mientras el usuario conecta Facebook en PythonAnywhere
 *
 * Query params:
 * - nombre_marca: Nombre de la marca a buscar
 *
 * Response:
 * {
 *   exists: boolean,
 *   id_marca: string | null,
 *   nombre: string | null (nombre encontrado en base_cuentas)
 * }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const nombreMarca = searchParams.get('nombre_marca')

    if (!nombreMarca) {
      return NextResponse.json(
        { exists: false, id_marca: null, error: 'nombre_marca es requerido' },
        { status: 400 }
      )
    }

    const resultado = await buscarMarcaPorNombre(nombreMarca)

    return NextResponse.json({
      exists: resultado.exists,
      id_marca: resultado.id_marca || null,
      nombre: resultado.nombre || null
    })

  } catch (error) {
    console.error('Error en GET /api/onboarding/check-connection:', error)
    return NextResponse.json(
      { exists: false, id_marca: null, error: 'Error al verificar conexión' },
      { status: 500 }
    )
  }
}
