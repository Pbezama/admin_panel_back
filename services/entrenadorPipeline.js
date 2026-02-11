import { openai } from '@/lib/openai'
import { extraerTexto } from '@/services/fileExtractor'
import { buildExtractorPrompt } from '@/agents/extractor/prompt'
import { extractorTools } from '@/agents/extractor/tools'
import { buildAnalizadorPrompt } from '@/agents/analizador/prompt'
import { analizadorTools } from '@/agents/analizador/tools'
import {
  actualizarEstadoDocumento,
  guardarConocimientoBatch,
  obtenerDocumentosMarca,
  obtenerConocimientoMarca,
  guardarReglaPropuesta
} from '@/lib/supabase'

/**
 * Procesa un archivo individual: extrae texto + agente extractor
 * @param {Buffer} buffer - Contenido del archivo
 * @param {Object} documento - Registro de documentos_marca
 * @param {string} idMarca - ID de la marca
 * @returns {Promise<{success: boolean, datos_extraidos?: Array}>}
 */
export async function procesarArchivo(buffer, documento, idMarca) {
  try {
    // Paso 1: Marcar como procesando
    await actualizarEstadoDocumento(documento.id, 'procesando')

    // Paso 2: Extraer texto del archivo
    const extraccion = await extraerTexto(buffer, documento.tipo_archivo, documento.nombre_archivo)

    if (!extraccion.success) {
      await actualizarEstadoDocumento(documento.id, 'error', null, extraccion.error)
      return { success: false, error: extraccion.error }
    }

    // Guardar texto extraído
    await actualizarEstadoDocumento(documento.id, 'procesando', extraccion.texto)

    // Paso 3: Agente Extractor (GPT-4o-mini)
    const prompt = buildExtractorPrompt(documento.nombre_archivo, documento.tipo_archivo)

    // Truncar texto si es muy largo (máx ~100K chars para 4o-mini)
    const textoTruncado = extraccion.texto.length > 100000
      ? extraccion.texto.substring(0, 100000) + '\n\n[... texto truncado por longitud ...]'
      : extraccion.texto

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Analiza el siguiente texto extraído del archivo:\n\n${textoTruncado}` }
      ],
      tools: extractorTools,
      tool_choice: 'required',
      temperature: 0.3
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) {
      await actualizarEstadoDocumento(documento.id, 'error', extraccion.texto, 'El agente no retornó datos estructurados')
      return { success: false, error: 'Sin respuesta del agente extractor' }
    }

    const datos = JSON.parse(toolCall.function.arguments)

    // Paso 4: Guardar conocimiento extraído
    if (datos.datos_extraidos?.length > 0) {
      const entradas = datos.datos_extraidos.map(d => ({
        id_marca: idMarca,
        categoria: d.categoria,
        titulo: d.titulo,
        contenido: d.contenido,
        confianza: d.confianza,
        fuente_documento_ids: [documento.id],
        estado: 'pendiente'
      }))

      await guardarConocimientoBatch(entradas)
    }

    // Paso 5: Marcar como procesado
    await actualizarEstadoDocumento(documento.id, 'procesado', extraccion.texto)

    return {
      success: true,
      resumen: datos.resumen,
      datos_extraidos: datos.datos_extraidos || []
    }
  } catch (error) {
    console.error('Error en procesarArchivo:', error)
    await actualizarEstadoDocumento(documento.id, 'error', null, error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Ejecuta el Agente Analizador con TODO el conocimiento de la marca
 * Genera mapa de conocimiento unificado + reglas BDM propuestas
 * @param {string} idMarca - ID de la marca
 * @param {string} nombreMarca - Nombre de la marca
 * @returns {Promise<{success: boolean, conocimiento?: Array, reglas_propuestas?: Array}>}
 */
export async function analizarMarcaCompleta(idMarca, nombreMarca) {
  try {
    // Obtener todo el conocimiento extraído (pendiente + aprobado)
    const conocimientoResult = await obtenerConocimientoMarca(idMarca)
    if (!conocimientoResult.success || !conocimientoResult.data?.length) {
      return { success: false, error: 'No hay conocimiento extraído para analizar. Sube documentos primero.' }
    }

    // Obtener documentos procesados para contexto
    const docsResult = await obtenerDocumentosMarca(idMarca)
    const docsResumen = (docsResult.data || [])
      .filter(d => d.estado === 'procesado')
      .map(d => `- ${d.nombre_archivo} (${d.tipo_archivo})`)
      .join('\n')

    // Formatear conocimiento existente
    const conocimientoTexto = conocimientoResult.data
      .map(k => `[${k.categoria}] ${k.titulo}: ${k.contenido} (confianza: ${k.confianza}%)`)
      .join('\n\n')

    // Agente Analizador (GPT-4o)
    const prompt = buildAnalizadorPrompt(nombreMarca)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Documentos procesados de la marca "${nombreMarca}":\n${docsResumen}\n\nConocimiento extraído de todos los documentos:\n\n${conocimientoTexto}\n\nGenera el mapa de conocimiento unificado y las reglas BDM propuestas.`
        }
      ],
      tools: analizadorTools,
      tool_choice: 'required',
      temperature: 0.4
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) {
      return { success: false, error: 'El agente analizador no retornó resultados' }
    }

    const resultado = JSON.parse(toolCall.function.arguments)

    // Guardar conocimiento unificado (reemplaza pendientes anteriores)
    if (resultado.conocimiento?.length > 0) {
      const entradas = resultado.conocimiento.map(k => ({
        id_marca: idMarca,
        categoria: k.categoria,
        titulo: k.titulo,
        contenido: k.contenido,
        confianza: k.confianza,
        fuente_documento_ids: [],
        estado: 'pendiente'
      }))

      await guardarConocimientoBatch(entradas)
    }

    // Guardar reglas propuestas en base_cuentas
    if (resultado.reglas_propuestas?.length > 0) {
      for (const regla of resultado.reglas_propuestas) {
        await guardarReglaPropuesta({
          id_marca: idMarca,
          nombre_marca: nombreMarca,
          categoria: regla.categoria,
          clave: regla.clave,
          valor: regla.valor,
          prioridad: regla.prioridad
        })
      }
    }

    return {
      success: true,
      conocimiento: resultado.conocimiento || [],
      reglas_propuestas: resultado.reglas_propuestas || []
    }
  } catch (error) {
    console.error('Error en analizarMarcaCompleta:', error)
    return { success: false, error: error.message }
  }
}
