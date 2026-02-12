/**
 * API: /api/dashboard-live/conversaciones/:id/responder
 * POST - Ejecutivo responde a una conversacion transferida
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionFlujoConMensajes, guardarMensajeFlujo, actualizarConversacionFlujo } from '@/lib/supabase'
import { crearWhatsAppAdapter } from '@/services/channels/whatsappAdapter'

/**
 * Crear adapter segun el canal de la conversacion
 */
function crearAdapterParaRespuesta(canal, identificador) {
  switch (canal) {
    case 'whatsapp':
      return crearWhatsAppAdapter(identificador)
    case 'instagram': {
      // Se importa dinamicamente para evitar error si no existe aun
      try {
        const { crearInstagramAdapter } = require('@/services/channels/instagramAdapter')
        // Para Instagram necesitamos el pageAccessToken, que viene de cuentas_facebook
        // Por ahora usamos el adapter basico
        return crearInstagramAdapter(identificador, '')
      } catch {
        return null
      }
    }
    default:
      return null
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
    const { mensaje } = body

    if (!mensaje || !mensaje.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Obtener conversacion
    const convResult = await obtenerConversacionFlujoConMensajes(id)
    if (!convResult.success || !convResult.data) {
      return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
    }

    const conversacion = convResult.data

    // Verificar que esta transferida
    if (conversacion.estado !== 'transferida') {
      return NextResponse.json({ error: 'La conversacion no esta transferida' }, { status: 400 })
    }

    // Enviar mensaje al usuario via el canal original
    const adapter = crearAdapterParaRespuesta(conversacion.canal, conversacion.identificador_usuario)

    if (adapter && conversacion.canal !== 'web') {
      await adapter.enviarTexto(mensaje)
    }

    // Guardar mensaje en BD
    await guardarMensajeFlujo({
      conversacion_id: parseInt(id),
      direccion: 'saliente',
      contenido: mensaje,
      tipo_nodo: 'ejecutivo_humano',
      nodo_id: 'dashboard_live',
      metadata: { ejecutivo_id: auth.usuario.id, ejecutivo_nombre: auth.usuario.nombre }
    })

    // Asignar ejecutivo si no lo tiene
    if (!conversacion.ejecutivo_asignado_id) {
      await actualizarConversacionFlujo(id, { ejecutivo_asignado_id: auth.usuario.id })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error POST /api/dashboard-live/conversaciones/:id/responder:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
