/**
 * API: /api/webchat/config-admin/regenerar-key
 * POST - Regenerar API key del webchat (autenticado)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { regenerarWebChatKey } from '@/lib/supabase'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await regenerarWebChatKey(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: resultado.data })
  } catch (error) {
    console.error('Error POST /api/webchat/config-admin/regenerar-key:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
