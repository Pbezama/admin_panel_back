import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { asociarMarcaAUsuario, buscarMarcaPorNombre } from '@/lib/supabase'

/**
 * POST /api/onboarding/complete
 * Marca el onboarding como completado
 * Recibe el id_marca y nombre_marca del polling (después de conectar en PythonAnywhere)
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Body (opcional - si no se proporciona, busca automáticamente por nombre_marca del usuario):
 * {
 *   id_marca?: string,
 *   nombre_marca?: string
 * }
 *
 * Response:
 * {
 *   success: true/false,
 *   error?: string
 * }
 */
export async function POST(request) {
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

    // Intentar obtener id_marca del body
    let idMarca = null
    let nombreMarca = null

    try {
      const body = await request.json()
      idMarca = body.id_marca
      nombreMarca = body.nombre_marca
    } catch {
      // Body vacío o inválido, buscar automáticamente
    }

    // Si no se proporcionó id_marca, buscar por nombre_marca del usuario
    if (!idMarca) {
      const busqueda = await buscarMarcaPorNombre(usuario.nombre_marca)
      if (!busqueda.exists) {
        return NextResponse.json(
          {
            success: false,
            error: 'No se encontró una conexión de Facebook para esta marca. Por favor conecta tu cuenta primero.',
            requiere_conexion: true
          },
          { status: 400 }
        )
      }
      idMarca = busqueda.id_marca
      nombreMarca = busqueda.nombre
    }

    // Asociar marca al usuario y marcar onboarding como completado
    const resultado = await asociarMarcaAUsuario(usuario.id, idMarca, nombreMarca || usuario.nombre_marca)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Onboarding completado exitosamente',
      id_marca: idMarca,
      nombre_marca: nombreMarca
    })

  } catch (error) {
    console.error('Error en POST /api/onboarding/complete:', error)
    return NextResponse.json(
      { success: false, error: 'Error al completar onboarding' },
      { status: 500 }
    )
  }
}
