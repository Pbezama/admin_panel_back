import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { subirArchivoEntrenador, guardarDocumentoMarca } from '@/lib/supabase'
import { procesarArchivo } from '@/services/entrenadorPipeline'

/**
 * POST /api/entrenador/upload
 * Sube uno o múltiples archivos para entrenar la marca
 * Recibe FormData con campo "archivos"
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

    const formData = await request.formData()
    const archivos = formData.getAll('archivos')

    if (!archivos || archivos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se recibieron archivos' },
        { status: 400 }
      )
    }

    const resultados = []

    for (const archivo of archivos) {
      try {
        const buffer = Buffer.from(await archivo.arrayBuffer())
        const nombre = archivo.name
        const tipo = archivo.type || 'application/octet-stream'
        const tamano = buffer.length

        // Subir a Supabase Storage
        const uploadResult = await subirArchivoEntrenador(buffer, nombre, idMarca)
        if (!uploadResult.success) {
          resultados.push({ nombre, success: false, error: uploadResult.error })
          continue
        }

        // Crear registro en BD
        const docResult = await guardarDocumentoMarca({
          id_marca: idMarca,
          nombre_archivo: nombre,
          tipo_archivo: tipo,
          tamano,
          url_archivo: uploadResult.url
        })

        if (!docResult.success) {
          resultados.push({ nombre, success: false, error: docResult.error })
          continue
        }

        // Procesar asíncronamente (no esperamos)
        procesarArchivo(buffer, docResult.data, idMarca)
          .catch(err => console.error(`Error procesando ${nombre}:`, err))

        resultados.push({
          nombre,
          success: true,
          id: docResult.data.id,
          estado: 'procesando'
        })
      } catch (err) {
        resultados.push({ nombre: archivo.name, success: false, error: err.message })
      }
    }

    return NextResponse.json({
      success: true,
      documentos: resultados
    })
  } catch (error) {
    console.error('Error en upload entrenador:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
