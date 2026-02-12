/**
 * API: /api/conversaciones-flujo
 * GET - Listar conversaciones de flujo de la marca
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerConversacionesFlujo } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado')

    const resultado = await obtenerConversacionesFlujo(idMarca, estado)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversaciones: resultado.data })
  } catch (error) {
    console.error('Error GET /api/conversaciones-flujo:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
