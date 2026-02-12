/**
 * API: /api/flujos-templates
 * GET - Listar templates de flujos disponibles
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerFlujosTemplate } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resultado = await obtenerFlujosTemplate()

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, templates: resultado.data })
  } catch (error) {
    console.error('Error GET /api/flujos-templates:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
