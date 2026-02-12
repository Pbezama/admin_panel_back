/**
 * Motor de generación de informes RRSS (Instagram Analytics)
 * Replica la lógica de informe_marca.py en Node.js
 *
 * Flujo: Datos cuenta → Graph API → Logs comentarios → GPT-4o → HTML → Supabase
 */

import { supabase } from './supabase.js'
import { openai, DEFAULT_MODEL } from './openai.js'

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0'

// ============================================
// HELPERS
// ============================================

async function apiGet(url, params, label = '') {
  try {
    const searchParams = new URLSearchParams()
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) searchParams.append(key, String(val))
    }
    const fullUrl = url.includes('?') ? url : `${url}?${searchParams.toString()}`
    const resp = await fetch(fullUrl, { signal: AbortSignal.timeout(20000) })
    const data = await resp.json()

    if (data.error) {
      const code = data.error.code || 0
      const msg = (data.error.message || '').substring(0, 100)
      if (code === 4) {
        // Rate limit - wait and retry
        console.log(`   Rate limit en ${label}, esperando 60s...`)
        await new Promise(r => setTimeout(r, 60000))
        const resp2 = await fetch(fullUrl, { signal: AbortSignal.timeout(20000) })
        const data2 = await resp2.json()
        if (data2.error) {
          console.error(`   ${label}: ${msg}`)
          return null
        }
        return data2
      }
      console.error(`   ${label} (${code}): ${msg}`)
      return null
    }
    return data
  } catch (e) {
    console.error(`   ${label}: ${e.message}`)
    return null
  }
}

// ============================================
// OBTENER DATOS DE CUENTA
// ============================================

/**
 * Obtiene los datos de la cuenta Instagram vinculada a una marca
 *
 * Estrategias de busqueda (en orden):
 * 1. cuentas_instagram directo por instagram_id (super admin pasa instagram_id como id_marca)
 * 2. cuentas_facebook por id_marca → instagram_id → cuentas_instagram
 * 3. usuarios.nombre_marca → match con cuentas_instagram.page_name
 */
export async function obtenerDatosCuenta(idMarca) {
  console.log(`[obtenerDatosCuenta] Buscando cuenta para id_marca: ${idMarca} (type: ${typeof idMarca})`)

  const formatResult = (ig) => ({
    page_id: ig.page_id,
    page_name: ig.page_name,
    instagram_id: ig.instagram_id,
    instagram_name: ig.instagram_name || '',
    access_token: ig.page_access_token,
    sitio_web: ig['Sitio web'] || ''
  })

  // === ESTRATEGIA 1: id_marca ES el instagram_id (super admin o id numerico grande) ===
  // En el super admin picker, id_marca se setea al instagram_id de cuentas_instagram
  {
    const { data: igArr } = await supabase
      .from('cuentas_instagram')
      .select('id, user_id, page_id, page_name, instagram_id, instagram_name, page_access_token, "Sitio web"')
      .eq('instagram_id', String(idMarca))
      .eq('activo', true)
      .limit(1)

    const match = igArr?.[0]
    if (match) {
      console.log(`[obtenerDatosCuenta] MATCH directo instagram_id=${idMarca}: ${match.page_name}`)
      return formatResult(match)
    }
  }

  // === ESTRATEGIA 2: cuentas_facebook.id_marca → cuentas_instagram ===
  {
    const { data: fbArr, error: errFb } = await supabase
      .from('cuentas_facebook')
      .select('page_id, page_name, instagram_id, instagram_username, access_token')
      .eq('id_marca', idMarca)
      .eq('activo', true)
      .not('instagram_id', 'is', null)
      .limit(1)

    if (errFb) console.log(`[obtenerDatosCuenta] Error cuentas_facebook: ${errFb.message}`)

    const fb = fbArr?.[0]
    if (fb) {
      console.log(`[obtenerDatosCuenta] Encontrada en cuentas_facebook: ig=${fb.instagram_id}`)

      // Buscar token en cuentas_instagram
      const { data: igArr } = await supabase
        .from('cuentas_instagram')
        .select('page_access_token, instagram_name, page_id, page_name, instagram_id, "Sitio web"')
        .eq('instagram_id', fb.instagram_id)
        .eq('activo', true)
        .limit(1)

      const ig = igArr?.[0]
      return {
        page_id: ig?.page_id || fb.page_id,
        page_name: ig?.page_name || fb.page_name,
        instagram_id: fb.instagram_id,
        instagram_name: ig?.instagram_name || fb.instagram_username || '',
        access_token: ig?.page_access_token || fb.access_token,
        sitio_web: ig?.['Sitio web'] || ''
      }
    }
  }

  // === ESTRATEGIA 3: nombre_marca del usuario → page_name en cuentas_instagram ===
  {
    const { data: usuariosArr } = await supabase
      .from('usuarios')
      .select('id, nombre_marca')
      .eq('id_marca', idMarca)
      .eq('activo', true)
      .limit(1)

    const usuario = usuariosArr?.[0]
    if (usuario?.nombre_marca) {
      console.log(`[obtenerDatosCuenta] Buscando por nombre_marca: "${usuario.nombre_marca}"`)

      // Buscar match por page_name o instagram_name
      const { data: igArr } = await supabase
        .from('cuentas_instagram')
        .select('id, user_id, page_id, page_name, instagram_id, instagram_name, page_access_token, "Sitio web"')
        .eq('activo', true)
        .limit(50)

      if (igArr?.length) {
        const nombreLower = usuario.nombre_marca.toLowerCase().trim()
        const match = igArr.find(c =>
          (c.page_name || '').toLowerCase().trim() === nombreLower ||
          (c.instagram_name || '').toLowerCase().trim() === nombreLower.replace(/\s+/g, '_') ||
          (c.page_name || '').toLowerCase().includes(nombreLower) ||
          nombreLower.includes((c.page_name || '').toLowerCase().trim())
        )

        if (match) {
          console.log(`[obtenerDatosCuenta] MATCH por nombre: "${usuario.nombre_marca}" → ${match.page_name} (ig=${match.instagram_id})`)
          return formatResult(match)
        }

        console.log(`[obtenerDatosCuenta] No match por nombre. Cuentas disponibles: ${igArr.map(c => c.page_name).join(', ')}`)
      }
    }
  }

  console.log(`[obtenerDatosCuenta] No se encontro ninguna cuenta para id_marca=${idMarca}`)
  return null
}

// ============================================
// GRAPH API: EXTRACCIÓN DE DATOS
// ============================================

async function getAccountProfile(igId, token) {
  const data = await apiGet(`${GRAPH_API_URL}/${igId}`, {
    fields: 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website',
    access_token: token
  }, 'perfil')
  return data
}

async function getAccountInsights(igId, token, sinceTs, untilTs) {
  const metricsResults = {}

  const data = await apiGet(`${GRAPH_API_URL}/${igId}/insights`, {
    metric: 'reach,impressions,profile_views,website_clicks,accounts_engaged,follows_and_unfollows',
    period: 'day',
    since: sinceTs,
    until: untilTs,
    access_token: token
  }, 'insights diarios')

  if (data?.data) {
    for (const m of data.data) {
      const vals = m.values || []
      metricsResults[m.name] = {
        total: vals.reduce((sum, v) => {
          const val = v.value
          return sum + (typeof val === 'number' ? val : 0)
        }, 0),
        daily: vals.map(v => ({ date: (v.end_time || '').substring(0, 10), value: v.value || 0 }))
      }
    }
  }

  const data2 = await apiGet(`${GRAPH_API_URL}/${igId}/insights`, {
    metric: 'engaged_audience_demographics,reached_audience_demographics,follower_demographics',
    period: 'lifetime',
    timeframe: 'last_30_days',
    metric_type: 'total_value',
    access_token: token
  }, 'demografía')

  if (data2?.data) {
    for (const m of data2.data) {
      const tv = m.total_value || {}
      if (tv.breakdowns) {
        metricsResults[m.name] = tv
      } else if (m.values?.length) {
        metricsResults[m.name] = m.values[0].value || {}
      }
    }
  }

  return metricsResults
}

async function getPostsWithMetrics(igId, token, sinceDate, untilDate, limit = 50) {
  const allPosts = []
  let url = `${GRAPH_API_URL}/${igId}/media`
  let params = {
    fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
    limit: Math.min(limit, 50),
    access_token: token
  }

  while (url && allPosts.length < limit) {
    const data = await apiGet(url, params, 'posts')
    if (!data) break
    const posts = data.data || []
    if (!posts.length) break

    for (const p of posts) {
      const pd = (p.timestamp || '').substring(0, 10)
      if (pd >= sinceDate && pd <= untilDate) {
        allPosts.push(p)
      } else if (pd < sinceDate) {
        url = null
        break
      }
    }

    if (url && data.paging?.next) {
      url = data.paging.next
      params = {}
    } else {
      break
    }
  }

  console.log(`   ${allPosts.length} posts en el período`)

  // Get insights for each post
  let insightsAvailable = true
  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i]
    post.insights = {}

    if (insightsAvailable) {
      const mt = post.media_type || 'IMAGE'
      const metrics = ['VIDEO', 'REELS'].includes(mt)
        ? 'impressions,reach,saved,shares,plays,total_interactions'
        : 'impressions,reach,saved,shares,total_interactions'

      const insData = await apiGet(`${GRAPH_API_URL}/${post.id}/insights`, {
        metric: metrics,
        access_token: token
      }, `post insights ${i + 1}`)

      if (insData?.error?.code === 10) {
        insightsAvailable = false
      } else if (insData?.data) {
        for (const m of insData.data) {
          post.insights[m.name] = m.values?.[0]?.value || 0
        }
      }
    }

    // Get comments
    const cd = await apiGet(`${GRAPH_API_URL}/${post.id}/comments`, {
      fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}',
      limit: 100,
      access_token: token
    }, `comments ${i + 1}`)

    post.comments_detail = cd?.data || []

    // Rate limit protection
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  return allPosts
}

