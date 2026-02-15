/**
 * API: /api/dashboard-live/conversaciones/:id/responder
 * POST - Ejecutivo responde a una conversacion transferida
 * Soporta texto y audio (base64)
 *
 * Envia mensajes al cliente via Python (gateway unico de mensajes)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionFlujoConMensajes, guardarMensajeFlujo, actualizarConversacionFlujo, subirArchivoChatLive } from '@/lib/supabase'

const PYTHON_API_URL = process.env.PYTHONANYWHERE_OAUTH_URL || 'https://mrkt21-pbezama.pythonanywhere.com'
const LIVE_CHAT_API_KEY = process.env.LIVE_CHAT_API_KEY || ''

/**
 * Enviar mensaje de texto al cliente via Python API
 */
async function enviarViaPython(canal, identificador, mensaje, idMarca, conversacionId) {
  if (!LIVE_CHAT_API_KEY) {
    console.error('[LIVE] LIVE_CHAT_API_KEY no configurada')
    return { success: false, error: 'API key no configurada' }
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/api/live-chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LIVE_CHAT_API_KEY
      },
      body: JSON.stringify({
        canal,
        identificador,
        mensaje,
        id_marca: idMarca,
        conversacion_id: conversacionId
      })
    })

    const data = await response.json()
    return data
  } catch (error) {
    console.error('[LIVE] Error llamando Python API:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar media al cliente via Python API
 */
async function enviarMediaViaPython(canal, identificador, mediaUrl, mediaType, filename, idMarca, conversacionId) {
  if (!LIVE_CHAT_API_KEY) {
    return { success: false, error: 'API key no configurada' }
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/api/live-chat/send-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LIVE_CHAT_API_KEY
      },
      body: JSON.stringify({
        canal,
        identificador,
        media_url: mediaUrl,
        media_type: mediaType,
        filename,
        id_marca: idMarca,
        conversacion_id: conversacionId
      })
    })

    const data = await response.json()
    return data
  } catch (error) {
    console.error('[LIVE] Error llamando Python send-media:', error.message)
    return { success: false, error: error.message }
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { mensaje, audio } = body

    if (!mensaje || !mensaje.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Obtener conversacion
    const convResult = await obtenerConversacionFlujoConMensajes(id)
    if (!convResult.success || !convResult.data) {
      console.error('[LIVE] Conversacion no encontrada:', id)
      return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
    }

    const conversacion = convResult.data

    // Verificar que esta transferida
    if (conversacion.estado !== 'transferida') {
      console.error('[LIVE] Conversacion no esta transferida:', id, conversacion.estado)
      return NextResponse.json({ error: 'La conversacion no esta transferida' }, { status: 400 })
    }

    const metadata = {
      ejecutivo_id: auth.usuario.id,
      ejecutivo_nombre: auth.usuario.nombre
    }

    // Enviar al cliente via Python
    if (conversacion.canal !== 'web') {
      if (audio) {
        // Audio: convertir base64 a buffer, subir a Storage, enviar como media
        try {
          const base64Data = audio.replace(/^data:audio\/\w+;base64,/, '')
          const audioBuffer = Buffer.from(base64Data, 'base64')
          const audioFilename = `audio_${Date.now()}.webm`

          const uploadResult = await subirArchivoChatLive(audioBuffer, {
            name: audioFilename,
            type: 'audio/webm',
            size: audioBuffer.length
          }, conversacion.id_marca)

          if (uploadResult.success) {
            metadata.url_media = uploadResult.data.url
            metadata.tipo_media = 'audio'
            metadata.nombre_archivo = audioFilename

            const envioResult = await enviarMediaViaPython(
              conversacion.canal,
              conversacion.identificador_usuario,
              uploadResult.data.url,
              'audio',
              audioFilename,
              conversacion.id_marca,
              parseInt(id)
            )

            if (!envioResult.success) {
              console.error('[LIVE] Error enviando audio via Python:', envioResult.error)
            }
          } else {
            console.error('[LIVE] Error subiendo audio a Storage:', uploadResult.error)
          }
        } catch (audioErr) {
          console.error('[LIVE] Error procesando audio:', audioErr.message)
        }

        // Guardar base64 en metadata para reproduccion en dashboard
        metadata.audio = audio
      } else {
        // Texto normal
        const envioResult = await enviarViaPython(
          conversacion.canal,
          conversacion.identificador_usuario,
          mensaje,
          conversacion.id_marca,
          parseInt(id)
        )

        if (!envioResult.success) {
          console.error('[LIVE] Error enviando via Python:', envioResult.error)
        }
      }
    } else {
      // Web: guardar audio base64 en metadata para reproduccion
      if (audio) {
        metadata.audio = audio
      }
    }

    await guardarMensajeFlujo({
      conversacion_id: parseInt(id),
      direccion: 'saliente',
      contenido: mensaje,
      tipo_nodo: 'ejecutivo_humano',
      nodo_id: 'dashboard_live',
      metadata
    })

    // Asignar ejecutivo si no lo tiene
    if (!conversacion.ejecutivo_asignado_id) {
      await actualizarConversacionFlujo(id, { ejecutivo_asignado_id: auth.usuario.id })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[LIVE] Error POST responder:', error)
    return NextResponse.json({ error: 'Error interno: ' + error.message }, { status: 500 })
  }
}
