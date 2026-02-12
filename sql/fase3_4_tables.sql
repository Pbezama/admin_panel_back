-- ============================================
-- FASES 3-4: Calendar, Dashboard Live, Multi-canal
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Tokens de Google Calendar por marca
CREATE TABLE google_calendar_tokens (
  id              SERIAL PRIMARY KEY,
  id_marca        BIGINT NOT NULL UNIQUE,
  email_calendar  VARCHAR(200),
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  calendar_id     VARCHAR(200) DEFAULT 'primary',
  conectado_por   INTEGER,
  activo          BOOLEAN DEFAULT true,
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gcal_marca ON google_calendar_tokens(id_marca) WHERE activo = true;

-- Citas agendadas via flujos
CREATE TABLE citas_agendadas (
  id              SERIAL PRIMARY KEY,
  id_marca        BIGINT NOT NULL,
  conversacion_id INTEGER REFERENCES conversaciones_flujo(id),
  google_event_id VARCHAR(200),
  titulo          VARCHAR(300) NOT NULL,
  fecha_inicio    TIMESTAMP WITH TIME ZONE NOT NULL,
  fecha_fin       TIMESTAMP WITH TIME ZONE NOT NULL,
  nombre_cliente  VARCHAR(200),
  email_cliente   VARCHAR(200),
  telefono_cliente VARCHAR(50),
  canal_origen    VARCHAR(20),
  estado          VARCHAR(20) DEFAULT 'confirmada',
  metadata        JSONB DEFAULT '{}',
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_citas_marca ON citas_agendadas(id_marca);
CREATE INDEX idx_citas_fecha ON citas_agendadas(id_marca, fecha_inicio);

-- Habilitar Supabase Realtime en tablas de flujos
ALTER PUBLICATION supabase_realtime ADD TABLE conversaciones_flujo;
ALTER PUBLICATION supabase_realtime ADD TABLE mensajes_flujo;
