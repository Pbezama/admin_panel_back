import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { guardarDocumentoMarca } from '@/lib/supabase'
import { procesarArchivo } from '@/services/entrenadorPipeline'
import { scrapeSitioWeb } from '@/services/webScraper'

/**
 * POST /api/entrenador/scrape-web
 * Scrapea un sitio web completo y lo procesa con el pipeline del Entrenador
 * Body: { url: string, max_paginas?: number }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const idMarca = auth.usuario.id_marca
    const body = await request.json()
    const { url, max_paginas = 10 } = body

    // Validar URL
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL es requerida' },
        { status: 400 }
      )
    }

    let urlValidada
    try {
      urlValidada = new URL(url)
      if (!['http:', 'https:'].includes(urlValidada.protocol)) {
        throw new Error('Protocolo invalido')
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'URL invalida. Debe comenzar con http:// o https://' },
        { status: 400 }
      )
    }

    // Validar max_paginas
    const maxPaginas = Math.min(Math.max(parseInt(max_paginas) || 10, 1), 20)

    console.log(`[Entrenador] Scraping web: ${url} (max: ${maxPaginas} paginas) para marca ${idMarca}`)

    // 1. Scrapear el sitio web
    const paginas = await scrapeSitioWeb(url, maxPaginas)

    if (paginas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se pudo extraer contenido del sitio web. Verifica que la URL sea accesible.' },
        { status: 400 }
      )
    }

    // 2. Concatenar todo el contenido en un solo texto
    const textoCompleto = paginas.map(p =>
      `══════════════════════════════════════\n` +
      `PAGINA: ${p.titulo}\n` +
      `URL: ${p.url}\n` +
      `══════════════════════════════════════\n\n` +
      p.contenido
    ).join('\n\n\n')

    console.log(`[Entrenador] Scraping completado: ${paginas.length} paginas, ${textoCompleto.length} caracteres totales`)

    // 3. Crear registro de documento en BD
    const nombreDoc = `Web: ${urlValidada.hostname}`
    const docResult = await guardarDocumentoMarca({
      id_marca: idMarca,
      nombre_archivo: nombreDoc,
      tipo_archivo: 'text/html',
      tamano: Buffer.byteLength(textoCompleto, 'utf8'),
      url_archivo: url
    })

    if (!docResult.success) {
      return NextResponse.json(
        { success: false, error: 'Error guardando documento: ' + docResult.error },
        { status: 500 }
      )
    }

    // 4. Procesar con el pipeline del Entrenador (asincrono, igual que upload)
    const buffer = Buffer.from(textoCompleto, 'utf8')
    procesarArchivo(buffer, docResult.data, idMarca)
      .catch(err => console.error(`[Entrenador] Error procesando scraping de ${url}:`, err))

    return NextResponse.json({
      success: true,
      paginas_procesadas: paginas.length,
      documento_id: docResult.data.id,
      caracteres: textoCompleto.length,
      paginas: paginas.map(p => ({ url: p.url, titulo: p.titulo }))
    })
  } catch (error) {
    console.error('[Entrenador] Error en scrape-web:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
