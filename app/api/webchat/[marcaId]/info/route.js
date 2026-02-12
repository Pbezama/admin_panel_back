/**
 * API: /api/webchat/:marcaId/info
 * GET - Obtener info publica de la marca para el web chat (sin auth)
 */

import { NextResponse } from 'next/server'
import { obtenerConfigWebChat } from '@/lib/supabase'

export async function GET(request, { params }) {
  try {
    const { marcaId } = await params

    if (!marcaId) {
      return NextResponse.json({ error: 'marcaId requerido' }, { status: 400 })
    }

    const resultado = await obtenerConfigWebChat(marcaId)

    if (!resultado.success || !resultado.data) {
      return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      marca: resultado.data
    })
  } catch (error) {
    console.error('Error GET /api/webchat/:marcaId/info:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
