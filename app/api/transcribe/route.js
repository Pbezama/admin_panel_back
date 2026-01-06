import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { transcribirAudio } from '@/lib/openai'

export async function POST(request) {
  try {
    // Verificar autenticación
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: 'Archivo de audio requerido' },
        { status: 400 }
      )
    }

    // Convertir a buffer
    const buffer = await audioFile.arrayBuffer()

    // Transcribir
    const resultado = await transcribirAudio(buffer)

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/transcribe:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
