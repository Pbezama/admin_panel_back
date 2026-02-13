import { openai } from '@/lib/openai'

/**
 * Extrae texto de un archivo según su tipo MIME
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<{success: boolean, texto?: string, error?: string}>}
 */
export async function extraerTexto(buffer, mimeType, fileName) {
  try {
    const tipo = mimeType.toLowerCase()

    // PDF
    if (tipo === 'application/pdf') {
      return await extraerPDF(buffer)
    }

    // Word DOCX
    if (tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        tipo === 'application/msword') {
      return await extraerDOCX(buffer)
    }

    // Excel / CSV
    if (tipo === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        tipo === 'application/vnd.ms-excel' ||
        tipo === 'text/csv') {
      return await extraerExcel(buffer, fileName)
    }

    // PowerPoint
    if (tipo === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        tipo === 'application/vnd.ms-powerpoint') {
      return await extraerPPTX(buffer)
    }

    // Texto plano
    if (tipo.startsWith('text/')) {
      return { success: true, texto: buffer.toString('utf-8') }
    }

    // Imágenes - OCR con Vision API
    if (tipo.startsWith('image/')) {
      return await extraerImagen(buffer, mimeType)
    }

    // Audio - Whisper
    if (tipo.startsWith('audio/') || tipo === 'video/webm') {
      return await extraerAudio(buffer, mimeType, fileName)
    }

    // Video - intentar extraer audio
    if (tipo.startsWith('video/')) {
      return await extraerAudio(buffer, mimeType, fileName)
    }

    // JSON
    if (tipo === 'application/json') {
      const json = JSON.parse(buffer.toString('utf-8'))
      return { success: true, texto: JSON.stringify(json, null, 2) }
    }

    return { success: false, error: `Tipo de archivo no soportado: ${mimeType}` }
  } catch (error) {
    console.error('Error en extraerTexto:', error)
    return { success: false, error: error.message }
  }
}

async function extraerPDF(buffer) {
  try {
    // pdf-parse v1: importar desde lib/ para evitar bug del test file
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const data = await pdfParse(buffer)
    const texto = data.text?.trim()
    if (!texto) {
      return { success: false, error: 'PDF sin texto extraíble' }
    }
    return { success: true, texto }
  } catch (error) {
    return { success: false, error: `Error al leer PDF: ${error.message}` }
  }
}

async function extraerDOCX(buffer) {
  try {
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.extractRawText({ buffer })
    const texto = result.value?.trim()
    if (!texto) {
      return { success: false, error: 'Documento Word vacío' }
    }
    return { success: true, texto }
  } catch (error) {
    return { success: false, error: `Error al leer DOCX: ${error.message}` }
  }
}

async function extraerExcel(buffer, fileName) {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const textos = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (jsonData.length > 0) {
        textos.push(`=== Hoja: ${sheetName} ===`)
        const headers = jsonData[0]
        textos.push(`Columnas: ${headers.join(' | ')}`)
        textos.push('')

        for (let i = 1; i < Math.min(jsonData.length, 500); i++) {
          const row = jsonData[i]
          if (row.some(cell => cell !== undefined && cell !== '')) {
            const rowText = headers.map((h, idx) => `${h}: ${row[idx] ?? ''}`).join(', ')
            textos.push(rowText)
          }
        }

        if (jsonData.length > 500) {
          textos.push(`... y ${jsonData.length - 500} filas más`)
        }
        textos.push('')
      }
    }

    const texto = textos.join('\n').trim()
    if (!texto) {
      return { success: false, error: 'Archivo Excel vacío' }
    }
    return { success: true, texto }
  } catch (error) {
    return { success: false, error: `Error al leer Excel: ${error.message}` }
  }
}

async function extraerPPTX(buffer) {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    if (workbook.SheetNames.length > 0) {
      return await extraerExcel(buffer)
    }
    // Fallback: tratar como binario e intentar extraer strings legibles
    const texto = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\táéíóúñÁÉÍÓÚÑ¿¡üÜ]/g, ' ').replace(/\s+/g, ' ').trim()
    if (texto.length > 50) {
      return { success: true, texto: texto.substring(0, 50000) }
    }
    return { success: false, error: 'No se pudo extraer texto de la presentación' }
  } catch (error) {
    return { success: false, error: `Error al leer PPT: ${error.message}` }
  }
}

async function extraerImagen(buffer, mimeType) {
  try {
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extrae TODO el texto visible en esta imagen. Si es un menú, catálogo, documento, cartel o cualquier material con información, transcribe todo el contenido de forma estructurada. Si no hay texto, describe detalladamente lo que ves. Responde solo con el contenido extraído, sin comentarios adicionales.'
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' }
            }
          ]
        }
      ],
      max_tokens: 4000
    })

    const texto = response.choices[0]?.message?.content?.trim()
    if (!texto) {
      return { success: false, error: 'No se pudo extraer texto de la imagen' }
    }
    return { success: true, texto }
  } catch (error) {
    return { success: false, error: `Error OCR: ${error.message}` }
  }
}

async function extraerAudio(buffer, mimeType, fileName) {
  try {
    const ext = fileName.split('.').pop() || 'mp3'
    const file = new File([buffer], `audio.${ext}`, { type: mimeType })

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'es'
    })

    const texto = transcription.text?.trim()
    if (!texto) {
      return { success: false, error: 'No se pudo transcribir el audio' }
    }
    return { success: true, texto }
  } catch (error) {
    return { success: false, error: `Error transcripción: ${error.message}` }
  }
}
