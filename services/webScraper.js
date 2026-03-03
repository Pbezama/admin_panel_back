/**
 * Web Scraper - Extrae texto de sitios web completos
 *
 * Crawlea paginas internas de un sitio web usando BFS.
 * Extrae texto limpio (headers, parrafos, listas) para el pipeline del Entrenador.
 *
 * Basado en: comentarios_RRSS/informe_marca.py → scrape_website()
 */

import * as cheerio from 'cheerio'

/**
 * Scrapea un sitio web completo (crawl BFS de paginas internas)
 * @param {string} urlInicial - URL del sitio a scrapear
 * @param {number} maxPaginas - Limite de paginas a visitar (default 10, max 20)
 * @returns {Promise<Array<{url: string, titulo: string, contenido: string}>>}
 */
export async function scrapeSitioWeb(urlInicial, maxPaginas = 10) {
  maxPaginas = Math.min(Math.max(maxPaginas, 1), 20)

  const urlBase = new URL(urlInicial)
  const dominio = urlBase.hostname
  const visitadas = new Set()
  const cola = [urlInicial]
  const resultados = []

  console.log(`[WebScraper] Iniciando crawl de ${urlInicial} (max: ${maxPaginas} paginas)`)

  while (cola.length > 0 && resultados.length < maxPaginas) {
    const url = cola.shift()

    // Normalizar URL (sin fragment, sin trailing slash)
    let urlNormalizada
    try {
      const parsed = new URL(url)
      parsed.hash = ''
      urlNormalizada = parsed.href.replace(/\/$/, '')
    } catch {
      continue
    }

    if (visitadas.has(urlNormalizada)) continue
    visitadas.add(urlNormalizada)

    // Ignorar archivos binarios
    if (/\.(pdf|jpg|jpeg|png|gif|svg|mp4|mp3|zip|css|js|ico|woff|woff2|ttf|eot)$/i.test(urlNormalizada)) {
      continue
    }

    try {
      console.log(`[WebScraper] Scrapeando (${resultados.length + 1}/${maxPaginas}): ${urlNormalizada}`)

      const response = await fetch(urlNormalizada, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CreceTecBot/1.0; +https://crecetec.com)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        console.warn(`[WebScraper] HTTP ${response.status} en ${urlNormalizada}`)
        continue
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html')) {
        continue
      }

      const html = await response.text()
      const $ = cheerio.load(html)

      // Extraer titulo
      const titulo = $('title').text().trim() || $('h1').first().text().trim() || urlNormalizada

      // Extraer meta description
      const metaDesc = $('meta[name="description"]').attr('content') || ''

      // Eliminar elementos no deseados
      $('script, style, nav, footer, aside, iframe, noscript, svg, .cookie-banner, .popup, #cookie-consent').remove()

      // Extraer contenido estructurado
      const secciones = []

      if (metaDesc) {
        secciones.push(`Descripcion: ${metaDesc}`)
      }

      // Headers (h1-h3)
      $('h1, h2, h3').each((_, el) => {
        const texto = $(el).text().trim()
        if (texto && texto.length > 2) {
          const tag = el.tagName.toLowerCase()
          const nivel = tag === 'h1' ? '#' : tag === 'h2' ? '##' : '###'
          secciones.push(`${nivel} ${texto}`)
        }
      })

      // Parrafos
      $('p').each((_, el) => {
        const texto = $(el).text().trim()
        if (texto && texto.length > 20) {
          secciones.push(texto)
        }
      })

      // Listas
      $('ul, ol').each((_, el) => {
        const items = []
        $(el).find('li').each((_, li) => {
          const texto = $(li).text().trim()
          if (texto && texto.length > 5) {
            items.push(`- ${texto}`)
          }
        })
        if (items.length > 0) {
          secciones.push(items.join('\n'))
        }
      })

      const contenido = secciones.join('\n\n')

      if (contenido.length > 50) {
        resultados.push({ url: urlNormalizada, titulo, contenido })
      }

      // Extraer links internos para seguir crawleando
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        try {
          const linkUrl = new URL(href, urlNormalizada)

          // Solo links internos (mismo dominio)
          if (linkUrl.hostname !== dominio) return

          // Sin fragments ni query params de tracking
          linkUrl.hash = ''
          const linkNorm = linkUrl.href.replace(/\/$/, '')

          if (!visitadas.has(linkNorm) && !cola.includes(linkNorm)) {
            cola.push(linkNorm)
          }
        } catch {
          // URL invalida, ignorar
        }
      })

      // Rate limit: 1 segundo entre requests
      if (cola.length > 0 && resultados.length < maxPaginas) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (err) {
      console.warn(`[WebScraper] Error en ${urlNormalizada}: ${err.message}`)
      continue
    }
  }

  console.log(`[WebScraper] Crawl completado: ${resultados.length} paginas extraidas de ${visitadas.size} visitadas`)

  return resultados
}
