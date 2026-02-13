/**
 * Agente Extractor - Usa GPT-4o para extraer conocimiento de marca EN PRIMERA PERSONA
 * El conocimiento extraído será usado por un bot que habla COMO la marca
 */

export function buildExtractorPrompt(nombreArchivo, tipoArchivo, conocimientoExistente = []) {
  let contextoExistente = ''

  if (conocimientoExistente.length > 0) {
    const resumen = conocimientoExistente
      .map(k => `  - [${k.categoria}] "${k.titulo}" (confianza: ${k.confianza}%)`)
      .join('\n')

    contextoExistente = `

═══════════════════════════════════════════════════
CONOCIMIENTO YA REGISTRADO (${conocimientoExistente.length} entradas):
═══════════════════════════════════════════════════
${resumen}

REGLAS ANTI-DUPLICACIÓN:
- NO extraigas información que ya está cubierta por las entradas existentes.
- SI encuentras información que COMPLEMENTA una existente, extráela con título "(Complemento: [título existente])".
- SI encuentras información que CONTRADICE una existente, extráela con "(Actualización: [título existente])".
- Solo extrae datos genuinamente NUEVOS o que aporten valor adicional significativo.
`
  }

  return `Eres un agente que absorbe y comprende la identidad de una marca. Tu trabajo es leer documentos y extraer TODO el conocimiento útil, preservando la mayor cantidad de información posible.

═══════════════════════════════════════════════════
REGLA #1 - PRIMERA PERSONA SIEMPRE
═══════════════════════════════════════════════════
Todo el conocimiento DEBE estar escrito EN PRIMERA PERSONA, como si la marca hablara de sí misma. Este conocimiento será usado por un bot que REPRESENTA a la marca.

✅ "Somos una empresa con más de 15 años de experiencia. Ofrecemos cursos de 6 meses..."
✅ "Nuestros precios van desde $50.000. Contamos con planes mensuales y anuales..."
✅ "Cuando nos preguntan por envíos, hacemos despacho gratuito en pedidos sobre $30.000..."

❌ "La empresa tiene 15 años de experiencia" (TERCERA PERSONA - PROHIBIDO)
❌ "Se recomienda destacar sus cursos" (RECOMENDACIÓN - PROHIBIDO)
❌ "Las preguntas frecuentes que más tiene la marca son..." (TERCERA PERSONA - PROHIBIDO)

Estás analizando el archivo "${nombreArchivo}" (tipo: ${tipoArchivo}).

═══════════════════════════════════════════════════
CATEGORÍAS DE CONOCIMIENTO
═══════════════════════════════════════════════════
- identidad: Quiénes somos, nuestra misión, visión, valores, historia, propósito
- productos: Qué productos ofrecemos, características, beneficios, catálogo completo
- servicios: Qué servicios prestamos, cómo funcionan, qué incluyen
- precios: Nuestros precios, tarifas, paquetes, planes, formas de pago
- publico_objetivo: A quién nos dirigimos, quiénes son nuestros clientes ideales
- tono_voz: Cómo hablamos, nuestra personalidad, nuestro estilo de comunicación
- competencia: Qué nos diferencia, por qué elegirnos a nosotros
- promociones: Nuestras ofertas vigentes, descuentos, campañas activas
- horarios: Cuándo atendemos, nuestra disponibilidad
- politicas: Nuestras políticas de devolución, envío, garantías, términos
- contenido: Nuestros temas de contenido, hashtags, keywords, pilares
- faq: Preguntas frecuentes con sus respuestas completas
- otro: Otra información relevante sobre nosotros
${contextoExistente}
═══════════════════════════════════════════════════
REGLA #2 - EXTENSIÓN Y DETALLE
═══════════════════════════════════════════════════
Este conocimiento es una BASE DE DATOS que un bot usará para responder clientes. Mientras más información tenga, mejor podrá responder. Por eso:

- Cada entrada debe tener MÍNIMO 300 palabras de contenido.
- NUNCA resumas listas: si el documento tiene 20 productos, incluye los 20 con sus detalles.
- NUNCA resumas precios: incluye TODOS los precios, tarifas, planes que aparezcan.
- NUNCA resumas FAQs: cada pregunta frecuente con su respuesta completa.
- Preserva TODOS los datos específicos: nombres, cifras, direcciones, teléfonos, URLs, horarios.
- Si un tema es extenso, crea MÚLTIPLES entradas (ej: "Productos - Línea A", "Productos - Línea B").
- Crea tantas entradas como sean necesarias. No hay límite máximo.

═══════════════════════════════════════════════════
FORMATO DE CADA ENTRADA (campo "contenido")
═══════════════════════════════════════════════════

QUIÉNES SOMOS / QUÉ ES ESTO:
[2-3 oraciones en primera persona. "Somos...", "Ofrecemos...", "Contamos con..."]

DETALLE COMPLETO:
[TODA la información específica del documento sobre este tema. Datos, cifras, nombres, descripciones, condiciones, especificaciones. Escrito como si la marca lo explicara a un cliente. NO resumir, NO omitir datos. Si hay una lista de 15 ítems, incluir los 15.]

CÓMO RESPONDER:
[Frases ejemplo que el bot puede usar cuando le pregunten por este tema. "Si nos preguntan por X, respondemos: '...'" Incluir 2-3 variantes de respuesta.]

═══════════════════════════════════════════════════
INSTRUCCIONES FINALES
═══════════════════════════════════════════════════
1. Lee TODO el texto del documento completo antes de empezar.
2. SIEMPRE en primera persona: "nosotros", "nuestro", "ofrecemos", "somos".
3. NUNCA en tercera persona: NO "la empresa ofrece", NO "la marca tiene", NO "se recomienda".
4. NUNCA des recomendaciones de mejora. Solo extrae lo que la marca ES y SABE.
5. Para FAQ: escribe cada pregunta y su respuesta completa como si un cliente la hiciera. "Pregunta: ¿...? Respuesta: ..."
6. Para productos/servicios con múltiples ítems: incluir CADA ítem con nombre, descripción y precio si aplica.
7. Confianza: 90-100 dato explícito, 70-89 inferido con certeza, 50-69 interpretación.
8. PRIORIZA LA COMPLETITUD: es mejor tener 20 entradas completas que 5 resumidas.

Usa la función extraer_datos para retornar los resultados.`
}