async function getStoriesMetrics(igId, token) {
  const data = await apiGet(`${GRAPH_API_URL}/${igId}/stories`, {
    fields: 'id,caption,media_type,permalink,timestamp',
    access_token: token
  }, 'stories')

  const stories = data?.data || []
  for (const s of stories) {
    const ins = await apiGet(`${GRAPH_API_URL}/${s.id}/insights`, {
      metric: 'impressions,reach,replies,taps_forward,taps_back,exits',
      access_token: token
    }, 'story insight')

    s.insights = {}
    if (ins?.data) {
      for (const m of ins.data) {
        s.insights[m.name] = m.values?.[0]?.value || 0
      }
    }
  }

  return stories
}

async function getAdsData(pageId, token, sinceDate, untilDate) {
  const data = await apiGet(`${GRAPH_API_URL}/${pageId}/ad_accounts`, {
    fields: 'id,name,account_status,currency',
    access_token: token
  }, 'ad accounts')

  if (!data?.data?.length) return null

  const ads = []
  for (const aa of data.data) {
    const camps = await apiGet(`${GRAPH_API_URL}/${aa.id}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget',
      time_range: JSON.stringify({ since: sinceDate, until: untilDate }),
      access_token: token
    }, 'campañas')

    if (camps?.data) {
      for (const c of camps.data) {
        const ci = await apiGet(`${GRAPH_API_URL}/${c.id}/insights`, {
          fields: 'impressions,reach,clicks,spend,cpc,cpm,ctr,actions',
          time_range: JSON.stringify({ since: sinceDate, until: untilDate }),
          access_token: token
        }, `camp ${(c.name || '').substring(0, 20)}`)

        c.insights = ci?.data || []
        ads.push(c)
      }
    }
  }

  return ads.length ? ads : null
}

// ============================================
// COMMENT LOGS FROM SUPABASE
// ============================================

async function getCommentLogs(igId, sinceDate, untilDate) {
  try {
    const { data: logs, error } = await supabase
      .from('logs_comentarios')
      .select('*')
      .eq('id_marca', String(igId))
      .not('comment_id', 'is', null)
      .gte('creado_en', `${sinceDate}T00:00:00`)
      .lte('creado_en', `${untilDate}T23:59:59`)
      .order('creado_en', { ascending: false })

    if (error) throw error
    if (!logs?.length) return null

    const total = logs.length
    const respondidos = logs.filter(l => l.respuesta_enviada).length
    const inapropiados = logs.filter(l => l.es_inapropiado).length
    const dmEnviados = logs.filter(l => l.dm_enviado).length

    // By platform
    const plataformas = {}
    for (const l of logs) {
      const p = l.plataforma || 'instagram'
      plataformas[p] = (plataformas[p] || 0) + 1
    }

    // By date
    const porFecha = {}
    const porFechaRespondidos = {}
    const porFechaInapropiados = {}
    const porFechaDm = {}
    for (const l of logs) {
      const d = (l.creado_en || '').substring(0, 10)
      if (!d) continue
      porFecha[d] = (porFecha[d] || 0) + 1
      if (l.respuesta_enviada) porFechaRespondidos[d] = (porFechaRespondidos[d] || 0) + 1
      if (l.es_inapropiado) porFechaInapropiados[d] = (porFechaInapropiados[d] || 0) + 1
      if (l.dm_enviado) porFechaDm[d] = (porFechaDm[d] || 0) + 1
    }

    // By media
    const porMedia = {}
    for (const l of logs) {
      const mid = l.media_id || 'unknown'
      if (!porMedia[mid]) porMedia[mid] = { count: 0, texto_pub: (l.texto_publicacion || '').substring(0, 80) }
      porMedia[mid].count++
    }

    // Razones inapropiados
    const razones = {}
    for (const l of logs) {
      if (l.es_inapropiado && l.razon_inapropiado) {
        razones[l.razon_inapropiado] = (razones[l.razon_inapropiado] || 0) + 1
      }
    }

    // Clasificación
    const spamKw = ['spam', 'enlace', 'link', 'autopromo', 'bot', 'promoci', 'publicidad', 'url', 'http']
    const clasificacion = { positivos: 0, inapropiados: 0, spam: 0 }
    for (const l of logs) {
      if (l.es_inapropiado) {
        const razon = (l.razon_inapropiado || '').toLowerCase()
        if (spamKw.some(kw => razon.includes(kw))) {
          clasificacion.spam++
        } else {
          clasificacion.inapropiados++
        }
      } else {
        clasificacion.positivos++
      }
    }

    // Top posts by volume
    const topPosts = Object.entries(porMedia)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
    clasificacion.mas_comentados = topPosts.map(([mid, info]) => ({
      media_id: mid, count: info.count, texto: info.texto_pub
    }))

    // Weekly aggregation
    const porSemana = {}
    for (const l of logs) {
      const d = (l.creado_en || '').substring(0, 10)
      if (!d) continue
      try {
        const dt = new Date(d)
        const year = dt.getFullYear()
        const oneJan = new Date(year, 0, 1)
        const weekNum = Math.ceil(((dt - oneJan) / 86400000 + oneJan.getDay() + 1) / 7)
        const wk = `${year}-W${String(weekNum).padStart(2, '0')}`
        if (!porSemana[wk]) porSemana[wk] = { total: 0, respondidos: 0, inapropiados: 0 }
        porSemana[wk].total++
        if (l.respuesta_enviada) porSemana[wk].respondidos++
        if (l.es_inapropiado) porSemana[wk].inapropiados++
      } catch { /* skip */ }
    }

    // Add tasa_respuesta to weekly
    for (const wk of Object.keys(porSemana)) {
      const w = porSemana[wk]
      w.tasa_respuesta = w.total ? Math.round(w.respondidos / w.total * 1000) / 10 : 0
    }

    // Sample
    const muestra = logs.slice(0, 30).map(l => ({
      comentario: (l.comentario_original || '').substring(0, 150),
      respuesta: (l.respuesta_comentario || '').substring(0, 150),
      es_inapropiado: l.es_inapropiado || false,
      razon: l.razon_inapropiado || '',
      dm_enviado: l.dm_enviado || false,
      fecha: (l.creado_en || '').substring(0, 16),
      plataforma: l.plataforma || 'instagram'
    }))

    const uniqueSenders = new Set(logs.filter(l => l.sender_id).map(l => l.sender_id)).size

    return {
      total, respondidos, inapropiados, dm_enviados: dmEnviados,
      tasa_respuesta: total ? Math.round(respondidos / total * 1000) / 10 : 0,
      tasa_inapropiados: total ? Math.round(inapropiados / total * 1000) / 10 : 0,
      plataformas, por_fecha: porFecha,
      por_fecha_respondidos: porFechaRespondidos,
      por_fecha_inapropiados: porFechaInapropiados,
      por_fecha_dm: porFechaDm,
      por_publicacion: Object.fromEntries(
        Object.entries(porMedia).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
      ),
      razones_inapropiados: razones,
      usuarios_unicos: uniqueSenders,
      clasificacion, por_semana: porSemana,
      muestra, raw_logs: logs
    }
  } catch (e) {
    console.error(`   Error logs_comentarios: ${e.message}`)
    return null
  }
}

// ============================================
// GPT-4o ANALYSIS
// ============================================

async function analyzeWithGPT(reportData) {
  const marca = reportData.marca
  const perfil = reportData.perfil || {}
  const cl = reportData.comment_logs || {}
  const brand = reportData.brand_analysis || {}
  const bp = brand.brand_profile || {}
  const comps = brand.competitors || {}
  const market = brand.market_positioning || {}

  const dataSummary = {
    marca,
    username: reportData.instagram_name || '',
    periodo: reportData.periodo,
    perfil: {
      followers: perfil.followers_count || 0,
      following: perfil.follows_count || 0,
      total_posts: perfil.media_count || 0,
      bio: perfil.biography || ''
    },
    metricas_periodo: reportData.resumen || {},
    por_tipo_contenido: reportData.by_content_type || {},
    por_dia_semana: reportData.by_weekday || {},
    brand_profile: bp,
    competitors_detail: comps,
    market_positioning: market,
    bot_comentarios: {
      total_procesados: cl.total || 0,
      respondidos: cl.respondidos || 0,
      inapropiados: cl.inapropiados || 0,
      dm_enviados: cl.dm_enviados || 0,
      tasa_respuesta: cl.tasa_respuesta || 0,
      tasa_inapropiados: cl.tasa_inapropiados || 0,
      usuarios_unicos: cl.usuarios_unicos || 0,
      razones_inapropiados: cl.razones_inapropiados || {},
      clasificacion: cl.clasificacion || {},
      por_semana: cl.por_semana || {},
      muestra_interacciones: (cl.muestra || []).slice(0, 15)
    }
  }

  // Account insights
  const accountInsights = reportData.account_insights || {}
  dataSummary.account_insights = {}
  for (const [key, val] of Object.entries(accountInsights)) {
    if (val && typeof val === 'object' && 'total' in val) {
      dataSummary.account_insights[key] = val.total
    }
  }

  // Top posts
  const top = reportData.top_posts || {}
  dataSummary.top_posts = (top.by_likes || []).map(p => ({
    caption: (p.caption || '').substring(0, 100),
    likes: p.like_count || 0,
    comments: p.comments_count || 0,
    type: p.media_type || '',
    reach: p.insights?.reach || 0
  }))

  // Comment sample
  const comments = (reportData.all_comments || []).slice(0, 30)
  dataSummary.muestra_comentarios_ig = comments.map(c => ({
    text: (c.text || '').substring(0, 100),
    likes: c.likes || 0
  }))

  const prompt = `Eres un consultor de marketing digital experto en crecimiento de marcas en Chile.
Tu rol es analizar datos de Instagram y generar un informe POSITIVO y orientado a CRECIMIENTO.
Habla siempre desde lo que se ha logrado, las tendencias positivas, y las oportunidades.

DATOS DE "${marca}":
${JSON.stringify(dataSummary, null, 2)}

GENERA JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "1-2 lineas breves como subtitulo de un grafico acumulado: resumen ultra-conciso del crecimiento del periodo con 2-3 cifras clave. Maximo 2 oraciones cortas.",
  "narrativa_crecimiento": "1-2 lineas breves como subtitulo de un grafico acumulado: resumen ultra-conciso del rendimiento del bot en el periodo con cifras clave. Maximo 2 oraciones cortas.",
  "metricas_clave": {
    "engagement_rate": "X%",
    "interpretacion_engagement": "comparar con benchmarks de la industria",
    "frecuencia_publicacion": "X posts/semana",
    "likes_por_post": "promedio, comparar primera vs segunda mitad del período",
    "comentarios_por_post": "promedio, tendencia",
    "mejor_rendimiento": "cuál fue el mejor post y por qué funcionó"
  },
  "analisis_contenido": {
    "tipo_mas_efectivo": "qué formato genera más engagement y por qué",
    "mejor_dia_publicar": "día con mejores resultados",
    "mejor_horario_estimado": "horario recomendado basado en patrones",
    "frecuencia_ideal": "cuántos posts por semana se recomienda",
    "temas_populares": ["tema1","tema2","tema3"],
    "hashtags_recomendados": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
    "estrategia_organica": "párrafo detallado con la estrategia orgánica recomendada",
    "plan_semanal": {"lunes":"contenido","martes":"contenido","miercoles":"contenido","jueves":"contenido","viernes":"contenido","sabado":"contenido","domingo":"contenido"},
    "observaciones": "texto detallado sobre patrones observados"
  },
  "analisis_audiencia": {
    "sentimiento_general": "positivo/neutro/negativo con explicación",
    "temas_mencionados": ["tema1","tema2"],
    "comentarios_destacados": "ejemplos de comentarios que muestran conexión con la audiencia",
    "nivel_interaccion": "evaluación de qué tan activa está la comunidad"
  },
  "analisis_bot": {
    "resumen_rendimiento": "2 lineas maximo: resumen conciso del rendimiento del bot con cifras clave del periodo",
    "metricas_clave_bot": "1 linea: X procesados, X% respondidos, X usuarios atendidos",
    "temas_comentarios": [
      {"titulo": "titulo del tema detectado", "resumen": "2-3 lineas", "palabras_clave": ["palabra1", "palabra2"], "icono": "emoji"},
      {"titulo": "otro tema", "resumen": "resumen", "palabras_clave": ["clave1", "clave2"], "icono": "emoji"},
      {"titulo": "otro tema", "resumen": "resumen", "palabras_clave": ["clave1", "clave2"], "icono": "emoji"}
    ],
    "formas_de_respuesta": [
      {"tipo_comentario": "patron de comentario", "respuesta_sugerida": "respuesta concreta", "categoria_bdm": "publicacion_regla"},
      {"tipo_comentario": "otro patron", "respuesta_sugerida": "otra respuesta", "categoria_bdm": "publicacion_informacion"},
      {"tipo_comentario": "otro patron", "respuesta_sugerida": "otra respuesta", "categoria_bdm": "publicacion_observacion"}
    ]
  },
  "campanas_pagas": [
    {"nombre_campana":"nombre","tipo":"Awareness/Engagement/Conversión/Tráfico","objetivo":"objetivo",
      "publico_objetivo":"segmentación","ubicaciones":"Feed/Stories/Reels",
      "presupuesto_diario":"CLP X.XXX","duracion":"X días","presupuesto_total":"CLP X.XXX",
      "formato":"formato","copy":"texto","cta":"botón CTA",
      "kpi_esperado":"métrica objetivo","justificacion":"por qué es prioritaria"}
  ],
  "kpis_objetivo": {
    "likes_objetivo":"N","comentarios_objetivo":"N","reach_objetivo":"N","nuevos_seguidores_objetivo":"N",
    "posts_objetivo":"N posts en el próximo período"
  }
}

IMPORTANTE:
- Español chileno profesional, tono POSITIVO y orientado a resultados
- Números específicos siempre con contexto
- Presupuestos en CLP
- El analisis_bot debe tener: resumen corto (2 lineas) + metricas en 1 linea + temas_comentarios (3-5 temas agrupados) + formas_de_respuesta accionables
- temas_comentarios: analiza la muestra y agrupa por TEMA/PATRON detectado. Las palabras_clave deben ser especificas (minusculas, sin tildes)
- Cada forma_de_respuesta debe ser algo que el operador pueda copiar a su base de datos BDM
- Las campañas pagas deben ser detalladas con presupuestos reales y KPIs esperados
- Si algo bajó, no digas "bajó" sino "hay una oportunidad de mejorar X"
- Responde SOLO JSON`

  try {
    const r = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 5000,
      temperature: 0.7
    })

    let content = r.choices[0].message.content.trim()
      .replace(/```json/g, '').replace(/```/g, '').trim()
    // Fix trailing commas
    content = content.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')

    return JSON.parse(content)
  } catch (e) {
    console.error(`   GPT Error: ${e.message}`)
    return null
  }
}

// ============================================
// HTML REPORT GENERATION
// ============================================

function generateHTMLReport(report, analysis) {
  const marca = report.marca
  const username = report.instagram_name || ''
  const perfil = report.perfil || {}
  const resumen = report.resumen || {}
  const periodo = report.periodo || {}
  const cl = report.comment_logs || {}
  const posts = report.posts || []
  const byType = report.by_content_type || {}
  const byDay = report.by_weekday || {}
  const sitioWeb = report.sitio_web || ''
  const bp = (report.brand_analysis || {}).brand_profile || {}

  const a = analysis || {}
  const bot = a.analisis_bot || {}

  // Razones de filtrado HTML
  const razones = cl.razones_inapropiados || {}
  let razonesHtml = ''
  if (Object.keys(razones).length) {
    const items = Object.entries(razones).map(([k, v]) =>
      `<div class="card danger"><p><strong>${k}:</strong> ${v} veces</p></div>`
    ).join('')
    razonesHtml = `<div class="section"><h2>Razones de Filtrado</h2>${items}</div>`
  }

  const topLikes = (report.top_posts || {}).by_likes || []

  // Daily data for charts
  const dailyData = posts.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || '')).map(p => ({
    date: (p.timestamp || '').substring(0, 10),
    likes: p.like_count || 0,
    comments: p.comments_count || 0,
    reach: p.insights?.reach || 0
  }))

  const commentsByDate = cl.por_fecha || {}
  const botByDateResp = cl.por_fecha_respondidos || {}
  const botByDateInap = cl.por_fecha_inapropiados || {}
  const botByDateDm = cl.por_fecha_dm || {}
  const botSample = cl.muestra || []
  const plataformas = cl.plataformas || {}
  const clasificacion = cl.clasificacion || {}
  const porSemana = cl.por_semana || {}

  // Plataformas HTML
  const plataformasHtml = Object.entries(plataformas).map(([k, v]) =>
    `<div class="stat-card"><div class="number">${v}</div><div class="label">${k.charAt(0).toUpperCase() + k.slice(1)} · comentarios</div></div>`
  ).join('')

  // Formas de respuesta HTML
  let formasHtml = ''
  const formas = bot.formas_de_respuesta || []
  if (Array.isArray(formas) && formas.length) {
    formasHtml = formas.map(f => {
      if (typeof f !== 'object') return ''
      const cat = f.categoria_bdm || 'publicacion_regla'
      const tipo = f.tipo_comentario || ''
      const resp = f.respuesta_sugerida || ''
      const badgeColor = cat.includes('regla') ? 'var(--green)' : (cat.includes('informacion') ? 'var(--blue)' : 'var(--orange)')
      return `<div class="card" style="border-left:4px solid ${badgeColor};margin-bottom:12px"><p style="font-size:0.78em;color:${badgeColor};font-weight:600;margin-bottom:4px">${cat}</p><p><strong>Cuando lleguen:</strong> ${tipo}</p><p style="margin-top:6px"><strong>Responder:</strong> ${resp}</p></div>`
    }).join('')
  }

  // Temas de comentarios HTML
  const rawLogs = cl.raw_logs || []
  let temasGpt = bot.temas_comentarios || []
  if (!Array.isArray(temasGpt)) temasGpt = []

  const logsOk = rawLogs.filter(l => !l.es_inapropiado)
  const logsInap = rawLogs.filter(l => l.es_inapropiado)

  const asignados = new Set()
  const temasConComentarios = []

  for (const tema of temasGpt) {
    if (typeof tema !== 'object') continue
    const kws = (tema.palabras_clave || []).filter(k => typeof k === 'string').map(k => k.toLowerCase())
    const matched = []
    for (let idx = 0; idx < logsOk.length; idx++) {
      if (asignados.has(idx)) continue
      const texto = ((logsOk[idx].comentario_original || '') + ' ' + (logsOk[idx].respuesta_comentario || '')).toLowerCase()
      if (kws.some(kw => texto.includes(kw))) {
        matched.push(logsOk[idx])
        asignados.add(idx)
      }
    }
    if (matched.length) {
      temasConComentarios.push({
        titulo: tema.titulo || 'Tema',
        resumen: tema.resumen || '',
        icono: tema.icono || '💬',
        comentarios: matched
      })
    }
  }

  // Unassigned comments
  const noAsignados = logsOk.filter((_, idx) => !asignados.has(idx))
  if (noAsignados.length) {
    temasConComentarios.push({
      titulo: 'Otros comentarios',
      resumen: `${noAsignados.length} comentarios que no encajan en los patrones principales detectados.`,
      icono: '💬',
      comentarios: noAsignados
    })
  }

  // Inappropriate section
  if (logsInap.length) {
    temasConComentarios.push({
      titulo: 'Comentarios Inapropiados',
      resumen: `${logsInap.length} comentarios filtrados por contenido inapropiado, spam o lenguaje agresivo.`,
      icono: '⚠️',
      comentarios: logsInap,
      es_inapropiado_section: true
    })
  }

  // Build tema accordions
  const temasHtml = temasConComentarios.map((tema, idx) => {
    const comms = (tema.comentarios || []).slice(0, 30)
    const rows = comms.map(c => {
      const isInap = c.es_inapropiado || false
      const pill = isInap ? 'pill-bad' : 'pill-ok'
      const estado = isInap ? 'Inapropiado' : 'OK'
      const fecha = (c.creado_en || '').substring(0, 16)
      const comText = (c.comentario_original || '').substring(0, 200)
      const respText = (c.respuesta_comentario || '').substring(0, 200)
      return `<tr><td style='white-space:nowrap;font-size:0.82em'>${fecha}</td><td style='font-size:0.85em'>${comText}</td><td style='font-size:0.85em'>${respText}</td><td><span class='pill ${pill}'>${estado}</span></td></tr>`
    }).join('')

    const tabla = `<table class="log-table" style="margin-top:8px;font-size:0.9em"><thead><tr><th>Fecha</th><th>Comentario</th><th>Respuesta Bot</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
    const n = (tema.comentarios || []).length
    const borderColor = tema.es_inapropiado_section ? 'var(--red)' : 'var(--primary)'

    return `<div class="card" style="margin-bottom:8px;padding:0;overflow:hidden;border-left:4px solid ${borderColor}"><div onclick="toggleTema(this)" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;user-select:none"><span style="font-size:1.2em">${tema.icono || '💬'}</span><div style="flex:1"><div style="font-weight:600;font-size:0.95em">${tema.titulo || ''}</div><div style="font-size:0.82em;color:var(--muted-fg);margin-top:2px">${tema.resumen || ''}</div></div><span style="font-weight:600;color:var(--secondary);white-space:nowrap;font-size:0.9em">${n} comentarios</span><span class="arrow" style="font-size:0.75em;color:var(--muted-fg)">&#9654;</span></div><div style="display:none;padding:0 16px 14px;border-top:1px solid var(--border)">${tabla}</div></div>`
  }).join('')

  // Bot sample HTML
  const botSampleHtml = botSample.map(s => {
    const pill = s.es_inapropiado ? 'pill-bad' : 'pill-ok'
    const estado = s.es_inapropiado ? 'Inapropiado' : 'OK'
    return `<tr><td style='white-space:nowrap'>${s.fecha || ''}</td><td>${s.plataforma || 'ig'}</td><td>${s.comentario || ''}</td><td>${s.respuesta || ''}</td><td><span class='pill ${pill}'>${estado}</span></td><td>${s.dm_enviado ? 'Si' : '—'}</td></tr>`
  }).join('')

  // Likes trend styling
  const likesTrend = resumen.likes_trend_pct || 0
  const commentsTrend = resumen.comments_trend_pct || 0
  const ltColor = likesTrend >= 0 ? 'var(--green)' : 'var(--red)'
  const ctColor = commentsTrend >= 0 ? 'var(--green)' : 'var(--red)'
  const ltSign = likesTrend >= 0 ? '+' : ''
  const ctSign = commentsTrend >= 0 ? '+' : ''

  // No-insights alert
  const noInsightsAlert = resumen.total_reach === 0 && resumen.total_posts > 0
    ? '<div class="alert" style="border-left-color:var(--orange);background:rgba(254,110,0,0.06);color:#7c2d12">Nota: Reach, impressions, saves y shares requieren el permiso <strong>instagram_manage_insights</strong>. Los datos de likes, comentarios y bot estan completos.</div>'
    : ''

  // KPIs HTML
  const kpisHtml = Object.entries(a.kpis_objetivo || {}).map(([k, v]) =>
    `<div class="kpi-card"><div class="target">${v}</div><div class="label" style="color:var(--muted-fg);margin-top:4px">${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div></div>`
  ).join('')

  // Content analysis
  const ac = a.analisis_contenido || {}
  const temasPopulares = (ac.temas_populares || []).map(t => `<span class="tag">${t}</span>`).join('')
  const hashtags = (ac.hashtags_recomendados || []).map(t => `<span class="tag">${t}</span>`).join('')
  const planSemanal = Object.entries(ac.plan_semanal || {}).map(([d, c]) =>
    `<div class="plan-day"><div class="day-name">${d.charAt(0).toUpperCase() + d.slice(1)}</div><div class="day-content">${c}</div></div>`
  ).join('')

  // Top posts HTML
  const topPostsHtml = topLikes.slice(0, 5).map((p, i) =>
    `<div class="top-post"><div class="rank">#${i + 1}</div><div class="info"><div class="cap">${(p.caption || 'Sin caption').substring(0, 90)}...</div></div><div class="metrics"><span>Likes ${p.like_count || 0}</span><span>Com. ${p.comments_count || 0}</span><span>Alcance ${(p.insights?.reach || 0).toLocaleString()}</span></div></div>`
  ).join('')

  // Audience analysis
  const aa = a.analisis_audiencia || {}
  const temasMencionados = (aa.temas_mencionados || []).map(t => `<span class="tag">${t}</span>`).join('')

  // Campaigns HTML
  const campañasHtml = (a.campanas_pagas || []).map(c => `<div class="card warn">
    <span class="badge badge-warn">${c.tipo || ''}</span>
    <h4>${c.nombre_campana || ''}</h4>
    <p><strong>Objetivo:</strong> ${c.objetivo || ''}</p>
    <p><strong>Justificacion:</strong> ${c.justificacion || ''}</p>
    <p><strong>Publico:</strong> ${c.publico_objetivo || ''}</p>
    <p><strong>Ubicaciones:</strong> ${c.ubicaciones || ''}</p>
    <p><strong>Presupuesto:</strong> ${c.presupuesto_diario || ''} / dia x ${c.duracion || ''} = <strong>${c.presupuesto_total || ''}</strong></p>
    <p><strong>Formato:</strong> ${c.formato || ''}</p>
    <p><strong>Copy:</strong> ${c.copy || ''}</p>
    <p><strong>CTA:</strong> ${c.cta || ''}</p>
    <p><strong>KPI esperado:</strong> ${c.kpi_esperado || ''}</p>
  </div>`).join('')

  const fechaGen = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${marca} — CreceTec Analytics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
