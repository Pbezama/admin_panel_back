/**
 * API: /api/chat/creador-flujos
 * POST - Chat con IA para crear flujos conversacionales
 *
 * La IA hace preguntas para entender los requisitos y luego
 * genera el flujo completo (nodos + edges).
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { createAgentManager } from '@/services/agentManager'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ tipo: 'error', contenido: 'No autorizado' }, { status: 401 })
    }

    const { mensaje, historial, contextoFlujo } = await request.json()

    if (!mensaje || !mensaje.trim()) {
      return NextResponse.json({ tipo: 'error', contenido: 'Mensaje requerido' }, { status: 400 })
    }

    // Contar preguntas ya realizadas en el historial
    const preguntasRealizadas = (historial || [])
      .filter(m => m.rol === 'assistant' && m.tipo === 'pregunta_ia')
      .length

    // Contar veces que se ha generado flujo (para saber si estamos en modo iteracion)
    const vecesGenerado = (historial || [])
      .filter(m => m.rol === 'assistant' && m.tipo === 'flujo_generado')
      .length

    const context = {
      nombreMarca: contextoFlujo?.nombreMarca || auth.usuario?.nombre_marca || 'Marca',
      nombreUsuario: auth.usuario?.nombre || 'Usuario',
      flujoNombre: contextoFlujo?.nombre || '',
      flujoTriggerTipo: contextoFlujo?.trigger_tipo || 'keyword',
      flujoTriggerModo: contextoFlujo?.trigger_modo || 'contiene',
      flujoTriggerValor: contextoFlujo?.trigger_valor || '',
      flujoCanales: contextoFlujo?.canales || [],
      flujoActual: contextoFlujo?.flujoActual || null,
      preguntasRealizadas,
      vecesGenerado
    }

    const agentManager = createAgentManager()
    agentManager.setAgent('creador-flujos')

    const respuesta = await agentManager.processMessage(
      mensaje,
      context,
      historial || []
    )

    return NextResponse.json(respuesta)

  } catch (error) {
    console.error('[CREADOR-FLUJOS] Error:', error)
    return NextResponse.json(
      { tipo: 'error', contenido: 'Error al procesar: ' + error.message },
      { status: 500 }
    )
  }
}
