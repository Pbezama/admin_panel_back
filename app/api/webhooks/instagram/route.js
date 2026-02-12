/**
 * API: /api/webhooks/instagram
 * GET  - Verificacion del webhook con Meta
 * POST - Procesar mensajes entrantes de Instagram DM
 *
 * Instagram DMs llegan via el webhook de la Page (entry[].messaging[])
 */

import { NextResponse } from 'next/server'
import { procesarMensajeConFlujo } from '@/services/flowRouter'
import { obtenerCuentaFacebookPorPageId } from '@/lib/supabase'

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || 'crecetec_instagram_verify_2025'

// Cache simple para deduplicacion de mensajes (evitar procesar el mismo mensaje 2 veces)
const mensajesProcesados = new Map()
const CACHE_TTL = 60000 // 1 minuto

function limpiarCache() {
  const ahora = Date.now()
  for (const [key, timestamp] of mensajesProcesados.entries()) {
    if (ahora - timestamp > CACHE_TTL) {
      mensajesProcesados.delete(key)
    }
  }
}

/**
 * GET - Verificacion del webhook
 */
export async function GET(request) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook Instagram verificado')
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verificacion fallida' }, { status: 403 })
}

/**
 * POST - Procesar mensaje entrante de Instagram DM
 */
export async function POST(request) {
  try {
    const body = await request.json()

    // Instagram messaging events llegan en entry[].messaging[]
    const entries = body.entry || []

    for (const entry of entries) {
      const messaging = entry.messaging || []

      for (const event of messaging) {
        // Solo procesar mensajes (no delivery, read, etc.)
        if (!event.message) continue

        const senderId = event.sender?.id
        const recipientId = event.recipient?.id // Este es el page_id
        const messageId = event.message?.mid
        const texto = event.message?.text || event.message?.quick_reply?.payload || ''

        if (!senderId || !recipientId || !texto) continue

        // Deduplicacion
        limpiarCache()
        if (mensajesProcesados.has(messageId)) continue
        mensajesProcesados.set(messageId, Date.now())

        // Ignorar mensajes propios (echo)
        if (event.message?.is_echo) continue

        // Buscar la marca asociada a este page_id
        const cuentaResult = await obtenerCuentaFacebookPorPageId(recipientId)

        if (!cuentaResult.success || !cuentaResult.data) {
          console.log(`Instagram webhook: No se encontro marca para page_id ${recipientId}`)
          continue
        }

        const cuenta = cuentaResult.data
        const idMarca = cuenta.cuentas_instagram?.id_marca || null
        const pageAccessToken = cuenta.access_token || ''

        if (!idMarca) {
          console.log(`Instagram webhook: No hay id_marca para page_id ${recipientId}`)
          continue
        }

        console.log(`📸 Instagram DM de ${senderId} para marca ${idMarca}: "${texto.substring(0, 50)}"`)

        // Procesar con el flow router
        procesarMensajeConFlujo({
          canal: 'instagram',
          identificador: senderId,
          mensaje: texto,
          idMarca,
          extra: { pageAccessToken }
        }).catch(err => {
          console.error('Error procesando mensaje Instagram:', err)
        })
      }
    }

    // Siempre responder 200 para que Meta no reintente
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Error POST /api/webhooks/instagram:', error)
    return NextResponse.json({ status: 'ok' })
  }
}