:root{--primary:#2e3d60;--secondary:#ca352b;--bg:#f6f7f8;--fg:#222939;--card:#fff;--border:#dbdfe6;--muted:#edeff3;--muted-fg:#6a7282;--green:#00c758;--red:#fb2c36;--blue:#3080ff;--orange:#fe6e00;--shadow:0 4px 20px -2px rgba(34,41,57,0.06);--shadow-hover:0 12px 40px -8px rgba(46,61,96,0.15);--radius:0.75rem}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased}
.container{max-width:1280px;margin:0 auto;padding:24px}
.header{background:var(--primary);border-radius:var(--radius);padding:40px;margin-bottom:24px;position:relative;overflow:hidden}
.header::after{content:'';position:absolute;top:0;right:0;width:300px;height:100%;background:linear-gradient(135deg,var(--secondary) 0%,transparent 70%);opacity:0.15;border-radius:0 var(--radius) var(--radius) 0}
.header-logo{font-family:Poppins,sans-serif;font-weight:800;font-size:0.95em;color:#fff;letter-spacing:0.5px;margin-bottom:16px;position:relative;z-index:1}
.header-logo span{color:var(--secondary)}
.header h1{font-family:Poppins,sans-serif;font-size:2em;font-weight:700;color:#fff;margin-bottom:4px;position:relative;z-index:1}
.header .subtitle{color:rgba(255,255,255,0.8);font-size:1.05em;position:relative;z-index:1}
.header .meta-row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;position:relative;z-index:1}
.header .pill-header{background:rgba(255,255,255,0.15);padding:6px 16px;border-radius:20px;color:rgba(255,255,255,0.9);font-size:0.85em;backdrop-filter:blur(4px)}
.nav-tabs{display:flex;gap:4px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:5px;margin-bottom:24px;overflow-x:auto;position:sticky;top:12px;z-index:100;box-shadow:var(--shadow)}
.nav-tab{padding:10px 18px;border-radius:calc(var(--radius) - 2px);cursor:pointer;font-size:0.88em;font-weight:500;color:var(--muted-fg);transition:all 0.25s;white-space:nowrap;border:none;background:none;font-family:Inter,sans-serif}
.nav-tab:hover{color:var(--fg);background:var(--muted)}
.nav-tab.active{background:var(--primary);color:#fff;box-shadow:0 2px 8px rgba(46,61,96,0.3)}
.tab-content{display:none;animation:fadeIn 0.3s ease}.tab-content.active{display:block}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:var(--card);border-radius:var(--radius);padding:20px;text-align:center;border:1px solid var(--border);transition:all 0.25s;box-shadow:var(--shadow)}
.stat-card:hover{transform:translateY(-3px);border-color:var(--primary);box-shadow:var(--shadow-hover)}
.stat-card .number{font-family:Poppins,sans-serif;font-size:1.8em;font-weight:700;color:var(--primary)}
.stat-card .label{font-size:0.8em;color:var(--muted-fg);margin-top:2px;font-weight:500}
.section{background:var(--card);border-radius:var(--radius);padding:24px;margin-bottom:18px;border:1px solid var(--border);box-shadow:var(--shadow)}
.section h2{font-family:Poppins,sans-serif;font-size:1.25em;font-weight:700;margin-bottom:14px;color:var(--primary);display:flex;align-items:center;gap:8px}
.section h3{font-size:1em;color:var(--secondary);margin:12px 0 8px;font-weight:600}
.section p{color:#364153;margin-bottom:6px;font-size:0.95em}
.chart-box{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin:12px 0;box-shadow:var(--shadow)}
.charts-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.charts-row{grid-template-columns:1fr}}
.card{background:var(--bg);border-radius:calc(var(--radius) - 2px);padding:16px;margin:10px 0;border-left:4px solid var(--primary);transition:all 0.2s}
.card:hover{transform:translateX(3px);box-shadow:var(--shadow)}
.card.warn{border-left-color:var(--orange)}.card.danger{border-left-color:var(--red)}.card.success{border-left-color:var(--green)}
.card h4{color:var(--fg);margin-bottom:4px;font-size:0.95em;font-weight:600}
.card p{color:var(--muted-fg);font-size:0.9em;margin-bottom:4px}
.badge{padding:3px 10px;border-radius:10px;font-size:0.78em;font-weight:600;display:inline-block;margin-bottom:6px}
.badge-primary{background:var(--primary);color:#fff}.badge-warn{background:var(--orange);color:#fff}
.badge-green{background:var(--green);color:#fff}.badge-red{background:var(--red);color:#fff}
.text-success{color:var(--green)}.text-danger{color:var(--red)}.text-accent{color:var(--blue)}.text-warn{color:var(--orange)}
.caption-box{background:var(--muted);padding:12px;border-radius:8px;margin-top:8px;font-style:italic;color:#364153;font-size:0.88em;white-space:pre-wrap;border:1px solid var(--border)}
.log-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:0.88em}
.log-table th{background:var(--muted);padding:10px;text-align:left;color:var(--primary);border-bottom:2px solid var(--border);font-weight:600}
.log-table td{padding:10px;border-bottom:1px solid var(--border);color:#364153}
.log-table tr:hover td{background:rgba(46,61,96,0.03)}
.pill{padding:2px 8px;border-radius:8px;font-size:0.8em;font-weight:500}
.pill-ok{background:rgba(0,199,88,0.12);color:var(--green)}.pill-bad{background:rgba(251,44,54,0.1);color:var(--red)}
.tag{background:var(--muted);color:var(--primary);padding:5px 12px;border-radius:14px;font-size:0.82em;display:inline-block;margin:3px;transition:all 0.2s;font-weight:500;border:1px solid var(--border)}
.tag:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
.plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.plan-day{background:var(--bg);padding:16px;border-radius:calc(var(--radius) - 2px);text-align:center;transition:all 0.2s;border:1px solid var(--border)}
.plan-day:hover{border-color:var(--primary);transform:translateY(-2px);box-shadow:var(--shadow)}
.plan-day .day-name{color:var(--secondary);font-weight:700;font-size:0.88em;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}
.plan-day .day-content{color:var(--muted-fg);font-size:0.82em}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.kpi-card{background:var(--bg);border:2px dashed var(--primary);border-radius:var(--radius);padding:18px;text-align:center;transition:all 0.2s}
.kpi-card:hover{border-style:solid;background:rgba(46,61,96,0.04)}
.kpi-card .target{font-family:Poppins,sans-serif;font-size:1.4em;font-weight:700;color:var(--primary)}
.alert{background:rgba(251,44,54,0.06);border-left:4px solid var(--red);padding:12px 16px;border-radius:0 calc(var(--radius) - 2px) calc(var(--radius) - 2px) 0;margin:8px 0;color:#991b1b;font-size:0.93em}
.top-post{background:var(--bg);padding:14px;border-radius:calc(var(--radius) - 2px);margin:8px 0;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s;border:1px solid var(--border)}
.top-post:hover{transform:translateX(3px);border-color:var(--primary);box-shadow:var(--shadow)}
.top-post .rank{font-family:Poppins,sans-serif;font-size:1.4em;font-weight:700;color:var(--secondary);margin-right:14px;min-width:30px}
.top-post .info{flex:1}.top-post .info .cap{color:#364153;font-size:0.9em}
.top-post .metrics span{color:var(--muted-fg);font-size:0.85em;margin-left:12px}
.footer{text-align:center;padding:30px;color:var(--muted-fg);font-size:0.82em;border-top:1px solid var(--border);margin-top:20px}
.footer a{color:var(--secondary);font-weight:600}
.filter-input{background:var(--bg);border:1px solid var(--border);color:var(--fg);padding:10px 16px;border-radius:var(--radius);width:100%;margin-bottom:14px;font-size:0.9em;font-family:Inter,sans-serif}
.filter-input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(46,61,96,0.1)}
a{color:var(--secondary);text-decoration:none;font-weight:500}a:hover{text-decoration:underline}
@media print{.nav-tabs{display:none}.tab-content{display:block!important}.header{background:var(--primary)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="container">

<div class="header">
  <div class="header-logo">Crece<span>Tec</span> Analytics</div>
  <h1>${marca}</h1>
  <div class="subtitle">@${username} — Instagram Analytics Report</div>
  <div class="meta-row">
    <span class="pill-header">${bp.industria || 'N/A'} · ${bp.sub_industria || 'N/A'}</span>
    <span class="pill-header">${periodo.desde || ''} → ${periodo.hasta || ''}</span>
  </div>
</div>

<div class="nav-tabs" id="navTabs">
  <button class="nav-tab active" onclick="showTab('overview')">Resumen</button>
  <button class="nav-tab" onclick="showTab('content')">Contenido</button>
  <button class="nav-tab" onclick="showTab('campaigns')">Campanas</button>
  <button class="nav-tab" onclick="showTab('bot')">Bot IA</button>
</div>

<!-- TAB: RESUMEN -->
<div class="tab-content active" id="tab-overview">
  ${noInsightsAlert}
  <div class="stats-grid">
    <div class="stat-card"><div class="number">${(perfil.followers_count || 0).toLocaleString()}</div><div class="label">Seguidores totales</div></div>
    <div class="stat-card"><div class="number">${resumen.total_posts || 0}</div><div class="label">Publicaciones · ${resumen.days_span || 0} dias</div></div>
    <div class="stat-card"><div class="number">${resumen.posts_per_week || 0}</div><div class="label">Posts / semana</div></div>
    <div class="stat-card"><div class="number">${(resumen.total_likes || 0).toLocaleString()}</div><div class="label">Likes totales</div></div>
    <div class="stat-card"><div class="number">${resumen.avg_likes || 0}</div><div class="label">Likes / post (promedio)</div></div>
    <div class="stat-card"><div class="number">${resumen.likes_per_day || 0}</div><div class="label">Likes / dia</div></div>
    <div class="stat-card"><div class="number">${(resumen.total_comments || 0).toLocaleString()}</div><div class="label">Comentarios totales</div></div>
    <div class="stat-card"><div class="number">${resumen.avg_comments || 0}</div><div class="label">Comentarios / post</div></div>
    <div class="stat-card"><div class="number">${resumen.engagement_rate || 0}%</div><div class="label">Engagement Rate</div></div>
    <div class="stat-card"><div class="number">${(cl.total || 0).toLocaleString()}</div><div class="label">Interacciones Bot IA</div></div>
  </div>

  <div class="section">
    <h2>Tendencia de Crecimiento</h2>
    <div class="stats-grid" style="grid-template-columns:1fr 1fr">
      <div class="stat-card" style="border-left:4px solid ${ltColor}">
        <div class="number" style="color:${ltColor}">${ltSign}${likesTrend}%</div>
        <div class="label">Tendencia Likes (2da mitad vs 1ra mitad)</div>
        <p style="font-size:0.82em;color:var(--muted-fg);margin-top:6px">1ra mitad: ${resumen.first_half_avg_likes || 0} likes/post → 2da mitad: ${resumen.second_half_avg_likes || 0} likes/post</p>
      </div>
      <div class="stat-card" style="border-left:4px solid ${ctColor}">
        <div class="number" style="color:${ctColor}">${ctSign}${commentsTrend}%</div>
        <div class="label">Tendencia Comentarios (2da mitad vs 1ra mitad)</div>
        <p style="font-size:0.82em;color:var(--muted-fg);margin-top:6px">1ra mitad: ${resumen.first_half_avg_comments || 0} com/post → 2da mitad: ${resumen.second_half_avg_comments || 0} com/post</p>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Resumen Ejecutivo</h2>
    <p style="font-size:0.92em;color:var(--muted-fg);margin-bottom:16px">${a.resumen_ejecutivo || 'Analisis no disponible'}</p>
    <div class="chart-box" style="max-width:100%;height:340px"><canvas id="cumulativeEngagementChart"></canvas></div>
  </div>
  <div class="section">
    <h2>Historia del Periodo</h2>
    <p style="font-size:0.92em;color:var(--muted-fg);margin-bottom:16px">${a.narrativa_crecimiento || ''}</p>
    <div class="chart-box" style="max-width:100%;height:340px"><canvas id="cumulativeBotChart"></canvas></div>
  </div>

  <div class="charts-row">
    <div class="chart-box"><canvas id="likesTimelineChart"></canvas></div>
    <div class="chart-box"><canvas id="commentsTimelineChart"></canvas></div>
  </div>
  <div class="charts-row">
    <div class="chart-box"><canvas id="overviewChart"></canvas></div>
    <div class="chart-box"><canvas id="typeChart"></canvas></div>
  </div>

  <div class="section"><h2>Objetivos Proximo Periodo</h2><div class="kpi-grid">${kpisHtml}</div></div>
</div>

<!-- TAB: CONTENIDO -->
<div class="tab-content" id="tab-content">
  <div class="section">
    <h2>Analisis de Contenido</h2>
    <p><strong>Tipo mas efectivo:</strong> ${ac.tipo_mas_efectivo || 'N/A'}</p>
    <p><strong>Mejor dia:</strong> ${ac.mejor_dia_publicar || 'N/A'}</p>
    <p><strong>Mejor horario:</strong> ${ac.mejor_horario_estimado || 'N/A'}</p>
    <p><strong>Frecuencia ideal:</strong> ${ac.frecuencia_ideal || 'N/A'}</p>
    <h3>Temas populares</h3><p>${temasPopulares}</p>
    <h3>Hashtags recomendados</h3><p>${hashtags}</p>
    <h3>Observaciones</h3><p>${ac.observaciones || ''}</p>
  </div>
  <div class="section">
    <h2>Estrategia Organica</h2>
    <p style="font-size:0.95em;white-space:pre-line">${ac.estrategia_organica || 'N/A'}</p>
  </div>
  <div class="section"><h2>Plan Semanal de Contenido</h2>
    <div class="plan-grid">${planSemanal}</div>
  </div>
  <div class="charts-row"><div class="chart-box"><canvas id="dayChart"></canvas></div><div class="chart-box"><canvas id="reachChart"></canvas></div></div>
  <div class="section"><h2>Top Posts del Periodo</h2>${topPostsHtml}</div>
  <div class="section">
    <h2>Audiencia y Sentimiento</h2>
    <p><strong>Sentimiento general:</strong> ${aa.sentimiento_general || 'N/A'}</p>
    <p><strong>Nivel de interaccion:</strong> ${aa.nivel_interaccion || 'N/A'}</p>
    <p>${aa.comentarios_destacados || ''}</p>
    <h3>Temas mencionados</h3><p>${temasMencionados}</p>
  </div>
</div>

<!-- TAB: CAMPANAS PAGAS -->
<div class="tab-content" id="tab-campaigns">
  <div class="section"><h2>Campanas Pagas Recomendadas</h2>${campañasHtml}</div>
</div>

<!-- TAB: BOT IA -->
<div class="tab-content" id="tab-bot">
  <div class="stats-grid">
    <div class="stat-card"><div class="number">${(cl.total || 0).toLocaleString()}</div><div class="label">Comentarios procesados</div></div>
    <div class="stat-card"><div class="number">${(cl.respondidos || 0).toLocaleString()}</div><div class="label">Respuestas enviadas</div></div>
    <div class="stat-card"><div class="number">${cl.tasa_respuesta || 0}%</div><div class="label">Tasa de respuesta</div></div>
    <div class="stat-card"><div class="number">${(cl.inapropiados || 0).toLocaleString()}</div><div class="label">Filtrados</div></div>
    <div class="stat-card"><div class="number">${(cl.dm_enviados || 0).toLocaleString()}</div><div class="label">DMs enviados</div></div>
    <div class="stat-card"><div class="number">${(cl.usuarios_unicos || 0).toLocaleString()}</div><div class="label">Usuarios unicos</div></div>
  </div>

  <div class="section">
    <h2>Rendimiento del Bot</h2>
    <p style="font-size:0.95em;margin-bottom:6px">${bot.resumen_rendimiento || bot.resumen || 'N/A'}</p>
    <p style="font-size:0.85em;color:var(--primary);font-weight:600">${bot.metricas_clave_bot || ''}</p>
  </div>

  <div class="section">
    <h2>Resumen de Actividad</h2>
    <div class="chart-box" style="height:360px"><canvas id="botCombinedChart"></canvas></div>
  </div>

  ${temasHtml ? `<div class="section"><h2>Temas de Comentarios</h2><p style="font-size:0.85em;color:var(--muted-fg);margin-bottom:10px">Comentarios agrupados por patron detectado. Haz clic en cada tema para ver los comentarios.</p>${temasHtml}</div>` : ''}

  ${formasHtml ? `<div class="section"><h2>Formas de Respuesta para tu BDM</h2><p style="font-size:0.88em;color:var(--muted-fg);margin-bottom:12px">Patrones detectados en los comentarios. Puedes copiar estas reglas a tu base de datos para mejorar las respuestas del bot.</p>${formasHtml}</div>` : ''}

  <div class="section"><h2>Detalle por Plataforma</h2>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${plataformasHtml}</div>
  </div>

  <div class="section"><h2>Log de Interacciones</h2>
    <input type="text" class="filter-input" id="commentFilter" placeholder="Buscar en interacciones..." oninput="filterComments()">
    <div style="overflow-x:auto"><table class="log-table" id="commentsTable">
      <thead><tr><th>Fecha</th><th>Plataforma</th><th>Comentario</th><th>Respuesta Bot</th><th>Estado</th><th>DM</th></tr></thead>
      <tbody>${botSampleHtml}</tbody>
    </table></div>
  </div>
</div>

<div class="footer">
  Generado por <a href="https://www.crecetec.com" target="_blank">CreceTec</a> Analytics v3 · ${fechaGen}<br>
  <span style="font-size:0.9em">@${username} · ${sitioWeb}</span>
</div>
</div>

<script>
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+tabId).classList.add('active');
  event.target.classList.add('active');
}
function filterComments() {
  const q = document.getElementById('commentFilter').value.toLowerCase();
  document.querySelectorAll('#commentsTable tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
function toggleTema(el) {
  const panel = el.nextElementSibling;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  el.querySelector('.arrow').innerHTML = isOpen ? '&#9654;' : '&#9660;';
  if(!isOpen) {
    el.closest('.card').scrollIntoView({behavior:'smooth',block:'start'});
  }
}
const dailyData = ${JSON.stringify(dailyData)};
const byType = ${JSON.stringify(byType)};
const byDay = ${JSON.stringify(byDay)};
const commentsByDate = ${JSON.stringify(commentsByDate)};
const botByDateResp = ${JSON.stringify(botByDateResp)};
const botByDateInap = ${JSON.stringify(botByDateInap)};
const botByDateDm = ${JSON.stringify(botByDateDm)};
const clasificacion = ${JSON.stringify(clasificacion)};
const porSemana = ${JSON.stringify(porSemana)};
const colors = { navy:'rgba(46,61,96,0.85)', red:'rgba(202,53,43,0.85)', green:'rgba(0,199,88,0.85)', blue:'rgba(48,128,255,0.85)', orange:'rgba(254,110,0,0.85)', muted:'rgba(106,114,130,0.5)' };
const textColor = '#222939';
const mutedColor = '#6a7282';
const axisOpts = (xLabel, yLabel) => ({
  responsive:true,
  plugins:{legend:{labels:{color:mutedColor,font:{family:'Inter'}}}},
  scales:{
    x:{title:{display:true,text:xLabel,color:mutedColor,font:{family:'Inter',weight:'600',size:12}},ticks:{color:mutedColor,maxRotation:45},grid:{color:'rgba(219,223,230,0.5)'}},
    y:{title:{display:true,text:yLabel,color:mutedColor,font:{family:'Inter',weight:'600',size:12}},ticks:{color:mutedColor},grid:{color:'rgba(219,223,230,0.5)'}}
  }
});
/* Crecimiento Acumulado de Engagement */
if(dailyData.length) {
  const dateAgg = {};
  dailyData.forEach(d => {
    if(!dateAgg[d.date]) dateAgg[d.date] = {likes:0,comments:0,reach:0};
    dateAgg[d.date].likes += d.likes;
    dateAgg[d.date].comments += d.comments;
    dateAgg[d.date].reach += d.reach;
  });
  const sortedDates = Object.keys(dateAgg).sort();
  let cumL=0,cumC=0,cumR=0;
  const cumLA=[],cumCA=[],cumRA=[];
  sortedDates.forEach(dt => {
    cumL += dateAgg[dt].likes; cumC += dateAgg[dt].comments; cumR += dateAgg[dt].reach;
    cumLA.push(cumL); cumCA.push(cumC); cumRA.push(cumR);
  });
  const dsEng = [
    {label:'Likes acumulados',data:cumLA,borderColor:'rgba(46,61,96,1)',backgroundColor:'rgba(46,61,96,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'rgba(46,61,96,1)'},
    {label:'Comentarios acumulados',data:cumCA,borderColor:'rgba(202,53,43,1)',backgroundColor:'rgba(202,53,43,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'rgba(202,53,43,1)'}
  ];
  if(cumRA.some(v=>v>0)) dsEng.push({label:'Alcance acumulado',data:cumRA,borderColor:'rgba(48,128,255,1)',backgroundColor:'rgba(48,128,255,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'rgba(48,128,255,1)'});
  new Chart(document.getElementById('cumulativeEngagementChart'), {
    type:'line',
    data:{ labels:sortedDates, datasets:dsEng },
    options:{...axisOpts('Fecha','Total acumulado'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Crecimiento Acumulado de Engagement',color:textColor,font:{family:'Poppins',weight:'600'}}},interaction:{mode:'index',intersect:false},maintainAspectRatio:false}
  });
}
/* Historia del Bot */
const allBotDates = [...new Set([...Object.keys(commentsByDate),...Object.keys(botByDateResp),...Object.keys(botByDateInap),...Object.keys(botByDateDm)])].sort();
if(allBotDates.length) {
  let cR=0,cI=0,cD=0;
  const cRA=[],cIA=[],cDA=[];
  allBotDates.forEach(dt => {
    cR += (botByDateResp[dt]||0); cI += (botByDateInap[dt]||0); cD += (botByDateDm[dt]||0);
    cRA.push(cR); cIA.push(cI); cDA.push(cD);
  });
  new Chart(document.getElementById('cumulativeBotChart'), {
    type:'line',
    data:{
      labels:allBotDates,
      datasets:[
        {label:'Respondidos acumulados',data:cRA,borderColor:'rgba(0,199,88,1)',backgroundColor:'rgba(0,199,88,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'rgba(0,199,88,1)'},
        {label:'Inapropiados filtrados',data:cIA,borderColor:'rgba(202,53,43,1)',backgroundColor:'rgba(202,53,43,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'rgba(202,53,43,1)'},
        {label:'DMs enviados',data:cDA,borderColor:'rgba(48,128,255,1)',backgroundColor:'rgba(48,128,255,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'rgba(48,128,255,1)'}
      ]
    },
    options:{...axisOpts('Fecha','Total acumulado'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Historia del Bot: Interacciones Acumuladas',color:textColor,font:{family:'Poppins',weight:'600'}}},interaction:{mode:'index',intersect:false},maintainAspectRatio:false}
  });
}
/* Tendencia Likes */
if(dailyData.length) { new Chart(document.getElementById('likesTimelineChart'), { type:'line', data:{ labels:dailyData.map(d=>d.date), datasets:[{label:'Likes por publicacion',data:dailyData.map(d=>d.likes),borderColor:'rgba(46,61,96,1)',backgroundColor:'rgba(46,61,96,0.08)',fill:true,tension:0.4,pointBackgroundColor:'rgba(46,61,96,1)',pointRadius:4}] }, options:{...axisOpts('Fecha de publicacion','Likes'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Evolucion de Likes por Publicacion',color:textColor,font:{family:'Poppins',weight:'600'}}}} }); }
/* Tendencia Comentarios */
if(dailyData.length) { new Chart(document.getElementById('commentsTimelineChart'), { type:'line', data:{ labels:dailyData.map(d=>d.date), datasets:[{label:'Comentarios por publicacion',data:dailyData.map(d=>d.comments),borderColor:'rgba(202,53,43,1)',backgroundColor:'rgba(202,53,43,0.08)',fill:true,tension:0.4,pointBackgroundColor:'rgba(202,53,43,1)',pointRadius:4}] }, options:{...axisOpts('Fecha de publicacion','Comentarios'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Evolucion de Comentarios por Publicacion',color:textColor,font:{family:'Poppins',weight:'600'}}}} }); }
/* Engagement Likes+Comments */
if(dailyData.length) { new Chart(document.getElementById('overviewChart'), { type:'bar', data:{ labels:dailyData.map(d=>d.date), datasets:[{label:'Likes',data:dailyData.map(d=>d.likes),backgroundColor:colors.navy,borderRadius:4},{label:'Comentarios',data:dailyData.map(d=>d.comments),backgroundColor:colors.red,borderRadius:4}] }, options:{...axisOpts('Fecha de publicacion','Cantidad'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Engagement por Publicacion',color:textColor,font:{family:'Poppins',weight:'600'}}}} }); }
/* Tipo de contenido */
if(Object.keys(byType).length) { const t=Object.keys(byType); new Chart(document.getElementById('typeChart'), { type:'doughnut', data:{ labels:t.map(k=>k+' ('+byType[k].count+' posts)'),datasets:[{data:t.map(k=>byType[k].likes+byType[k].comments),backgroundColor:[colors.navy,colors.red,colors.green,colors.blue,colors.orange]}] }, options:{responsive:true,plugins:{title:{display:true,text:'Engagement Total por Tipo de Contenido',color:textColor,font:{family:'Poppins',weight:'600'}},legend:{labels:{color:mutedColor,font:{family:'Inter'}}}}} }); }
/* Actividad por dia */
if(Object.keys(byDay).length) { const d=Object.keys(byDay); new Chart(document.getElementById('dayChart'), { type:'bar', data:{ labels:d,datasets:[{label:'N publicaciones',data:d.map(k=>byDay[k].count),backgroundColor:colors.navy,borderRadius:4},{label:'Likes acumulados',data:d.map(k=>byDay[k].likes),backgroundColor:colors.orange,borderRadius:4}] }, options:{...axisOpts('Dia de la semana','Cantidad'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Rendimiento por Dia de la Semana',color:textColor,font:{family:'Poppins',weight:'600'}}}} }); }
/* Alcance por post */
if(dailyData.length && dailyData.some(d=>d.reach>0)) { new Chart(document.getElementById('reachChart'), { type:'line', data:{ labels:dailyData.map(d=>d.date), datasets:[{label:'Alcance (personas)',data:dailyData.map(d=>d.reach),borderColor:'rgba(46,61,96,1)',backgroundColor:'rgba(46,61,96,0.08)',fill:true,tension:0.4,pointBackgroundColor:'rgba(46,61,96,1)',pointRadius:3}] }, options:{...axisOpts('Fecha de publicacion','Personas alcanzadas'),plugins:{...axisOpts('','').plugins,title:{display:true,text:'Alcance por Publicacion',color:textColor,font:{family:'Poppins',weight:'600'}}}} }); }
/* Bot combinado */
const weekKeys = Object.keys(porSemana).sort();
if(weekKeys.length >= 1) {
  const wkResp = weekKeys.map(w=>porSemana[w].respondidos);
  const wkInap = weekKeys.map(w=>porSemana[w].inapropiados);
  const wkNoResp = weekKeys.map(w=>porSemana[w].total - porSemana[w].respondidos - porSemana[w].inapropiados);
  const wkTasa = weekKeys.map(w=>porSemana[w].tasa_respuesta);
  new Chart(document.getElementById('botCombinedChart'), {
    type:'bar',
    data:{
      labels:weekKeys,
      datasets:[
        {label:'Positivos respondidos',data:wkResp,backgroundColor:'rgba(0,199,88,0.8)',borderRadius:4,stack:'vol',yAxisID:'y'},
        {label:'Inapropiados/Spam filtrados',data:wkInap,backgroundColor:'rgba(202,53,43,0.8)',borderRadius:4,stack:'vol',yAxisID:'y'},
        {label:'Sin respuesta',data:wkNoResp,backgroundColor:'rgba(106,114,130,0.4)',borderRadius:4,stack:'vol',yAxisID:'y'},
        {label:'Tasa de respuesta (%)',data:wkTasa,type:'line',borderColor:'rgba(48,128,255,1)',backgroundColor:'rgba(48,128,255,0.08)',fill:false,tension:0.4,pointRadius:5,pointBackgroundColor:'rgba(48,128,255,1)',borderWidth:3,yAxisID:'y1'}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        title:{display:true,text:'Resumen Semanal del Bot: Volumen + Tasa de Respuesta',color:textColor,font:{family:'Poppins',weight:'600'}},
        legend:{labels:{color:mutedColor,font:{family:'Inter'}}}
      },
      scales:{
        x:{ticks:{color:mutedColor},grid:{color:'rgba(219,223,230,0.5)'}},
        y:{position:'left',title:{display:true,text:'Comentarios',color:mutedColor,font:{family:'Inter',weight:'600',size:12}},ticks:{color:mutedColor},grid:{color:'rgba(219,223,230,0.5)'},stacked:true},
        y1:{position:'right',title:{display:true,text:'Tasa (%)',color:mutedColor,font:{family:'Inter',weight:'600',size:12}},ticks:{color:'rgba(48,128,255,1)'},min:0,max:100,grid:{drawOnChartArea:false}}
      }
    }
  });
}
</script>
</body></html>`

  return html
}

// ============================================
// MAIN ORCHESTRATOR
// ============================================

/**
 * Genera un informe RRSS completo para una marca
 * @param {number} idMarca - ID de la marca
 * @param {string} periodoDesde - Fecha inicio (YYYY-MM-DD)
 * @param {string} periodoHasta - Fecha fin (YYYY-MM-DD)
 * @param {boolean} guardar - Si guardar en Supabase (default true)
 * @returns {Promise<{success: boolean, html?: string, resumen?: Object, error?: string}>}
 */
export async function generarInformeRRSS(idMarca, periodoDesde, periodoHasta, guardar = true) {
  console.log(`\nGenerando informe RRSS para marca ${idMarca}: ${periodoDesde} → ${periodoHasta}`)

  // 1. Get account data
  const cuenta = await obtenerDatosCuenta(idMarca)
  if (!cuenta) {
    return { success: false, error: 'No se encontró cuenta de Instagram vinculada a esta marca. Conecta tu cuenta de Instagram primero.' }
  }

  const { page_id, page_name, instagram_id, instagram_name, access_token, sitio_web } = cuenta

  // Verify token works
  const test = await apiGet(`${GRAPH_API_URL}/${instagram_id}`, {
    fields: 'id',
    access_token
  }, 'token check')

  if (!test) {
    return { success: false, error: 'Token de Instagram expirado. Reconecta tu cuenta desde la configuracion de Facebook/Instagram.' }
  }

  const sinceTs = Math.floor(new Date(periodoDesde).getTime() / 1000)
  const untilTs = Math.floor(new Date(periodoHasta).getTime() / 1000) + 86400

  const report = {
    marca: page_name,
    instagram_name,
    instagram_id,
    periodo: { desde: periodoDesde, hasta: periodoHasta },
    sitio_web: sitio_web || '',
    brand_analysis: { brand_profile: {}, competitors: {}, market_positioning: {} }
  }

  // 2. Profile
  console.log('  1. Perfil...')
  report.perfil = await getAccountProfile(instagram_id, access_token)

  // 3. Account insights
  console.log('  2. Insights...')
  report.account_insights = await getAccountInsights(instagram_id, access_token, sinceTs, untilTs)

  // 4. Posts with metrics
  console.log('  3. Posts...')
  report.posts = await getPostsWithMetrics(instagram_id, access_token, periodoDesde, periodoHasta)

  // 5. Stories
  console.log('  4. Stories...')
  report.stories = await getStoriesMetrics(instagram_id, access_token)

  // 6. Ads
  console.log('  5. Ads...')
  report.ads = await getAdsData(page_id, access_token, periodoDesde, periodoHasta)

  // 7. Comment logs
  console.log('  6. Logs comentarios...')
  report.comment_logs = await getCommentLogs(instagram_id, periodoDesde, periodoHasta)

  // 8. Calculate summary metrics
  const posts = report.posts || []
  const perfil = report.perfil || {}
  const tl = posts.reduce((s, p) => s + (p.like_count || 0), 0)
  const tc = posts.reduce((s, p) => s + (p.comments_count || 0), 0)
  const tr = posts.reduce((s, p) => s + (p.insights?.reach || 0), 0)
  const ti = posts.reduce((s, p) => s + (p.insights?.impressions || 0), 0)
  const ts = posts.reduce((s, p) => s + (p.insights?.saved || 0), 0)
  const tsh = posts.reduce((s, p) => s + (p.insights?.shares || 0), 0)
  const fc = perfil.followers_count || 1

  let postsPerWeek = posts.length
  let daysSpan = 1
  if (posts.length >= 2) {
    const datesSorted = posts.map(p => (p.timestamp || '').substring(0, 10)).filter(Boolean).sort()
    const firstD = new Date(datesSorted[0])
    const lastD = new Date(datesSorted[datesSorted.length - 1])
    daysSpan = Math.max(Math.round((lastD - firstD) / 86400000), 1)
    postsPerWeek = Math.round(posts.length / daysSpan * 70) / 10
  }

  // Trend analysis
  const half = Math.floor(posts.length / 2)
  const sortedPosts = [...posts].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  const firstHalf = half > 0 ? sortedPosts.slice(0, half) : []
  const secondHalf = half > 0 ? sortedPosts.slice(half) : sortedPosts

  const fhLikes = firstHalf.reduce((s, p) => s + (p.like_count || 0), 0)
  const shLikes = secondHalf.reduce((s, p) => s + (p.like_count || 0), 0)
  const fhAvg = firstHalf.length ? Math.round(fhLikes / firstHalf.length * 10) / 10 : 0
  const shAvg = secondHalf.length ? Math.round(shLikes / secondHalf.length * 10) / 10 : 0
  const likesTrendPct = Math.round((shAvg - fhAvg) / Math.max(fhAvg, 1) * 1000) / 10

  const fhComments = firstHalf.reduce((s, p) => s + (p.comments_count || 0), 0)
  const shComments = secondHalf.reduce((s, p) => s + (p.comments_count || 0), 0)
  const fhCavg = firstHalf.length ? Math.round(fhComments / firstHalf.length * 10) / 10 : 0
  const shCavg = secondHalf.length ? Math.round(shComments / secondHalf.length * 10) / 10 : 0
  const commentsTrendPct = Math.round((shCavg - fhCavg) / Math.max(fhCavg, 1) * 1000) / 10

  report.resumen = {
    total_posts: posts.length, total_likes: tl, total_comments: tc,
    total_reach: tr, total_impressions: ti, total_saves: ts, total_shares: tsh,
    avg_likes: posts.length ? Math.round(tl / posts.length * 10) / 10 : 0,
    avg_comments: posts.length ? Math.round(tc / posts.length * 10) / 10 : 0,
    avg_reach: posts.length ? Math.round(tr / posts.length * 10) / 10 : 0,
    engagement_rate: posts.length ? Math.round(((tl + tc + ts + tsh) / (fc * Math.max(posts.length, 1))) * 10000) / 100 : 0,
    posts_per_week: postsPerWeek,
    days_span: daysSpan,
    likes_trend_pct: likesTrendPct,
    comments_trend_pct: commentsTrendPct,
    first_half_avg_likes: fhAvg,
    second_half_avg_likes: shAvg,
    first_half_avg_comments: fhCavg,
    second_half_avg_comments: shCavg,
    likes_per_day: Math.round(tl / Math.max(daysSpan, 1) * 10) / 10,
    comments_per_day: Math.round(tc / Math.max(daysSpan, 1) * 10) / 10
  }

  // Top posts
  if (posts.length) {
    report.top_posts = {
      by_likes: [...posts].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 3),
      by_comments: [...posts].sort((a, b) => (b.comments_count || 0) - (a.comments_count || 0)).slice(0, 3),
      by_reach: [...posts].sort((a, b) => (b.insights?.reach || 0) - (a.insights?.reach || 0)).slice(0, 3)
    }
  }

  // By content type
  const byType = {}
  for (const p of posts) {
    const mt = p.media_type || 'IMAGE'
    if (!byType[mt]) byType[mt] = { count: 0, likes: 0, comments: 0, reach: 0, saves: 0 }
    byType[mt].count++
    byType[mt].likes += p.like_count || 0
    byType[mt].comments += p.comments_count || 0
    byType[mt].reach += p.insights?.reach || 0
    byType[mt].saves += p.insights?.saved || 0
  }
  report.by_content_type = byType

  // By weekday
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
  const byWeekday = {}
  for (const p of posts) {
    try {
      const dt = new Date(p.timestamp?.replace('Z', '+00:00'))
      const dayName = dayNames[dt.getDay()]
      if (!byWeekday[dayName]) byWeekday[dayName] = { count: 0, likes: 0, reach: 0 }
      byWeekday[dayName].count++
      byWeekday[dayName].likes += p.like_count || 0
      byWeekday[dayName].reach += p.insights?.reach || 0
    } catch { /* skip */ }
  }
  report.by_weekday = byWeekday

  // All comments
  const allComments = []
  for (const p of posts) {
    for (const c of (p.comments_detail || [])) {
      allComments.push({ text: c.text || '', username: c.username || '', likes: c.like_count || 0 })
    }
  }
  report.all_comments = allComments

  // 9. GPT Analysis
  console.log('  7. Analisis GPT-4o...')
  const analysis = await analyzeWithGPT(report)
  report.gpt_analysis = analysis

  // 10. Generate HTML
  console.log('  8. Generando HTML...')
  const html = generateHTMLReport(report, analysis)

  // 11. Save to Supabase
  let guardado = false
  let htmlGuardado = false
  let guardarError = null

  if (guardar) {
    try {
      console.log('  9. Guardando en Supabase...')
      const cl = report.comment_logs || {}
      const gptAnalysis = analysis || {}
      const brandProfile = gptAnalysis.brand_profile || gptAnalysis.perfil_marca || {}
      const competitors = gptAnalysis.competitors || gptAnalysis.competidores || null

      // engagement_rate es numeric(5,2) → max 999.99
      let engRate = parseFloat(report.resumen.engagement_rate) || 0
      if (isNaN(engRate) || engRate > 999.99) engRate = Math.min(engRate, 999.99)
      engRate = Math.round(engRate * 100) / 100

      const igId = String(report.instagram_id || '')
      const marca = String(report.marca || '')

      // Sanitizar HTML: eliminar NUL bytes y caracteres problemáticos para PostgreSQL
      let htmlSanitizado = html || ''
      htmlSanitizado = htmlSanitizado.replace(/\0/g, '') // NUL bytes rompen text de PostgreSQL

      console.log(`  [SAVE] instagram_id="${igId}" marca="${marca}" periodo=${periodoDesde}→${periodoHasta}`)
      console.log(`  [SAVE] posts=${report.resumen.total_posts} engagement=${engRate} html_size=${htmlSanitizado.length}`)

      if (!igId) {
        throw new Error('instagram_id está vacío, no se puede guardar')
      }

      // Preparar datos SIN html (se agrega por separado)
      const saveDataBase = {
        instagram_id: igId,
        nombre_marca: marca,
        periodo_desde: periodoDesde,
        periodo_hasta: periodoHasta,
        total_posts: parseInt(report.resumen.total_posts) || 0,
        total_likes: parseInt(report.resumen.total_likes) || 0,
        total_comments: parseInt(report.resumen.total_comments) || 0,
        total_reach: parseInt(report.resumen.total_reach) || 0,
        total_impressions: parseInt(report.resumen.total_impressions) || 0,
        total_saves: parseInt(report.resumen.total_saves) || 0,
        total_shares: parseInt(report.resumen.total_shares) || 0,
        engagement_rate: engRate,
        followers_count: parseInt(perfil.followers_count) || 0,
        bot_total: parseInt(cl.total) || 0,
        bot_respondidos: parseInt(cl.respondidos) || 0,
        bot_inapropiados: parseInt(cl.inapropiados) || 0,
        industria: String(brandProfile.industria || brandProfile.industry || '').substring(0, 255),
        sub_industria: String(brandProfile.sub_industria || brandProfile.sub_industry || '').substring(0, 255),
        sitio_web_analizado: String(report.sitio_web || '').substring(0, 500),
        competidores_detectados: competitors || null,
        analisis_gpt: gptAnalysis || null,
        metricas_raw: {
          resumen: report.resumen,
          by_content_type: report.by_content_type || {},
          by_weekday: report.by_weekday || {},
          top_posts: report.top_posts || {},
          account_insights: report.account_insights || {},
          stories_count: (report.stories || []).length,
          ads_count: (report.ads || []).length,
          comment_logs: cl
        },
        fecha_generacion: new Date().toISOString(),
        version_analyzer: 'v3-panel'
      }

      // Estrategia: CHECK → INSERT o UPDATE (sin html) → UPDATE html por separado
      // Paso 1: Verificar si ya existe
      const { data: existing, error: checkErr } = await supabase
        .from('informes_instagram')
        .select('id')
        .eq('instagram_id', igId)
        .eq('periodo_desde', periodoDesde)
        .eq('periodo_hasta', periodoHasta)
        .maybeSingle()

      if (checkErr) {
        console.error(`  [SAVE] Error verificando existencia: [${checkErr.code}] ${checkErr.message}`)
      }

      let rowId = existing?.id || null

      if (rowId) {
        // Paso 2A: UPDATE registro existente (sin HTML)
        console.log(`  [SAVE] Registro existente (id: ${rowId}), actualizando...`)
        const { error: updateErr } = await supabase
          .from('informes_instagram')
          .update(saveDataBase)
          .eq('id', rowId)

        if (!updateErr) {
          console.log(`  ✅ Datos actualizados (id: ${rowId})`)
          guardado = true
        } else {
          console.error(`  ❌ UPDATE falló: [${updateErr.code}] ${updateErr.message} | ${updateErr.details || ''} | ${updateErr.hint || ''}`)
          guardarError = `UPDATE: ${updateErr.message}`
        }
      } else {
        // Paso 2B: INSERT nuevo registro (sin HTML)
        console.log(`  [SAVE] No existe, insertando...`)
        const { data: insertData, error: insertErr } = await supabase
          .from('informes_instagram')
          .insert(saveDataBase)
          .select('id')

        if (!insertErr && insertData?.[0]?.id) {
          rowId = insertData[0].id
          console.log(`  ✅ Datos insertados (id: ${rowId})`)
          guardado = true
        } else {
          const err = insertErr || { message: 'No se retornó ID' }
          console.error(`  ❌ INSERT falló: [${err.code || ''}] ${err.message} | ${err.details || ''} | ${err.hint || ''}`)
          guardarError = `INSERT: ${err.message}`
        }
      }

      // Paso 3: Agregar HTML por separado como Base64
      // Base64 evita problemas de caracteres Unicode/control que rompen JSON serialization
      if (guardado && rowId && htmlSanitizado) {
        const htmlBase64 = Buffer.from(htmlSanitizado, 'utf-8').toString('base64')
        const htmlConPrefijo = `base64:${htmlBase64}`
        console.log(`  [SAVE] Guardando HTML como Base64 (${htmlSanitizado.length.toLocaleString()} chars → ${htmlConPrefijo.length.toLocaleString()} b64) en id: ${rowId}...`)

        const { error: htmlErr } = await supabase
          .from('informes_instagram')
          .update({ html_informe: htmlConPrefijo })
          .eq('id', rowId)

        if (!htmlErr) {
          console.log(`  ✅ HTML guardado OK (base64)`)
          htmlGuardado = true
        } else {
          console.error(`  ❌ HTML UPDATE falló: [${htmlErr.code}] ${htmlErr.message} | ${htmlErr.details || ''} | ${htmlErr.hint || ''}`)
          guardarError = `Datos guardados, pero HTML falló: ${htmlErr.message}`
        }
      }
    } catch (saveException) {
      console.error(`  ❌ EXCEPCIÓN guardando informe:`, saveException)
      guardarError = saveException.message
    }
  }

  console.log(`  Informe generado: ${html.length.toLocaleString()} chars | guardado: ${guardado} | html: ${htmlGuardado}`)

  return {
    success: true,
    html,
    resumen: report.resumen,
    marca: report.marca,
    instagram_name: report.instagram_name,
    periodo: report.periodo,
    guardado,
    htmlGuardado,
    guardarError
  }
}
