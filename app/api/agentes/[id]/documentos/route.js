import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { getDocumentosAgente, crearDocumentoAgente, addConocimientoAgente } from '@/lib/agentes'

export async function GET(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const resultado = await getDocumentosAgente(id)

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, documentos: resultado.data })
  } catch (error) {
    console.error('Error GET /api/agentes/:id/documentos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const formData = await request.formData()
    const archivo = formData.get('archivo')

    if (!archivo) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    // Leer contenido del archivo
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const texto = buffer.toString('utf-8')

    // Crear registro del documento
    const resultado = await crearDocumentoAgente({
      id_agente: parseInt(id),
      nombre: archivo.name,
      tipo: archivo.type || 'text/plain',
      contenido_extraido: texto
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    // Fragmentar el texto en chunks y crear conocimiento
    const fragmentos = fragmentarTexto(texto, archivo.name)
    let fragmentosCreados = 0

    for (const frag of fragmentos) {
      const res = await addConocimientoAgente(parseInt(id), {
        titulo: frag.titulo,
        contenido: frag.contenido,
        categoria: 'documento'
      })
      if (res.success) fragmentosCreados++
    }

    return NextResponse.json({
      success: true,
      documento: resultado.data,
      fragmentos_creados: fragmentosCreados
    }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/agentes/:id/documentos:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

function fragmentarTexto(texto, nombreArchivo) {
  const fragmentos = []
  const lineas = texto.split('\n')
  let fragmentoActual = ''
  let tituloActual = nombreArchivo

  for (const linea of lineas) {
    fragmentoActual += linea + '\n'

    // Fragmentar cada ~1500 caracteres o en saltos de sección
    if (fragmentoActual.length > 1500 || linea.match(/^#{1,3}\s/)) {
      if (fragmentoActual.trim()) {
        fragmentos.push({
          titulo: tituloActual,
          contenido: fragmentoActual.trim()
        })
      }
      fragmentoActual = ''
      if (linea.match(/^#{1,3}\s/)) {
        tituloActual = linea.replace(/^#{1,3}\s/, '').trim() || nombreArchivo
      }
    }
  }

  if (fragmentoActual.trim()) {
    fragmentos.push({
      titulo: tituloActual,
      contenido: fragmentoActual.trim()
    })
  }

  return fragmentos.length > 0 ? fragmentos : [{ titulo: nombreArchivo, contenido: texto.trim() }]
}
