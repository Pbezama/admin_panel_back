import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { createAgentManager } from '@/services/agentManager'
import { obtenerFechaActual } from '@/lib/openai'
import { obtenerColaboradores } from '@/lib/supabase'

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

    const { mensaje, contexto } = await request.json()

    if (!mensaje) {
      return NextResponse.json(
        { success: false, error: 'Mensaje es requerido' },
        { status: 400 }
      )
    }

    // Crear manager para esta request
    const agentManager = createAgentManager()
    agentManager.setAgent('controlador')

    // Obtener colaboradores de la marca para asignación de tareas
    const idMarca = contexto?.idMarca || auth.usuario?.id_marca
    const colaboradoresResult = await obtenerColaboradores(idMarca)
    const colaboradores = colaboradoresResult.success ? colaboradoresResult.data : []

    // Agregar fecha y colaboradores al contexto
    const context = {
      ...contexto,
      fechaInfo: obtenerFechaActual(),
      colaboradores
    }

    // Procesar mensaje
    const respuesta = await agentManager.processMessage(
      mensaje,
      context,
      contexto?.historial || []
    )

    return NextResponse.json(respuesta)

  } catch (error) {
    console.error('Error en /api/chat/controlador:', error)
    return NextResponse.json(
      { tipo: 'error', contenido: error.message },
      { status: 500 }
    )
  }
}
