/**
 * API: /api/dashboard-live/conversaciones/:id/cerrar
 * POST - Cerrar una conversacion transferida
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionFlujoConMensajes, finalizarConversacion, guardarMensajeFlujo } from '@/lib/supabase'
import { crearWhatsAppAdapter } from '@/services/channels/whatsappAdapter'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { mensaje_despedida } = body

    // Obtener conversacion
    const convResult = await obtenerConversacionFlujoConMensajes(id)
    if (!convResult.success || !convResult.data) {
      return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
    }

    const conversacion = convResult.data

    // Enviar mensaje de despedida si se proporciona
    if (mensaje_despedida && conversacion.canal !== 'web') {
      let adapter = null
      if (conversacion.canal === 'whatsapp') {
        adapter = crearWhatsAppAdapter(conversacion.identificador_usuario)
      }
      if (adapter) {
        await adapter.enviarTexto(mensaje_despedida)
        await guardarMensajeFlujo({
          conversacion_id: parseInt(id),
          direccion: 'saliente',
          contenido: mensaje_despedida,
          tipo_nodo: 'ejecutivo_humano',
          nodo_id: 'cierre_dashboard',
          metadata: { ejecutivo_id: auth.usuario.id }
        })
      }
    }

    // Cerrar conversacion
    await finalizarConversacion(id, 'completada')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error POST /api/dashboard-live/conversaciones/:id/cerrar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
