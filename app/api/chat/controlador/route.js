import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { createAgentManager } from '@/services/agentManager'
import { obtenerFechaActual } from '@/lib/openai'
import { obtenerColaboradores, obtenerConocimientoAprobado } from '@/lib/supabase'

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

    // Obtener colaboradores y conocimiento aprobado de la marca
    const idMarca = contexto?.idMarca || auth.usuario?.id_marca
    const [colaboradoresResult, conocimientoResult] = await Promise.all([
      obtenerColaboradores(idMarca),
      obtenerConocimientoAprobado(idMarca)
    ])
    const colaboradores = colaboradoresResult.success ? colaboradoresResult.data : []
    const conocimientoAprobado = conocimientoResult.success ? conocimientoResult.data : []

    // Agregar fecha, colaboradores y conocimiento al contexto
    const context = {
      ...contexto,
      fechaInfo: obtenerFechaActual(),
      colaboradores,
      conocimientoAprobado
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
