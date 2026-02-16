-- ============================================
-- MIGRACION COMPLETA - CreceTec Admin Panel
-- Fecha: 2026-02-16
--
-- Este script cubre:
--   1. Tablas faltantes (logs_flujo, agentes, herramientas, etc.)
--   2. Columnas faltantes en tablas existentes
--   3. Politicas RLS para clave anon (Python/PythonAnywhere)
--   4. Indices de rendimiento
--
-- IMPORTANTE: Ejecutar en Supabase SQL Editor
-- Es seguro re-ejecutar (usa IF NOT EXISTS)
-- ============================================


-- =============================================
-- SECCION 1: TABLAS FALTANTES
-- =============================================

-- 1.1 LOGS DE EJECUCION DE FLUJOS
-- Usada por: API (GET logs), Python flow_engine (INSERT/UPDATE)
CREATE TABLE IF NOT EXISTS logs_flujo (
  id                SERIAL PRIMARY KEY,
  conversacion_id   INTEGER REFERENCES conversaciones_flujo(id) ON DELETE CASCADE,
  nodo_id           VARCHAR(100),
  tipo_nodo         VARCHAR(50),
  estado            VARCHAR(20) DEFAULT 'ejecutado',
  datos_entrada     JSONB DEFAULT '{}',
  datos_salida      JSONB DEFAULT '{}',
  error             TEXT,
  duracion_ms       INTEGER,
  orden             INTEGER DEFAULT 0,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_flujo_conv ON logs_flujo(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_logs_flujo_nodo ON logs_flujo(conversacion_id, nodo_id);
CREATE INDEX IF NOT EXISTS idx_logs_flujo_estado ON logs_flujo(estado);


-- 1.2 AGENTES IA
-- Usada por: API CRUD completo, Python flow_engine (SELECT en usar_agente)
CREATE TABLE IF NOT EXISTS agentes (
  id                      SERIAL PRIMARY KEY,
  id_marca                BIGINT NOT NULL,
  nombre                  VARCHAR(200) NOT NULL,
  descripcion             TEXT,
  objetivo                TEXT,
  tono                    VARCHAR(50) DEFAULT 'profesional',
  instrucciones           TEXT DEFAULT '',
  condiciones_cierre      TEXT,
  estado                  VARCHAR(20) DEFAULT 'borrador',
  icono                   VARCHAR(10) DEFAULT '🤖',
  color                   VARCHAR(20) DEFAULT '#8b5cf6',
  temperatura             NUMERIC(3,2) DEFAULT 0.7,
  modelo                  VARCHAR(50) DEFAULT 'gpt-4o-mini',
  categorias_conocimiento JSONB DEFAULT '[]',
  agentes_delegables      JSONB DEFAULT '[]',
  max_turnos              INTEGER DEFAULT 50,
  creado_por              INTEGER,
  creado_en               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentes_marca ON agentes(id_marca);
CREATE INDEX IF NOT EXISTS idx_agentes_estado ON agentes(id_marca, estado);


-- 1.3 HERRAMIENTAS DEL CATALOGO POR AGENTE
-- Usada por: API (GET/PUT herramientas)
CREATE TABLE IF NOT EXISTS agente_herramientas (
  id              SERIAL PRIMARY KEY,
  id_agente       INTEGER REFERENCES agentes(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) NOT NULL,
  nombre          VARCHAR(100),
  habilitada      BOOLEAN DEFAULT true,
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_herr_agente ON agente_herramientas(id_agente);


-- 1.4 HERRAMIENTAS CUSTOM POR MARCA
-- Usada por: API CRUD herramientas custom
CREATE TABLE IF NOT EXISTS herramientas_custom (
  id              SERIAL PRIMARY KEY,
  id_marca        BIGINT NOT NULL,
  nombre          VARCHAR(200) NOT NULL,
  descripcion     TEXT,
  parametros      JSONB DEFAULT '[]',
  endpoint_url    VARCHAR(500),
  metodo_http     VARCHAR(10) DEFAULT 'POST',
  headers         JSONB DEFAULT '{}',
  body_template   JSONB DEFAULT '{}',
  estado          VARCHAR(20) DEFAULT 'activo',
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_herr_custom_marca ON herramientas_custom(id_marca);


-- 1.5 ASIGNACIONES DE HERRAMIENTAS CUSTOM A AGENTES
-- Usada por: API (GET/PUT herramientas con custom)
CREATE TABLE IF NOT EXISTS agente_herramientas_custom (
  id              SERIAL PRIMARY KEY,
  id_agente       INTEGER REFERENCES agentes(id) ON DELETE CASCADE,
  id_herramienta  INTEGER REFERENCES herramientas_custom(id) ON DELETE CASCADE,
  habilitada      BOOLEAN DEFAULT true,
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_herr_custom_agente ON agente_herramientas_custom(id_agente);


-- 1.6 CONOCIMIENTO ESPECIFICO DEL AGENTE
-- Usada por: API (GET/POST/DELETE conocimiento)
CREATE TABLE IF NOT EXISTS agente_conocimiento (
  id              SERIAL PRIMARY KEY,
  id_agente       INTEGER REFERENCES agentes(id) ON DELETE CASCADE,
  titulo          VARCHAR(300),
  contenido       TEXT NOT NULL,
  categoria       VARCHAR(100),
  estado          VARCHAR(20) DEFAULT 'aprobado',
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_conoc_agente ON agente_conocimiento(id_agente);


-- 1.7 DOCUMENTOS DEL AGENTE
-- Usada por: API (GET/POST documentos)
CREATE TABLE IF NOT EXISTS agente_documentos (
  id                  SERIAL PRIMARY KEY,
  id_agente           INTEGER REFERENCES agentes(id) ON DELETE CASCADE,
  nombre              VARCHAR(300),
  tipo                VARCHAR(50),
  url_archivo         TEXT,
  contenido_extraido  TEXT,
  estado              VARCHAR(20) DEFAULT 'pendiente',
  creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_docs_agente ON agente_documentos(id_agente);


-- =============================================
-- SECCION 2: COLUMNAS FALTANTES EN TABLAS EXISTENTES
-- =============================================

-- 2.1 conversaciones_flujo: agregar agente_activo_id
-- Usada por: Python flow_engine ejecutar_usar_agente()
-- Indica que agente IA esta manejando la conversacion actualmente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversaciones_flujo'
    AND column_name = 'agente_activo_id'
  ) THEN
    ALTER TABLE conversaciones_flujo
      ADD COLUMN agente_activo_id INTEGER REFERENCES agentes(id) ON DELETE SET NULL;
  END IF;
END $$;


-- =============================================
-- SECCION 3: POLITICAS RLS PARA CLAVE ANON
-- =============================================
-- CRITICO: El motor Python en PythonAnywhere usa la clave anon.
-- Sin estas politicas, TODOS los flujos fallan silenciosamente.
--
-- La API de Next.js usa service_role (bypassa RLS), no se ve afectada.
-- =============================================

-- === 3.1 FLUJOS ===
ALTER TABLE flujos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_flujos" ON flujos;
CREATE POLICY "anon_select_flujos" ON flujos
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "service_all_flujos" ON flujos;
CREATE POLICY "service_all_flujos" ON flujos
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.2 CONVERSACIONES_FLUJO ===
ALTER TABLE conversaciones_flujo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_conversaciones_flujo" ON conversaciones_flujo;
CREATE POLICY "anon_select_conversaciones_flujo" ON conversaciones_flujo
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_conversaciones_flujo" ON conversaciones_flujo;
CREATE POLICY "anon_insert_conversaciones_flujo" ON conversaciones_flujo
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversaciones_flujo" ON conversaciones_flujo;
CREATE POLICY "anon_update_conversaciones_flujo" ON conversaciones_flujo
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_conversaciones_flujo" ON conversaciones_flujo;
CREATE POLICY "service_all_conversaciones_flujo" ON conversaciones_flujo
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.3 MENSAJES_FLUJO ===
ALTER TABLE mensajes_flujo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_mensajes_flujo" ON mensajes_flujo;
CREATE POLICY "anon_select_mensajes_flujo" ON mensajes_flujo
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_mensajes_flujo" ON mensajes_flujo;
CREATE POLICY "anon_insert_mensajes_flujo" ON mensajes_flujo
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_mensajes_flujo" ON mensajes_flujo;
CREATE POLICY "service_all_mensajes_flujo" ON mensajes_flujo
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.4 LOGS_FLUJO ===
ALTER TABLE logs_flujo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_logs_flujo" ON logs_flujo;
CREATE POLICY "anon_select_logs_flujo" ON logs_flujo
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_logs_flujo" ON logs_flujo;
CREATE POLICY "anon_insert_logs_flujo" ON logs_flujo
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_logs_flujo" ON logs_flujo;
CREATE POLICY "anon_update_logs_flujo" ON logs_flujo
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_logs_flujo" ON logs_flujo;
CREATE POLICY "service_all_logs_flujo" ON logs_flujo
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.5 USUARIOS ===
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_usuarios" ON usuarios;
CREATE POLICY "anon_select_usuarios" ON usuarios
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "service_all_usuarios" ON usuarios;
CREATE POLICY "service_all_usuarios" ON usuarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.6 CONOCIMIENTO_MARCA ===
ALTER TABLE conocimiento_marca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_conocimiento_marca" ON conocimiento_marca;
CREATE POLICY "anon_select_conocimiento_marca" ON conocimiento_marca
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "service_all_conocimiento_marca" ON conocimiento_marca;
CREATE POLICY "service_all_conocimiento_marca" ON conocimiento_marca
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.7 BASE_CUENTAS ===
ALTER TABLE base_cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_base_cuentas" ON base_cuentas;
CREATE POLICY "anon_select_base_cuentas" ON base_cuentas
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_base_cuentas" ON base_cuentas;
CREATE POLICY "anon_insert_base_cuentas" ON base_cuentas
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_base_cuentas" ON base_cuentas;
CREATE POLICY "service_all_base_cuentas" ON base_cuentas
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.8 TAREAS ===
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tareas" ON tareas;
CREATE POLICY "anon_select_tareas" ON tareas
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_tareas" ON tareas;
CREATE POLICY "anon_insert_tareas" ON tareas
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_tareas" ON tareas;
CREATE POLICY "service_all_tareas" ON tareas
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.9 AGENTES ===
ALTER TABLE agentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_agentes" ON agentes;
CREATE POLICY "anon_select_agentes" ON agentes
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "service_all_agentes" ON agentes;
CREATE POLICY "service_all_agentes" ON agentes
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.10 AGENTE_HERRAMIENTAS ===
ALTER TABLE agente_herramientas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_agente_herramientas" ON agente_herramientas;
CREATE POLICY "service_all_agente_herramientas" ON agente_herramientas
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.11 HERRAMIENTAS_CUSTOM ===
ALTER TABLE herramientas_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_herramientas_custom" ON herramientas_custom;
CREATE POLICY "service_all_herramientas_custom" ON herramientas_custom
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.12 AGENTE_HERRAMIENTAS_CUSTOM ===
ALTER TABLE agente_herramientas_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_agente_herramientas_custom" ON agente_herramientas_custom;
CREATE POLICY "service_all_agente_herramientas_custom" ON agente_herramientas_custom
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.13 AGENTE_CONOCIMIENTO ===
ALTER TABLE agente_conocimiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_agente_conocimiento" ON agente_conocimiento;
CREATE POLICY "service_all_agente_conocimiento" ON agente_conocimiento
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.14 AGENTE_DOCUMENTOS ===
ALTER TABLE agente_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_agente_documentos" ON agente_documentos;
CREATE POLICY "service_all_agente_documentos" ON agente_documentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === 3.15 TABLAS ADICIONALES QUE PYTHON PODRIA TOCAR ===
-- (logs_comentarios, mensajes_chat - usadas por BP_comentarios.py)

-- logs_comentarios
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_comentarios') THEN
    ALTER TABLE logs_comentarios ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "anon_all_logs_comentarios" ON logs_comentarios;
    CREATE POLICY "anon_all_logs_comentarios" ON logs_comentarios
      FOR ALL TO anon USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_all_logs_comentarios" ON logs_comentarios;
    CREATE POLICY "service_all_logs_comentarios" ON logs_comentarios
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- mensajes_chat
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mensajes_chat') THEN
    ALTER TABLE mensajes_chat ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "anon_all_mensajes_chat" ON mensajes_chat;
    CREATE POLICY "anon_all_mensajes_chat" ON mensajes_chat
      FOR ALL TO anon USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_all_mensajes_chat" ON mensajes_chat;
    CREATE POLICY "service_all_mensajes_chat" ON mensajes_chat
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- whatsapp_pending_approvals
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_pending_approvals') THEN
    ALTER TABLE whatsapp_pending_approvals ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "anon_all_whatsapp_pending" ON whatsapp_pending_approvals;
    CREATE POLICY "anon_all_whatsapp_pending" ON whatsapp_pending_approvals
      FOR ALL TO anon USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_all_whatsapp_pending" ON whatsapp_pending_approvals;
    CREATE POLICY "service_all_whatsapp_pending" ON whatsapp_pending_approvals
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- =============================================
-- SECCION 4: HABILITAR REALTIME EN TABLAS NUEVAS
-- =============================================

-- Solo si no estan ya publicadas (ignorar errores si ya existen)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE logs_flujo;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE agentes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- =============================================
-- SECCION 5: GRANTS EXPLICITOS PARA ROL ANON
-- =============================================
-- Asegura que el rol anon tenga permisos a nivel de tabla
-- (complementa las politicas RLS)

-- Tablas que Python necesita leer
GRANT SELECT ON flujos TO anon;
GRANT SELECT ON usuarios TO anon;
GRANT SELECT ON conocimiento_marca TO anon;
GRANT SELECT ON agentes TO anon;

-- Tablas que Python necesita leer y escribir
GRANT SELECT, INSERT, UPDATE ON conversaciones_flujo TO anon;
GRANT SELECT, INSERT ON mensajes_flujo TO anon;
GRANT SELECT, INSERT, UPDATE ON logs_flujo TO anon;
GRANT SELECT, INSERT ON base_cuentas TO anon;
GRANT SELECT, INSERT ON tareas TO anon;

-- Secuencias (necesarias para INSERT con SERIAL)
GRANT USAGE, SELECT ON SEQUENCE conversaciones_flujo_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE mensajes_flujo_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE logs_flujo_id_seq TO anon;

-- Secuencias de tareas y base_cuentas (si son SERIAL)
DO $$
BEGIN
  BEGIN
    GRANT USAGE, SELECT ON SEQUENCE tareas_id_seq TO anon;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    GRANT USAGE, SELECT ON SEQUENCE base_cuentas_id_seq TO anon;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;


-- =============================================
-- VERIFICACION: Consulta para validar todo
-- =============================================
-- Ejecutar esta consulta DESPUES de la migracion para verificar:

-- SELECT
--   schemaname, tablename,
--   rowsecurity as rls_enabled
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN (
--   'flujos', 'conversaciones_flujo', 'mensajes_flujo', 'logs_flujo',
--   'usuarios', 'conocimiento_marca', 'base_cuentas', 'tareas',
--   'agentes', 'agente_herramientas', 'herramientas_custom',
--   'agente_herramientas_custom', 'agente_conocimiento', 'agente_documentos'
-- )
-- ORDER BY tablename;

-- Verificar politicas:
-- SELECT tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
