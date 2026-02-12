-- ============================================
-- SISTEMA DE FLUJOS CONVERSACIONALES
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Tabla principal de flujos
CREATE TABLE flujos (
  id              SERIAL PRIMARY KEY,
  id_marca        BIGINT NOT NULL,
  nombre          VARCHAR(200) NOT NULL,
  descripcion     TEXT,
  trigger_tipo    VARCHAR(50) NOT NULL DEFAULT 'keyword',
  trigger_valor   VARCHAR(500),
  canales         TEXT[] DEFAULT '{whatsapp}',
  estado          VARCHAR(20) DEFAULT 'borrador',
  es_template     BOOLEAN DEFAULT false,
  template_origen_id INTEGER REFERENCES flujos(id) ON DELETE SET NULL,
  nodos           JSONB NOT NULL DEFAULT '[]',
  edges           JSONB NOT NULL DEFAULT '[]',
  variables_schema JSONB DEFAULT '{}',
  version         INTEGER DEFAULT 1,
  creado_por      INTEGER,
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices para busquedas frecuentes
CREATE INDEX idx_flujos_marca ON flujos(id_marca);
CREATE INDEX idx_flujos_estado ON flujos(estado);
CREATE INDEX idx_flujos_trigger ON flujos(id_marca, estado, trigger_tipo);
CREATE INDEX idx_flujos_template ON flujos(es_template) WHERE es_template = true;

-- Conversaciones activas de flujos
CREATE TABLE conversaciones_flujo (
  id                    SERIAL PRIMARY KEY,
  id_marca              BIGINT NOT NULL,
  flujo_id              INTEGER REFERENCES flujos(id) ON DELETE SET NULL,
  canal                 VARCHAR(20) NOT NULL,
  identificador_usuario VARCHAR(200) NOT NULL,
  nodo_actual_id        VARCHAR(100),
  variables             JSONB DEFAULT '{}',
  estado                VARCHAR(20) DEFAULT 'activa',
  ejecutivo_asignado_id INTEGER,
  metadata              JSONB DEFAULT '{}',
  creado_en             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indice unico para conversacion activa por usuario+canal
CREATE INDEX idx_conv_flujo_activa ON conversaciones_flujo(canal, identificador_usuario, estado);
CREATE INDEX idx_conv_flujo_marca ON conversaciones_flujo(id_marca);

-- Mensajes dentro de conversaciones de flujo
CREATE TABLE mensajes_flujo (
  id                SERIAL PRIMARY KEY,
  conversacion_id   INTEGER REFERENCES conversaciones_flujo(id) ON DELETE CASCADE,
  direccion         VARCHAR(10) NOT NULL,
  contenido         TEXT,
  tipo_nodo         VARCHAR(50),
  nodo_id           VARCHAR(100),
  metadata          JSONB DEFAULT '{}',
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mensajes_flujo_conv ON mensajes_flujo(conversacion_id);
