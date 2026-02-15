import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { actualizarAgente, obtenerAgente } from '@/lib/agentes'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const { estado } = await request.json()

    if (!['activo', 'pausado'].includes(estado)) {
      return NextResponse.json({ error: 'Estado debe ser "activo" o "pausado"' }, { status: 400 })
    }

    // Si se activa, verificar que tenga instrucciones
    if (estado === 'activo') {
      const agente = await obtenerAgente(id)
      if (!agente.success || !agente.data) {
        return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
      }
      if (!agente.data.instrucciones || agente.data.instrucciones.trim() === '') {
        return NextResponse.json({ error: 'El agente debe tener instrucciones antes de activarse' }, { status: 400 })
      }
    }

    const resultado = await actualizarAgente(id, { estado })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, agente: resultado.data })
  } catch (error) {
    console.error('Error POST /api/agentes/:id/activar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
