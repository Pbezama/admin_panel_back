import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { analizarMarcaCompleta } from '@/services/entrenadorPipeline'

/**
 * POST /api/entrenador/procesar
 * Ejecuta el Agente Analizador con todo el conocimiento extraído
 * Genera mapa de conocimiento unificado + reglas BDM propuestas
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

    const idMarca = auth.usuario.id_marca
    const nombreMarca = auth.usuario.nombre_marca || 'Marca'

    const resultado = await analizarMarcaCompleta(idMarca, nombreMarca)

    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      conocimiento: resultado.conocimiento,
      reglas_propuestas: resultado.reglas_propuestas
    })
  } catch (error) {
    console.error('Error en procesar entrenador:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
