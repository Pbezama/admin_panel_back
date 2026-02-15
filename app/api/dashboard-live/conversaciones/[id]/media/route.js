/**
 * API: /api/dashboard-live/conversaciones/:id/media
 * POST - Ejecutivo envia imagen o documento al cliente
 *
 * Recibe FormData con archivo, sube a Supabase Storage,
 * guarda en mensajes_flujo y envia al cliente via Python.
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionFlujoConMensajes, guardarMensajeFlujo, actualizarConversacionFlujo, subirArchivoChatLive } from '@/lib/supabase'

const PYTHON_API_URL = process.env.PYTHONANYWHERE_OAUTH_URL || 'https://mrkt21-pbezama.pythonanywhere.com'
const LIVE_CHAT_API_KEY = process.env.LIVE_CHAT_API_KEY || ''
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

async function enviarMediaViaPython(canal, identificador, mediaUrl, mediaType, filename, idMarca, conversacionId) {
  if (!LIVE_CHAT_API_KEY) {
    console.error('[LIVE-MEDIA] LIVE_CHAT_API_KEY no configurada')
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
    console.error('[LIVE-MEDIA] Error llamando Python API:', error.message)
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

    // Leer FormData
    const formData = await request.formData()
    const archivo = formData.get('archivo')

    if (!archivo || !(archivo instanceof File)) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    // Validar tamano
    if (archivo.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Archivo muy grande (max 10MB)' }, { status: 400 })
    }

    // Obtener conversacion
    const convResult = await obtenerConversacionFlujoConMensajes(id)
    if (!convResult.success || !convResult.data) {
      return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
    }

    const conversacion = convResult.data

    if (conversacion.estado !== 'transferida') {
      return NextResponse.json({ error: 'La conversacion no esta transferida' }, { status: 400 })
    }

    // Determinar tipo de media
    const esImagen = archivo.type.startsWith('image/')
    const tipoMedia = esImagen ? 'image' : 'document'

    // Subir a Supabase Storage
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const uploadResult = await subirArchivoChatLive(buffer, {
      name: archivo.name,
      type: archivo.type,
      size: archivo.size
    }, conversacion.id_marca)

    if (!uploadResult.success) {
      console.error('[LIVE-MEDIA] Error subiendo archivo:', uploadResult.error)
      return NextResponse.json({ error: 'Error subiendo archivo' }, { status: 500 })
    }

    const mediaUrl = uploadResult.data.url

    // Enviar al cliente via Python
    if (conversacion.canal !== 'web') {
      const envioResult = await enviarMediaViaPython(
        conversacion.canal,
        conversacion.identificador_usuario,
        mediaUrl,
        tipoMedia,
        archivo.name,
        conversacion.id_marca,
        parseInt(id)
      )

      if (!envioResult.success) {
        console.error('[LIVE-MEDIA] Error enviando via Python:', envioResult.error)
      } else {
        console.log('[LIVE-MEDIA] Media enviada exitosamente via Python')
      }
    }

    // Guardar en mensajes_flujo
    const contenido = esImagen ? `📷 Imagen: ${archivo.name}` : `📎 Documento: ${archivo.name}`

    await guardarMensajeFlujo({
      conversacion_id: parseInt(id),
      direccion: 'saliente',
      contenido,
      tipo_nodo: 'ejecutivo_humano',
      nodo_id: 'dashboard_live',
      metadata: {
        ejecutivo_id: auth.usuario.id,
        ejecutivo_nombre: auth.usuario.nombre,
        tipo_media: tipoMedia,
        url_media: mediaUrl,
        nombre_archivo: archivo.name,
        tipo_archivo: archivo.type,
        tamano: archivo.size
      }
    })

    // Asignar ejecutivo si no lo tiene
    if (!conversacion.ejecutivo_asignado_id) {
      await actualizarConversacionFlujo(id, { ejecutivo_asignado_id: auth.usuario.id })
    }

    return NextResponse.json({ success: true, url: mediaUrl })
  } catch (error) {
    console.error('[LIVE-MEDIA] Error POST media:', error)
    return NextResponse.json({ error: 'Error interno: ' + error.message }, { status: 500 })
  }
}
