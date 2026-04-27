-- =====================================================
-- MIGRACION: Chat Numancia
-- Sistema de configuracion de chatbot desde panel CreceTec
-- Replica estructural de migracion_chat_academico.sql
-- =====================================================
-- ID Marca Numancia: 6473892
-- Backend paralelo: Next.js 16 en Vercel (chat-numancia-api)
-- Canales: WebChat (numanciasports.cl) + WhatsApp (MessageBird)
-- =====================================================

-- =====================================================
-- 1. CREAR TABLAS
-- =====================================================

-- Tabla principal de configuracion (1 fila por marca)
CREATE TABLE IF NOT EXISTS chat_numancia_config (
  id                          SERIAL PRIMARY KEY,
  id_marca                    BIGINT NOT NULL UNIQUE,

  -- API Key publica para el widget (rotable desde el panel)
  api_key                     UUID NOT NULL DEFAULT gen_random_uuid(),

  -- System Prompt (4 secciones + inyeccion dinamica desde base_cuentas)
  prompt_rol                  TEXT DEFAULT '',
  prompt_estilo               TEXT DEFAULT '',
  prompt_reglas               TEXT DEFAULT '',
  prompt_consideraciones      TEXT DEFAULT '',

  -- Parametros de conversacion
  tiempo_espera_respuesta     INTEGER DEFAULT 120,
  intentos_reactivacion       INTEGER DEFAULT 1,
  mensaje_bienvenida          TEXT DEFAULT 'Hola, soy el asistente virtual de Numancia. ¿En qué puedo ayudarte?',
  mensaje_reactivacion        TEXT DEFAULT '¿Sigues ahí? Si tienes más consultas, escríbeme cuando quieras.',
  mensaje_despedida           TEXT DEFAULT '¡Gracias por contactarte con Numancia! Que tengas un excelente día.',
  mensaje_timeout             TEXT DEFAULT 'Se acabó el tiempo de espera. Puedes escribirnos nuevamente cuando quieras.',
  mensaje_error               TEXT DEFAULT 'Lo siento, ocurrió un error. Intenta nuevamente más tarde.',
  webhook_derivacion          TEXT DEFAULT '',
  webhook_callback            TEXT DEFAULT '',

  -- Parametros del modelo IA
  modelo_ia                   TEXT DEFAULT 'gpt-4o',
  temperatura                 REAL DEFAULT 0.6,
  max_tokens                  INTEGER DEFAULT 1500,
  parallel_tool_calls         BOOLEAN DEFAULT true,
  max_mensajes_conversacion   INTEGER DEFAULT 60,
  max_tokens_contexto         INTEGER DEFAULT 100000,
  max_iteraciones_tools       INTEGER DEFAULT 3,

  -- Personalizacion del widget webchat
  widget_color_primario       TEXT DEFAULT '#1a3a6b',
  widget_color_texto_header   TEXT DEFAULT '#ffffff',
  widget_posicion             TEXT DEFAULT 'bottom-right',
  widget_tamano               TEXT DEFAULT 'normal',
  widget_titulo               TEXT DEFAULT 'Numancia Sports',
  widget_logo_url             TEXT DEFAULT '',
  widget_activo               BOOLEAN DEFAULT true,

  -- Multi-canal (["webchat","whatsapp"])
  canales_activos             JSONB DEFAULT '["webchat","whatsapp"]'::jsonb,

  -- Inyectar conocimiento dinamico desde base_cuentas (solo filas activas)
  usar_base_cuentas           BOOLEAN DEFAULT true,

  -- Auditoria
  creado_en                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_por             TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_numancia_config_marca
  ON chat_numancia_config(id_marca);
CREATE INDEX IF NOT EXISTS idx_chat_numancia_config_api_key
  ON chat_numancia_config(api_key);


-- Tabla de herramientas/tools (N por marca)
CREATE TABLE IF NOT EXISTS chat_numancia_herramientas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_marca          BIGINT NOT NULL,
  nombre            VARCHAR(100) NOT NULL,
  nombre_display    VARCHAR(200),
  descripcion       TEXT NOT NULL DEFAULT '',
  tipo              VARCHAR(50) NOT NULL DEFAULT 'respuesta_fija'
                    CHECK (tipo IN ('respuesta_fija', 'base_cuentas', 'custom_python', 'flujo')),
  respuesta_texto   TEXT DEFAULT '',
  -- Para tipo 'base_cuentas': filtro por categoria y/o clave a buscar
  base_cuentas_filtro JSONB DEFAULT '{}'::jsonb,
  id_flujo          UUID,
  parametros_openai JSONB DEFAULT '{}'::jsonb,
  activo            BOOLEAN NOT NULL DEFAULT true,
  es_semilla        BOOLEAN NOT NULL DEFAULT false,
  orden             INTEGER DEFAULT 0,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_por   TEXT,

  UNIQUE(id_marca, nombre)
);

