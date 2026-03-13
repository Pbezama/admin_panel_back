/**
 * API: /api/google/status
 * GET - Estado de todas las conexiones Google de la marca (unificado)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    // Conexiones nuevas (google_conexiones)
    const { data: conexiones } = await supabase
      .from('google_conexiones')
      .select('id, nombre_cuenta, email_google, estado, scopes, creado_en')
      .eq('id_marca', idMarca)
      .order('creado_en', { ascending: false })

    // Calendar viejo (compatibilidad)
    let calendarLegacy = null
    try {
      const { data } = await supabase
        .from('google_calendar_tokens')
        .select('id, email_calendar, calendar_id')
        .eq('id_marca', idMarca)
        .limit(1)
      calendarLegacy = data?.[0] || null
    } catch (e) {
      // Tabla puede no existir
    }

    // Conteos
    const { count: totalArchivos } = await supabase
      .from('google_archivos')
      .select('id', { count: 'exact', head: true })
      .eq('id_marca', idMarca)

    const { count: totalFuentes } = await supabase
      .from('google_fuentes_datos')
      .select('id', { count: 'exact', head: true })
      .eq('id_marca', idMarca)

    return NextResponse.json({
      success: true,
      conexiones: conexiones || [],
      total_conexiones: (conexiones || []).length,
      conexiones_activas: (conexiones || []).filter(c => c.estado === 'activa').length,
      total_archivos: totalArchivos || 0,
      total_fuentes: totalFuentes || 0,
      // Compatibilidad Calendar
      calendar_legacy: calendarLegacy ? {
        connected: true,
        email: calendarLegacy.email_calendar,
        calendar_id: calendarLegacy.calendar_id
      } : { connected: false }
    })
  } catch (error) {
    console.error('Error GET /api/google/status:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
