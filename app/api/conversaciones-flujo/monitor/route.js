/**
 * API: /api/conversaciones-flujo/monitor
 * GET - Listar conversaciones de flujo con filtros para el monitor
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionesMonitor } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { searchParams } = new URL(request.url)

    const filtros = {}
    if (searchParams.get('flujo_id')) filtros.flujo_id = searchParams.get('flujo_id')
    if (searchParams.get('canal')) filtros.canal = searchParams.get('canal')
    if (searchParams.get('estado')) filtros.estado = searchParams.get('estado')
    if (searchParams.get('desde')) filtros.desde = searchParams.get('desde')
    if (searchParams.get('hasta')) filtros.hasta = searchParams.get('hasta')
    if (searchParams.get('limite')) filtros.limite = parseInt(searchParams.get('limite'))

    const resultado = await obtenerConversacionesMonitor(idMarca, filtros)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversaciones: resultado.data })
  } catch (error) {
    console.error('Error GET /api/conversaciones-flujo/monitor:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