CREATE INDEX IF NOT EXISTS idx_chat_numancia_herramientas_marca
  ON chat_numancia_herramientas(id_marca);
CREATE INDEX IF NOT EXISTS idx_chat_numancia_herramientas_activo
  ON chat_numancia_herramientas(id_marca, activo);


-- Tabla de historial de cambios (audit log)
CREATE TABLE IF NOT EXISTS chat_numancia_historial (
  id              SERIAL PRIMARY KEY,
  id_marca        BIGINT NOT NULL,
  usuario_nombre  TEXT,
  seccion         VARCHAR(50) NOT NULL,
  accion          VARCHAR(50) NOT NULL,
  detalle         JSONB,
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_numancia_historial_marca
  ON chat_numancia_historial(id_marca);
CREATE INDEX IF NOT EXISTS idx_chat_numancia_historial_fecha
  ON chat_numancia_historial(creado_en DESC);


-- Tabla de estado persistido de conversaciones
CREATE TABLE IF NOT EXISTS chat_numancia_conversaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_marca          BIGINT NOT NULL,
  conversation_id   TEXT NOT NULL,
  canal             TEXT DEFAULT 'webchat' CHECK (canal IN ('webchat','whatsapp','instagram')),
  phone             TEXT,
  channel_id        TEXT,
  messages          JSONB NOT NULL DEFAULT '[]'::jsonb,
  intentos_reactivacion INTEGER DEFAULT 0,
  estado            TEXT DEFAULT 'activa' CHECK (estado IN ('activa','finalizada','derivada','timeout')),
  creado_en         TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_cn_conv_conversation
  ON chat_numancia_conversaciones(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cn_conv_marca
  ON chat_numancia_conversaciones(id_marca);
CREATE INDEX IF NOT EXISTS idx_cn_conv_estado
  ON chat_numancia_conversaciones(estado);


-- Tabla de deduplicacion de webhooks (TTL 24h)
CREATE TABLE IF NOT EXISTS chat_numancia_mensajes_procesados (
  message_id    TEXT PRIMARY KEY,
  procesado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cn_dedup_fecha
  ON chat_numancia_mensajes_procesados(procesado_en);


-- =====================================================
-- 2. INSERTAR CONFIGURACION NUMANCIA
-- =====================================================

INSERT INTO chat_numancia_config (
  id_marca,
  prompt_rol,
  prompt_estilo,
  prompt_reglas,
  prompt_consideraciones,
  tiempo_espera_respuesta,
  intentos_reactivacion,
  mensaje_bienvenida,
  mensaje_despedida,
  mensaje_error,
  modelo_ia,
  temperatura,
  max_tokens,
  parallel_tool_calls,
  canales_activos,
  widget_color_primario,
  widget_titulo,
  usar_base_cuentas,
  actualizado_por
) VALUES (
  6473892,

  -- prompt_rol
  'Eres el asistente virtual de Numancia Sports, tienda de artículos deportivos ubicada en Victorino Lastarria 138, Valparaíso, Chile. Atiendes consultas de clientes sobre productos, disponibilidad, horarios, ubicación, envíos y post-venta. Tu objetivo es entregar información precisa, generar confianza y orientar al cliente hacia una compra o visita a la tienda.',

  -- prompt_estilo
  'Utiliza un lenguaje cercano, natural y chileno, evitando tecnicismos innecesarios. Sé directo y amable. Si no posees información específica (precio exacto, stock, promoción vigente), deriva la consulta al equipo humano sin inventar datos. Usa emojis con moderación para humanizar la conversación. Responde de forma conversacional y adaptada al contexto.',

  -- prompt_reglas
  '- Saluda al inicio de la conversación (solo una vez).
- No inventes precios, stock ni promociones que no estén explícitamente confirmados.
- Si el cliente pregunta por un producto específico del que no tienes información, sugiere que contacte la tienda por teléfono o visite presencialmente.
- Para consultas de post-venta, garantías o reclamos complejos, deriva a un agente humano.
- Cuando detectes que el cliente terminó la conversación, despídete cordialmente.
- Si el cliente pide hablar con una persona real, incluye la señal [DERIVAR] al final de tu respuesta.
- Cuando la conversación termine naturalmente, incluye la señal [FIN_CONVERSACION].',

  -- prompt_consideraciones (se complementará con datos de base_cuentas)
  '- Numancia es una tienda física. Las consultas de stock y precios deben ser confirmadas por teléfono o en tienda.
- Horario de atención y datos de contacto se obtienen desde la base de conocimiento de la marca.
- El sitio web oficial es https://numanciasports.cl donde pueden ver el catálogo.',

  -- parametros conversacion
  120,
  1,
  'Hola, soy el asistente virtual de Numancia Sports. ¿En qué puedo ayudarte hoy? 🏀⚽',
  '¡Gracias por contactarte con Numancia! Que tengas un excelente día.',
  'Lo siento, ocurrió un error. Intenta nuevamente más tarde o llámanos al +56 9 9172 5737.',

  -- modelo
  'gpt-4o',
  0.6,
  1500,
  true,

  -- canales
  '["webchat","whatsapp"]'::jsonb,

  -- widget
  '#1a3a6b',
  'Numancia Sports',
  true,

  -- actualizado_por
  'migracion_inicial'

) ON CONFLICT (id_marca) DO NOTHING;


-- =====================================================
-- 3. INSERTAR HERRAMIENTAS SEMILLA
-- =====================================================

-- Tool 1: obtenerDatosContacto (lee desde base_cuentas id=385 automaticamente)
INSERT INTO chat_numancia_herramientas (
  id_marca, nombre, nombre_display, descripcion, tipo,
  respuesta_texto, base_cuentas_filtro, parametros_openai,
  activo, es_semilla, orden, actualizado_por
) VALUES (
  6473892,
  'obtenerDatosContacto',
  'Datos de Contacto',
  'Proporciona los datos de contacto de Numancia Sports (dirección, teléfonos, email, redes sociales). Úsala cuando el cliente pregunte por ubicación, cómo contactar, dónde están, etc.',
  'base_cuentas',
  '',
  '{"categoria":"info","clave":"Datos de Contacto"}'::jsonb,
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 1, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;


-- Tool 2: consultarHorarios
INSERT INTO chat_numancia_herramientas (
  id_marca, nombre, nombre_display, descripcion, tipo,
  respuesta_texto, base_cuentas_filtro, parametros_openai,
  activo, es_semilla, orden, actualizado_por
) VALUES (
  6473892,
  'consultarHorarios',
  'Horarios de Atención',
  'Proporciona los horarios de atención de la tienda. Úsala cuando el cliente pregunte a qué hora abren, si están abiertos, horario de fin de semana, etc.',
  'base_cuentas',
  'Actualmente no tenemos los horarios cargados en el sistema. Te recomiendo llamarnos al +56 9 9172 5737 o visitar nuestra tienda en Victorino Lastarria 138, Valparaíso.',
  '{"categoria":"info","clave":"Horarios"}'::jsonb,
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 2, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;


-- Tool 3: consultarProductos
INSERT INTO chat_numancia_herramientas (
  id_marca, nombre, nombre_display, descripcion, tipo,
  respuesta_texto, parametros_openai,
  activo, es_semilla, orden, actualizado_por
) VALUES (
  6473892,
  'consultarProductos',
  'Consultar Productos',
  'Orienta al cliente hacia el catálogo web o tienda física cuando pregunta por un producto específico (zapatillas, ropa deportiva, accesorios, etc.). No confirma precios ni stock.',
  'respuesta_fija',
  'Para ver todo nuestro catálogo actualizado con fotos y detalles, visita https://numanciasports.cl 🛍️

Si buscas algo específico o quieres confirmar stock y precio, puedes:
📞 Llamarnos al +56 9 9172 5737
📍 Visitarnos en Victorino Lastarria 138, Valparaíso
📱 Escribirnos por Instagram: @numanciasports

¿Qué producto específico estás buscando?',
  '{"type":"object","properties":{"producto":{"type":"string","description":"Nombre o categoría del producto que busca el cliente."}},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 3, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;


-- Tool 4: enviarUbicacion
INSERT INTO chat_numancia_herramientas (
  id_marca, nombre, nombre_display, descripcion, tipo,
  respuesta_texto, parametros_openai,
  activo, es_semilla, orden, actualizado_por
) VALUES (
  6473892,
  'enviarUbicacion',
  'Enviar Ubicación',
  'Proporciona la ubicación exacta con link a Google Maps. Úsala cuando el cliente pregunte cómo llegar, dónde están ubicados, link al mapa, etc.',
  'respuesta_fija',
  '📍 Estamos ubicados en Victorino Lastarria 138, Valparaíso, Chile.

Google Maps: https://maps.google.com/?q=Victorino+Lastarria+138+Valparaiso

¡Te esperamos! 🏪',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 4, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;


-- Tool 5: derivarConsultaAHumano
INSERT INTO chat_numancia_herramientas (
  id_marca, nombre, nombre_display, descripcion, tipo,
  respuesta_texto, parametros_openai,
  activo, es_semilla, orden, actualizado_por
) VALUES (
  6473892,
  'derivarConsultaAHumano',
  'Derivar a Humano',
  'Deriva la consulta a un agente humano cuando el cliente pide hablar con una persona real, tiene un reclamo complejo, o la consulta no puede resolverse con información disponible.',
  'custom_python',
  'Entiendo, te voy a derivar con uno de nuestros ejecutivos para que te ayude personalmente. Mientras tanto, puedes escribirnos al +56 9 9172 5737. [DERIVAR]',
  '{"type":"object","properties":{"motivo":{"type":"string","description":"Razón por la cual se deriva (reclamo, producto específico no disponible en info, etc.)."}},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 5, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;


-- =====================================================
-- 4. REGISTRO EN HISTORIAL
-- =====================================================

INSERT INTO chat_numancia_historial (id_marca, usuario_nombre, seccion, accion, detalle)
VALUES (
  6473892,
  'migracion_inicial',
  'instrucciones',
  'crear',
  '{"nota": "Configuracion inicial ChatNumancia con 5 herramientas semilla. Backend paralelo en Vercel (chat-numancia-api)."}'::jsonb
);


-- =====================================================
-- 5. AGREGAR CONOCIMIENTO BASICO DE NUMANCIA EN base_cuentas
-- =====================================================
-- El bot lee base_cuentas WHERE "ID marca"='6473892' AND estado_aprobacion='activo'
-- ordenado por prioridad para inyectar en el prompt.
-- La fila id=385 (Datos de Contacto) ya existe.

-- Agregar prompt_principal (categoria prompt, prioridad 1 = siempre_incluir)
INSERT INTO public.base_cuentas
  ("Nombre marca", "Estado", "ID marca", categoria, clave, valor,
   prioridad, fecha_inicio, fecha_caducidad, creado_en, estado_aprobacion)
VALUES
  ('Numancia', true, '6473892', 'prompt', 'prompt_principal',
   'Somos Numancia Sports, tienda de artículos deportivos en Valparaíso. Atendemos consultas sobre productos, ubicación y horarios. Nuestro objetivo es entregar información precisa y orientar al cliente a visitar la tienda o el sitio web.',
   1, NULL, NULL, NOW(), 'activo'),

  ('Numancia', true, '6473892', 'regla', 'no_inventar_precios',
   'Nunca inventes precios ni stock. Si el cliente pregunta por valores específicos, deriva a que llamen por teléfono o visiten la tienda.',
   1, NULL, NULL, NOW(), 'activo'),

  ('Numancia', true, '6473892', 'regla', 'idioma_chileno',
   'Responde en español chileno, cercano y natural. Evita tecnicismos. Usa emojis con moderación.',
   1, NULL, NULL, NOW(), 'activo'),

  ('Numancia', true, '6473892', 'observacion', 'sitio_web',
   'El catálogo oficial está en https://numanciasports.cl - siempre que un cliente pida ver productos, orienta a ese sitio.',
   2, NULL, NULL, NOW(), 'activo'),

  ('Numancia', true, '6473892', 'observacion', 'redes_sociales',
   'Instagram oficial: @numanciasports (https://www.instagram.com/numanciasports/). Facebook: https://www.facebook.com/www.numanciasports.cl/',
   2, NULL, NULL, NOW(), 'activo')
ON CONFLICT DO NOTHING;


-- =====================================================
-- 6. VERIFICACION
-- =====================================================

SELECT
  (SELECT COUNT(*) FROM chat_numancia_config WHERE id_marca=6473892)         AS config_rows,
  (SELECT COUNT(*) FROM chat_numancia_herramientas WHERE id_marca=6473892)   AS herramientas_rows,
  (SELECT COUNT(*) FROM base_cuentas WHERE "ID marca"='6473892' AND estado_aprobacion='activo') AS base_cuentas_rows,
  (SELECT api_key FROM chat_numancia_config WHERE id_marca=6473892)          AS api_key_webchat;
