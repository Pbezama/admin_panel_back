import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  console.warn('OpenAI API key not configured')
}

// Cliente OpenAI server-side (sin dangerouslyAllowBrowser)
export const openai = new OpenAI({
  apiKey: apiKey || ''
})

// Modelo por defecto
export const DEFAULT_MODEL = 'gpt-4o'

// Obtener fecha actual formateada
export function obtenerFechaActual() {
  const ahora = new Date()

  const opciones = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City'
  }

  return {
    fecha: ahora.toLocaleDateString('es-MX', opciones),
    hora: ahora.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Mexico_City'
    }),
    iso: ahora.toISOString(),
    año: ahora.getFullYear(),
    mes: ahora.getMonth() + 1,
    dia: ahora.getDate(),
    ultimoDiaMes: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate()
  }
}

// Transcribir audio con Whisper
export async function transcribirAudio(audioBuffer) {
  try {
    // Crear un archivo desde el buffer
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' })

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'es'
    })

    return { success: true, text: transcription.text }
  } catch (error) {
    console.error('Error en transcribirAudio:', error)
    return { success: false, error: error.message }
  }
}
