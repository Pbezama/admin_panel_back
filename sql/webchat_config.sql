-- =============================================
-- Tabla: webchat_config
-- Configuracion del widget de chat web por marca
-- =============================================

CREATE TABLE IF NOT EXISTS webchat_config (
  id                    SERIAL PRIMARY KEY,
  id_marca              BIGINT NOT NULL UNIQUE,
  api_key               UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  activo                BOOLEAN NOT NULL DEFAULT true,

  -- Apariencia
  color_primario        TEXT NOT NULL DEFAULT '#2d3a5c',
  color_texto_header    TEXT NOT NULL DEFAULT '#ffffff',
  logo_url              TEXT,
  posicion              TEXT NOT NULL DEFAULT 'bottom-right'
                        CHECK (posicion IN ('bottom-right', 'bottom-left')),
  tamano                TEXT NOT NULL DEFAULT 'normal'
                        CHECK (tamano IN ('pequeno', 'normal', 'grande')),
  titulo_chat           TEXT NOT NULL DEFAULT 'Chat',
  mensaje_bienvenida    TEXT,

  -- Horario de atencion
  horario_activo        BOOLEAN NOT NULL DEFAULT false,
  horario_inicio        TIME,
  horario_fin           TIME,
  horario_zona          TEXT NOT NULL DEFAULT 'America/Santiago',
  mensaje_fuera_horario TEXT DEFAULT 'Estamos fuera de horario. Te responderemos pronto.',

  -- Timestamps
  creado_en             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indice para busqueda por api_key (endpoint publico)
CREATE INDEX IF NOT EXISTS idx_webchat_config_api_key ON webchat_config(api_key);

-- Indice para busqueda por marca
CREATE INDEX IF NOT EXISTS idx_webchat_config_marca ON webchat_config(id_marca);
