import { NextResponse } from 'next/server'
import { procesarMensajeWhatsApp } from '@/services/whatsappHandler'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'crecetec_whatsapp_verify_2025'

/**
 * GET - Verificacion del webhook (requerido por Meta)
 * Meta envia: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log('📥 Webhook verification request:', { mode, token: token?.substring(0, 10) + '...' })

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully')
      return new Response(challenge, { status: 200 })
    }

    console.log('❌ Webhook verification failed')
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })

  } catch (error) {
    console.error('Error en verificacion webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Recibir mensajes entrantes de WhatsApp
 */
export async function POST(request) {
  try {
    const body = await request.json()

    console.log('📩 Webhook WhatsApp recibido:', JSON.stringify(body, null, 2))

    // Estructura del webhook de WhatsApp Business API
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    // Verificar que es un mensaje (no status update)
    if (value?.messages && value.messages.length > 0) {
      const mensaje = value.messages[0]
      const telefono = mensaje.from // Numero del remitente (ej: 56991709265)
      const tipo = mensaje.type // text, image, audio, etc.

      // Solo procesamos mensajes de texto por ahora
      if (tipo === 'text') {
        const texto = mensaje.text?.body || ''

        console.log(`📱 Mensaje de ${telefono}: "${texto}"`)

        // Procesar mensaje en background (no bloquear webhook)
        procesarMensajeWhatsApp(telefono, texto).catch(err => {
          console.error('Error procesando mensaje:', err)
        })
      } else if (tipo === 'interactive') {
        // Respuesta a botones/lista
        const interactiveType = mensaje.interactive?.type
        let respuesta = ''

        if (interactiveType === 'button_reply') {
          respuesta = mensaje.interactive.button_reply?.id
        } else if (interactiveType === 'list_reply') {
          respuesta = mensaje.interactive.list_reply?.id
        }

        console.log(`📱 Respuesta interactiva de ${telefono}: "${respuesta}"`)

        procesarMensajeWhatsApp(telefono, respuesta).catch(err => {
          console.error('Error procesando respuesta interactiva:', err)
        })
      }
    }

    // Status updates (delivered, read, etc.)
    if (value?.statuses) {
      const status = value.statuses[0]
      console.log(`📊 Status update: ${status.status} para ${status.recipient_id}`)
    }

    // Meta requiere respuesta 200 rapida
    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('Error en webhook POST:', error)
    // Aun asi responder 200 para que Meta no reintente
    return NextResponse.json({ success: false, error: error.message }, { status: 200 })
  }
}
