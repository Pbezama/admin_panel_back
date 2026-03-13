-- ============================================
-- MIGRACION: Agentes 100% Configurables
-- Fecha: 2026-03-06
-- ============================================
-- Nuevos campos para hacer TODO configurable desde la app

-- Personalidad y comportamiento
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS personalidad TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS reglas TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS restricciones TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS formato_respuesta TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS ejemplos TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS idioma VARCHAR(50) DEFAULT 'espanol';

-- Mensajes personalizados
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS mensaje_bienvenida TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS mensaje_despedida TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS mensaje_error TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS mensaje_fuera_tema TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS mensaje_transferencia TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS mensaje_limite_turnos TEXT;

-- Parametros tecnicos (antes hardcodeados)
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 800;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS max_historial INTEGER DEFAULT 20;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS max_conocimiento INTEGER DEFAULT 15;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS prompt_sistema_custom TEXT;

-- Comentarios sobre cada campo:
-- personalidad: Texto libre que describe la personalidad (reemplaza el dropdown de tono limitado)
-- reglas: Reglas que el agente DEBE seguir siempre
-- restricciones: Lo que el agente NO puede hacer/decir
-- formato_respuesta: Como debe formatear sus respuestas (largo, estilo, estructura)
-- ejemplos: Ejemplos de conversacion para few-shot prompting
-- idioma: Idioma principal del agente
-- mensaje_bienvenida: Primer mensaje al iniciar conversacion
-- mensaje_despedida: Mensaje al cerrar conversacion
-- mensaje_error: Mensaje cuando ocurre un error
-- mensaje_fuera_tema: Respuesta cuando preguntan algo fuera del alcance
-- mensaje_transferencia: Mensaje al transferir a humano
-- mensaje_limite_turnos: Mensaje cuando se alcanza el limite de turnos
-- max_tokens: Maximo de tokens por respuesta (antes hardcoded 800)
-- max_historial: Mensajes de historial a cargar como contexto (antes hardcoded 20)
-- max_conocimiento: Fragmentos de conocimiento a incluir en prompt (antes hardcoded 15)
-- prompt_sistema_custom: Prompt de sistema completo personalizado (override total)
