-- =====================================================
-- Agregar flag usar_emojis a chat_numancia_config
-- =====================================================
-- Permite que el operador desactive emojis del bot desde el panel.
-- Cuando usar_emojis = false, el system prompt incluye una regla critica
-- que prohibe al modelo usar emojis en sus respuestas.
-- =====================================================

ALTER TABLE chat_numancia_config
  ADD COLUMN IF NOT EXISTS usar_emojis BOOLEAN DEFAULT true;

-- Verificar
SELECT id_marca, usar_emojis FROM chat_numancia_config;
