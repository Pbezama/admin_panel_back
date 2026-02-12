/**
 * API: /api/dashboard-live/conversaciones
 * GET - Listar conversaciones transferidas para el dashboard live
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionesTransferidas } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await obtenerConversacionesTransferidas(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversaciones: resultado.data })
  } catch (error) {
    console.error('Error GET /api/dashboard-live/conversaciones:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
