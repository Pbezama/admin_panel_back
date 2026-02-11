import { NextResponse } from 'next/server'
import { enviarMensajeConBotones, enviarMensaje } from '@/lib/whatsapp'
import { guardarAprobacionPendiente } from '@/lib/supabase'

/**
 * POST /api/whatsapp/send-approval
 * Envía solicitud de aprobación vía WhatsApp
 * Llamado desde basedepy.py cuando detecta una nueva publicación
 *
 * Body:
 * {
 *   telefono: string,        // Número del admin de la marca
 *   mensaje: string,         // Mensaje descriptivo
 *   botones?: Array<{id, title}>, // Botones opcionales
 *   metadata: {
 *     tipo: 'aprobacion_regla',
 *     tarea_id: number,
 *     post_id: string
 *   }
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { telefono, mensaje, botones, metadata } = body

    if (!telefono || !mensaje) {
      return NextResponse.json(
        { success: false, error: 'Teléfono y mensaje son requeridos' },
        { status: 400 }
      )
    }

    // Guardar contexto de aprobación para cuando el usuario responda
    if (metadata?.tarea_id) {
      await guardarAprobacionPendiente({
        telefono: telefono,
        tarea_id: metadata.tarea_id,
        post_id: metadata.post_id,
        tipo: metadata.tipo || 'aprobacion_regla'
      })
    }

    let resultado

    // Si hay botones, enviar mensaje interactivo
    if (botones && botones.length > 0) {
      resultado = await enviarMensajeConBotones(telefono, mensaje, botones)
    } else {
      // Mensaje de texto simple
      resultado = await enviarMensaje(telefono, mensaje)
    }

    if (resultado.success) {
      console.log(`[APPROVAL] WhatsApp enviado a ${telefono}`)
      return NextResponse.json({
        success: true,
        data: resultado.data,
        message: 'Solicitud de aprobación enviada'
      })
    } else {
      console.error(`[APPROVAL] Error enviando a ${telefono}:`, resultado.error)
      return NextResponse.json(
        { success: false, error: resultado.error },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Error en send-approval:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
