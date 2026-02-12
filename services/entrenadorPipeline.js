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
  guardarReglaPropuesta,
  eliminarConocimientoPendiente,
  eliminarReglasPropuestas
} from '@/lib/supabase'

/**
 * Procesa un archivo individual: extrae texto + agente extractor (GPT-4o)
 * Incluye conocimiento existente como contexto para evitar duplicados
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

    // Paso 3: Obtener conocimiento existente para contexto anti-duplicados
    let conocimientoExistente = []
    try {
      const existente = await obtenerConocimientoMarca(idMarca)
      if (existente.success && existente.data?.length > 0) {
        conocimientoExistente = existente.data.map(k => ({
          categoria: k.categoria,
          titulo: k.titulo,
          confianza: k.confianza
        }))
      }
    } catch (e) {
      console.warn('[Entrenador] No se pudo obtener conocimiento existente:', e.message)
    }

    // Paso 4: Agente Extractor (GPT-4o)
    const prompt = buildExtractorPrompt(documento.nombre_archivo, documento.tipo_archivo, conocimientoExistente)

    // Truncar texto si es muy largo (máx ~100K chars)
    const textoTruncado = extraccion.texto.length > 100000
      ? extraccion.texto.substring(0, 100000) + '\n\n[... texto truncado por longitud ...]'
      : extraccion.texto

    console.log(`[Entrenador] Extrayendo con GPT-4o | Doc: ${documento.nombre_archivo} | ${textoTruncado.length} chars | ${conocimientoExistente.length} entradas existentes`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    // Paso 5: Guardar conocimiento extraído
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

      console.log(`[Entrenador] Guardando ${entradas.length} entradas de conocimiento (nuevas/complementarias)`)
      await guardarConocimientoBatch(entradas)
    } else {
      console.log(`[Entrenador] Documento "${documento.nombre_archivo}" no aportó conocimiento nuevo`)
    }

    // Paso 6: Marcar como procesado
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
 * 1. Limpia conocimiento pendiente anterior y reglas [IA] no aprobadas
 * 2. Regenera mapa unificado desde documentos + conocimiento aprobado
 * 3. Genera reglas BDM nuevas
 */
export async function analizarMarcaCompleta(idMarca, nombreMarca) {
  try {
    // Paso 1: Limpiar pendientes anteriores para evitar acumulación de duplicados
    console.log(`[Entrenador] Limpiando conocimiento pendiente y reglas [IA] de marca ${idMarca}...`)
    await eliminarConocimientoPendiente(idMarca)
    await eliminarReglasPropuestas(idMarca)

    // Paso 2: Obtener documentos procesados (texto crudo)
    const docsResult = await obtenerDocumentosMarca(idMarca)
    const docsProcesados = (docsResult.data || []).filter(d => d.estado === 'procesado')

    if (docsProcesados.length === 0) {
      return { success: false, error: 'No hay documentos procesados para analizar. Sube documentos primero.' }
    }

    // Paso 3: Obtener conocimiento APROBADO (para no duplicar)
    const aprobadoResult = await obtenerConocimientoMarca(idMarca, 'aprobado')
    const conocimientoAprobado = aprobadoResult.success ? aprobadoResult.data || [] : []

    // También incluir editados
    const editadoResult = await obtenerConocimientoMarca(idMarca, 'editado')
    const conocimientoEditado = editadoResult.success ? editadoResult.data || [] : []

    const todoAprobado = [...conocimientoAprobado, ...conocimientoEditado]

    // Paso 4: Compilar texto de documentos + conocimiento para el análisis
    const docsResumen = docsProcesados
      .map(d => `- ${d.nombre_archivo} (${d.tipo_archivo})`)
      .join('\n')

    // Usar texto extraído de los documentos como fuente primaria
    const textosDocumentos = docsProcesados
      .filter(d => d.texto_extraido)
      .map(d => {
        const texto = d.texto_extraido.length > 30000
          ? d.texto_extraido.substring(0, 30000) + '\n[... truncado ...]'
          : d.texto_extraido
        return `══ DOCUMENTO: ${d.nombre_archivo} ══\n${texto}`
      })
      .join('\n\n')

    // Paso 5: Agente Analizador (GPT-4o)
    const prompt = buildAnalizadorPrompt(nombreMarca, todoAprobado)

    const mensajeUsuario = `Marca: "${nombreMarca}"

Documentos procesados (${docsProcesados.length}):
${docsResumen}

═══════════════════════════════════════════════════
CONTENIDO DE LOS DOCUMENTOS
═══════════════════════════════════════════════════
${textosDocumentos}

═══════════════════════════════════════════════════
INSTRUCCIÓN FINAL
═══════════════════════════════════════════════════
Genera el mapa de conocimiento UNIFICADO (sin duplicados, extenso y didáctico) y las reglas BDM propuestas (concisas y accionables).
Recuerda: cada entrada de conocimiento debe tener RESUMEN + DETALLE + RECOMENDACIÓN ESTRATÉGICA (mínimo 200 palabras).
Las reglas BDM deben ser directas e instruccionales (1-3 oraciones).`

    console.log(`[Entrenador] Analizando marca "${nombreMarca}" | ${docsProcesados.length} docs | ${todoAprobado.length} conocimientos aprobados | Texto: ${mensajeUsuario.length} chars`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: mensajeUsuario }
      ],
      tools: analizadorTools,
      tool_choice: 'required',
      temperature: 0.4,
      max_tokens: 16000
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) {
      return { success: false, error: 'El agente analizador no retornó resultados' }
    }

    const resultado = JSON.parse(toolCall.function.arguments)

    // Paso 6: Guardar conocimiento unificado
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

      console.log(`[Entrenador] Guardando ${entradas.length} entradas de conocimiento unificado`)
      await guardarConocimientoBatch(entradas)
    }

    // Paso 7: Guardar reglas propuestas en base_cuentas
    if (resultado.reglas_propuestas?.length > 0) {
      console.log(`[Entrenador] Guardando ${resultado.reglas_propuestas.length} reglas BDM propuestas`)
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
