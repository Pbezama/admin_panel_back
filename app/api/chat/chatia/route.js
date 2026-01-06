import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { createAgentManager } from '@/services/agentManager'
import { obtenerFechaActual } from '@/lib/openai'

export async function POST(request) {
  try {
    // Verificar autenticación
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { mensaje, historial, contextoMarca } = await request.json()

    if (!mensaje) {
      return NextResponse.json(
        { success: false, error: 'Mensaje es requerido' },
        { status: 400 }
      )
    }

    // Crear manager para esta request
    const agentManager = createAgentManager()
    agentManager.setAgent('chatia')

    // Construir contexto
    const context = {
      nombreMarca: contextoMarca?.nombreMarca || 'Marca',
      nombreUsuario: auth.usuario.nombre || 'Usuario',
      datosMarca: contextoMarca?.datosMarca || [],
      fechaInfo: obtenerFechaActual()
    }

    // Procesar mensaje
    const respuesta = await agentManager.processMessage(
      mensaje,
      context,
      historial || []
    )

    return NextResponse.json(respuesta)

  } catch (error) {
    console.error('Error en /api/chat/chatia:', error)
    return NextResponse.json(
      { tipo: 'error', contenido: error.message },
      { status: 500 }
    )
  }
}
