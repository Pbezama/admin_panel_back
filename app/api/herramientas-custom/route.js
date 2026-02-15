import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { getHerramientasCustom, crearHerramientaCustom } from '@/lib/agentes'

export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const resultado = await getHerramientasCustom(idMarca)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, herramientas: resultado.data })
  } catch (error) {
    console.error('Error GET /api/herramientas-custom:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca

    if (!body.nombre || !body.descripcion || !body.endpoint_url) {
      return NextResponse.json({ error: 'Nombre, descripción y endpoint URL son requeridos' }, { status: 400 })
    }

    const resultado = await crearHerramientaCustom({
      ...body,
      id_marca: idMarca
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, herramienta: resultado.data }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/herramientas-custom:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
