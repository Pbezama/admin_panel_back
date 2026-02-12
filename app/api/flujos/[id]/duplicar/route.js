/**
 * API: /api/flujos/:id/duplicar
 * POST - Duplicar un flujo existente
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerFlujo, crearFlujo } from '@/lib/supabase'

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    // Obtener flujo original
    const original = await obtenerFlujo(id)
    if (!original.success || !original.data) {
      return NextResponse.json({ error: 'Flujo no encontrado' }, { status: 404 })
    }

    const flujoOriginal = original.data

    // Crear copia
    const resultado = await crearFlujo({
      id_marca: idMarca,
      nombre: `${flujoOriginal.nombre} (copia)`,
      descripcion: flujoOriginal.descripcion,
      trigger_tipo: flujoOriginal.trigger_tipo,
      trigger_valor: flujoOriginal.trigger_valor,
      canales: flujoOriginal.canales,
      estado: 'borrador',
      nodos: flujoOriginal.nodos,
      edges: flujoOriginal.edges,
      variables_schema: flujoOriginal.variables_schema,
      template_origen_id: flujoOriginal.es_template ? flujoOriginal.id : flujoOriginal.template_origen_id,
      creado_por: auth.usuario.id
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, flujo: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/flujos/:id/duplicar:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
