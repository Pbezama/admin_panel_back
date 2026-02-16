/**
 * API: /api/marcas/dm-continuo
 * GET  - Obtener el modo de DM continuo de la marca
 * PUT  - Cambiar el modo de DM continuo
 *
 * dm_continuo: "1" = Responde continuamente | "2" = Solo comentario y primer DM
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
    if (!idMarca) {
      return NextResponse.json({ error: 'No se pudo determinar la marca' }, { status: 400 })
    }

    // Buscar en cuentas_instagram por instagram_id (que es el id_marca)
    const { data, error } = await supabase
      .from('cuentas_instagram')
      .select('dm_continuo, instagram_name')
      .eq('instagram_id', idMarca.toString())
      .single()

    if (error) {
      // Si no encuentra, devolver valor por defecto
      return NextResponse.json({ success: true, dm_continuo: '2', instagram_name: null })
    }

    return NextResponse.json({
      success: true,
      dm_continuo: data.dm_continuo || '2',
      instagram_name: data.instagram_name
    })
  } catch (error) {
    console.error('Error GET /api/marcas/dm-continuo:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Solo admin o super admin
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json({ error: 'Solo administradores pueden cambiar esta configuración' }, { status: 403 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    if (!idMarca) {
      return NextResponse.json({ error: 'No se pudo determinar la marca' }, { status: 400 })
    }

    const body = await request.json()
    const modo = body.dm_continuo

    if (!['1', '2'].includes(modo)) {
      return NextResponse.json({ error: 'Valor inválido. Debe ser "1" o "2"' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cuentas_instagram')
      .update({ dm_continuo: modo, fecha_actualizacion: new Date().toISOString() })
      .eq('instagram_id', idMarca.toString())
      .select('dm_continuo, instagram_name')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      dm_continuo: data.dm_continuo,
      instagram_name: data.instagram_name
    })
  } catch (error) {
    console.error('Error PUT /api/marcas/dm-continuo:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
