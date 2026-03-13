-- ============================================
-- MIGRACION: Integracion Google (Drive + Sheets + Docs)
-- Fecha: 2026-03-10
--
-- Tablas:
--   1. google_conexiones        - Cuentas OAuth por marca (multiples por marca)
--   2. google_archivos          - Archivos seleccionados (Sheets, Docs, PDFs)
--   3. google_pestanas          - Pestanas seleccionadas dentro de un Sheet
--   4. google_fuentes_datos     - Fuentes virtuales (combinan pestanas de distintos archivos)
--   5. google_fuente_pestanas   - Relacion N:N fuente <-> pestana
--   6. agente_google_fuentes    - Asignacion de fuentes a agentes
--
-- IMPORTANTE: Ejecutar en Supabase SQL Editor
-- Es seguro re-ejecutar (usa IF NOT EXISTS / IF NOT EXISTS)
-- ============================================


-- =============================================
-- SECCION 1: CONEXIONES OAUTH
-- =============================================

-- 1.1 CONEXIONES GOOGLE POR MARCA
-- Cada marca puede tener multiples cuentas Google conectadas
-- Cada admin conecta desde la vista "Conexiones" en el frontend
-- Credenciales OAuth globales de CreceTec (env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
-- El cliente NO necesita configurar nada, solo hace clic en "Conectar"
CREATE TABLE IF NOT EXISTS google_conexiones (
  id                SERIAL PRIMARY KEY,
  id_marca          BIGINT NOT NULL,
  nombre_cuenta     VARCHAR(200) NOT NULL,          -- nombre para identificar (ej: "Gmail empresa")
  email_google      VARCHAR(300),                   -- email de la cuenta Google conectada
  access_token      TEXT,                            -- Token de acceso (corta duracion)
  refresh_token     TEXT,                            -- Token de refresco (larga duracion)
  token_expiry      TIMESTAMP WITH TIME ZONE,        -- Cuando expira el access_token
  scopes            TEXT DEFAULT 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets', -- Scopes concedidos
  estado            VARCHAR(20) DEFAULT 'activa',    -- activa, expirada, revocada, error
  conectado_por     INTEGER,                         -- ID del usuario que conecto
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_conex_marca ON google_conexiones(id_marca);
CREATE INDEX IF NOT EXISTS idx_google_conex_estado ON google_conexiones(id_marca, estado);


-- =============================================
-- SECCION 2: ARCHIVOS Y PESTANAS
-- =============================================

-- 2.1 ARCHIVOS SELECCIONADOS
-- Solo los archivos que el admin selecciona manualmente desde la app
-- Tipos: sheet, doc, pdf
CREATE TABLE IF NOT EXISTS google_archivos (
  id                SERIAL PRIMARY KEY,
  id_conexion       INTEGER REFERENCES google_conexiones(id) ON DELETE CASCADE,
  id_marca          BIGINT NOT NULL,
  google_file_id    VARCHAR(200) NOT NULL,           -- ID del archivo en Google Drive
  nombre_archivo    VARCHAR(500) NOT NULL,           -- Nombre original en Google Drive
  alias             VARCHAR(200),                    -- Alias asignado por el admin (ej: "Base de clientes")
  descripcion       TEXT,                            -- Descripcion para que la IA entienda cuando usarlo
  tipo_archivo      VARCHAR(20) NOT NULL DEFAULT 'sheet', -- sheet, doc, pdf
  mime_type         VARCHAR(100),                    -- MIME type del archivo
  url_archivo       TEXT,                            -- URL directa al archivo en Google
  estado            VARCHAR(20) DEFAULT 'activo',    -- activo, desvinculado, error
  ultimo_acceso     TIMESTAMP WITH TIME ZONE,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_arch_marca ON google_archivos(id_marca);
CREATE INDEX IF NOT EXISTS idx_google_arch_conexion ON google_archivos(id_conexion);
CREATE INDEX IF NOT EXISTS idx_google_arch_tipo ON google_archivos(id_marca, tipo_archivo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_arch_unique ON google_archivos(id_conexion, google_file_id);


-- 2.2 PESTANAS DE GOOGLE SHEETS
-- Granularidad fina: se seleccionan pestanas especificas dentro de cada Sheet
CREATE TABLE IF NOT EXISTS google_pestanas (
  id                SERIAL PRIMARY KEY,
  id_archivo        INTEGER REFERENCES google_archivos(id) ON DELETE CASCADE,
  id_marca          BIGINT NOT NULL,
  sheet_id          INTEGER NOT NULL,                -- ID de la pestana en Google Sheets (gid)
  nombre_pestana    VARCHAR(200) NOT NULL,           -- Nombre de la pestana (tab)
  alias             VARCHAR(200),                    -- Alias asignado por el admin
  descripcion       TEXT,                            -- Descripcion para la IA
  rango_datos       VARCHAR(50),                     -- Rango especifico (ej: "A1:Z1000"), null = toda la pestana
  headers           JSONB DEFAULT '[]',              -- Cache de los headers/columnas detectados
  total_filas       INTEGER DEFAULT 0,               -- Aproximado de filas con datos
  estado            VARCHAR(20) DEFAULT 'activa',    -- activa, desvinculada
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_pest_archivo ON google_pestanas(id_archivo);
CREATE INDEX IF NOT EXISTS idx_google_pest_marca ON google_pestanas(id_marca);
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_pest_unique ON google_pestanas(id_archivo, sheet_id);


-- =============================================
-- SECCION 3: FUENTES DE DATOS VIRTUALES
-- =============================================

-- 3.1 FUENTES DE DATOS
-- Combinan pestanas de distintos archivos en una sola "fuente" logica
-- Ej: "Todos los clientes" = Pestana "Activos" de Sheet1 + Pestana "Nuevos" de Sheet2
CREATE TABLE IF NOT EXISTS google_fuentes_datos (
  id                SERIAL PRIMARY KEY,
  id_marca          BIGINT NOT NULL,
  nombre            VARCHAR(200) NOT NULL,           -- Nombre de la fuente (ej: "Base de clientes completa")
  descripcion       TEXT,                            -- Descripcion para que la IA sepa cuando usar esta fuente
  tipo              VARCHAR(20) DEFAULT 'sheets',    -- sheets, docs, mixta
  estado            VARCHAR(20) DEFAULT 'activa',    -- activa, inactiva
  creado_por        INTEGER,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_fuentes_marca ON google_fuentes_datos(id_marca);


-- 3.2 RELACION FUENTE <-> PESTANAS (N:N)
-- Una fuente puede tener multiples pestanas, una pestana puede estar en multiples fuentes
CREATE TABLE IF NOT EXISTS google_fuente_pestanas (
  id                SERIAL PRIMARY KEY,
  id_fuente         INTEGER REFERENCES google_fuentes_datos(id) ON DELETE CASCADE,
  id_pestana        INTEGER REFERENCES google_pestanas(id) ON DELETE CASCADE,
  orden             INTEGER DEFAULT 0,               -- Orden dentro de la fuente
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_fp_fuente ON google_fuente_pestanas(id_fuente);
CREATE INDEX IF NOT EXISTS idx_google_fp_pestana ON google_fuente_pestanas(id_pestana);
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_fp_unique ON google_fuente_pestanas(id_fuente, id_pestana);


-- 3.3 RELACION FUENTE <-> DOCUMENTOS (para fuentes tipo docs/mixta)
-- Permite incluir Docs y PDFs en fuentes de datos
CREATE TABLE IF NOT EXISTS google_fuente_documentos (
  id                SERIAL PRIMARY KEY,
  id_fuente         INTEGER REFERENCES google_fuentes_datos(id) ON DELETE CASCADE,
  id_archivo        INTEGER REFERENCES google_archivos(id) ON DELETE CASCADE,
  orden             INTEGER DEFAULT 0,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_fd_fuente ON google_fuente_documentos(id_fuente);
CREATE INDEX IF NOT EXISTS idx_google_fd_archivo ON google_fuente_documentos(id_archivo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_fd_unique ON google_fuente_documentos(id_fuente, id_archivo);


-- =============================================
-- SECCION 4: ASIGNACION A AGENTES
-- =============================================

-- 4.1 FUENTES ASIGNADAS A AGENTES
-- Cada agente puede tener multiples fuentes de Google asignadas
-- La IA usa la descripcion de cada fuente para decidir cual consultar
CREATE TABLE IF NOT EXISTS agente_google_fuentes (
  id                SERIAL PRIMARY KEY,
  id_agente         UUID REFERENCES agentes(id) ON DELETE CASCADE,
  id_fuente         INTEGER REFERENCES google_fuentes_datos(id) ON DELETE CASCADE,
  permisos          VARCHAR(20) DEFAULT 'lectura',   -- lectura, escritura, completo
  prioridad         INTEGER DEFAULT 0,               -- Para ordenar en el prompt del agente
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_gf_agente ON agente_google_fuentes(id_agente);
CREATE INDEX IF NOT EXISTS idx_agente_gf_fuente ON agente_google_fuentes(id_fuente);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agente_gf_unique ON agente_google_fuentes(id_agente, id_fuente);


-- =============================================
-- SECCION 5: LOGS DE OPERACIONES GOOGLE
-- =============================================

-- 5.1 LOG DE OPERACIONES
-- Registra cada operacion contra Google API (para debug y auditoría)
CREATE TABLE IF NOT EXISTS google_operaciones_log (
  id                SERIAL PRIMARY KEY,
  id_marca          BIGINT NOT NULL,
  id_conexion       INTEGER REFERENCES google_conexiones(id) ON DELETE SET NULL,
  id_archivo        INTEGER,                         -- Ref sin FK para no bloquear deletes
  operacion         VARCHAR(50) NOT NULL,            -- leer, escribir, crear_pestana, duplicar, eliminar_fila, leer_doc, lote
  origen            VARCHAR(20) DEFAULT 'manual',    -- manual, agente, flujo
  origen_id         INTEGER,                         -- ID del agente o conversacion_flujo
  datos_request     JSONB DEFAULT '{}',              -- Resumen de lo que se pidio
  datos_response    JSONB DEFAULT '{}',              -- Resumen de lo que respondio Google
  filas_afectadas   INTEGER DEFAULT 0,
  exito             BOOLEAN DEFAULT true,
  error             TEXT,
  duracion_ms       INTEGER,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_ops_marca ON google_operaciones_log(id_marca);
CREATE INDEX IF NOT EXISTS idx_google_ops_conexion ON google_operaciones_log(id_conexion);
CREATE INDEX IF NOT EXISTS idx_google_ops_fecha ON google_operaciones_log(creado_en);


-- =============================================
-- SECCION 6: RLS POLICIES (para acceso Python con clave anon)
-- =============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE google_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_pestanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_fuentes_datos ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_fuente_pestanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_fuente_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agente_google_fuentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_operaciones_log ENABLE ROW LEVEL SECURITY;

-- Politicas SELECT para clave anon (Python las necesita para leer tokens y config)
DROP POLICY IF EXISTS "google_conexiones_select" ON google_conexiones;
CREATE POLICY "google_conexiones_select" ON google_conexiones FOR SELECT USING (true);

DROP POLICY IF EXISTS "google_archivos_select" ON google_archivos;
CREATE POLICY "google_archivos_select" ON google_archivos FOR SELECT USING (true);

DROP POLICY IF EXISTS "google_pestanas_select" ON google_pestanas;
CREATE POLICY "google_pestanas_select" ON google_pestanas FOR SELECT USING (true);

DROP POLICY IF EXISTS "google_fuentes_datos_select" ON google_fuentes_datos;
CREATE POLICY "google_fuentes_datos_select" ON google_fuentes_datos FOR SELECT USING (true);

DROP POLICY IF EXISTS "google_fuente_pestanas_select" ON google_fuente_pestanas;
CREATE POLICY "google_fuente_pestanas_select" ON google_fuente_pestanas FOR SELECT USING (true);

DROP POLICY IF EXISTS "google_fuente_documentos_select" ON google_fuente_documentos;
CREATE POLICY "google_fuente_documentos_select" ON google_fuente_documentos FOR SELECT USING (true);

DROP POLICY IF EXISTS "agente_google_fuentes_select" ON agente_google_fuentes;
CREATE POLICY "agente_google_fuentes_select" ON agente_google_fuentes FOR SELECT USING (true);

DROP POLICY IF EXISTS "google_operaciones_log_select" ON google_operaciones_log;
CREATE POLICY "google_operaciones_log_select" ON google_operaciones_log FOR SELECT USING (true);

-- Politicas INSERT/UPDATE para que Python pueda escribir logs y actualizar tokens
DROP POLICY IF EXISTS "google_conexiones_insert" ON google_conexiones;
CREATE POLICY "google_conexiones_insert" ON google_conexiones FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "google_conexiones_update" ON google_conexiones;
CREATE POLICY "google_conexiones_update" ON google_conexiones FOR UPDATE USING (true);

DROP POLICY IF EXISTS "google_operaciones_log_insert" ON google_operaciones_log;
CREATE POLICY "google_operaciones_log_insert" ON google_operaciones_log FOR INSERT WITH CHECK (true);


-- =============================================
-- SECCION 7: COMENTARIOS
-- =============================================

-- google_conexiones: Una fila por cuenta Google conectada. Cada marca puede tener multiples.
--   Credenciales OAuth globales de CreceTec (env vars). El cliente NO configura nada.
--   access_token/refresh_token: Tokens OAuth2 obtenidos despues del consentimiento del usuario
--   scopes: Permisos concedidos por el usuario de Google
--   estado: 'activa' = funcionando, 'expirada' = necesita reconexion, 'revocada' = usuario revoco permisos

-- google_archivos: Solo archivos que el admin selecciona manualmente (NO todo el Drive)
--   alias: Nombre amigable para identificar en la app (ej: "Inventario 2026")
--   descripcion: La IA usa esto para decidir automaticamente que archivo consultar
--   tipo_archivo: 'sheet' = Google Sheets, 'doc' = Google Docs, 'pdf' = PDF en Drive

-- google_pestanas: Pestanas individuales dentro de un Google Sheet
--   Se seleccionan granularmente (no todas las pestanas de un archivo)
--   headers: Cache JSON de las columnas para preview rapido sin llamar a Google API
--   rango_datos: Opcional, para limitar a un rango especifico de la pestana

-- google_fuentes_datos: Agrupacion logica/virtual de pestanas y/o documentos
--   Permite combinar data de distintos archivos en una sola "fuente"
--   Ej: "Clientes" = Sheet1/Activos + Sheet2/Prospectos + Doc explicativo

-- agente_google_fuentes: Que fuentes puede usar cada agente
--   permisos: 'lectura' = solo consultar, 'escritura' = leer+escribir, 'completo' = todo incluido crear
--   La IA del agente lee las descripciones de sus fuentes para decidir cual usar

-- google_operaciones_log: Auditoria de cada operacion contra Google API
--   origen: 'manual' = desde UI, 'agente' = el agente lo hizo, 'flujo' = nodo de flujo
