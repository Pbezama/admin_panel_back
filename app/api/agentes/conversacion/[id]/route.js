import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { getMensajesConversacionAgente, cerrarConversacionAgente } from '@/lib/agentes'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await getMensajesConversacionAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, mensajes: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes/conversacion/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const { accion } = await request.json()

    if (accion === 'cerrar') {
      const resultado = await cerrarConversacionAgente(id)

      if (!resultado.success) {
        return NextResponse.json({ error: resultado.error }, { status: 500 })
      }

      return NextResponse.json({ success: true, conversacion: resultado.data })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (error) {
    console.error('Error POST /api/agentes/conversacion/:id:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
