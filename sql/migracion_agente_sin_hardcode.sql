-- ============================================================
-- Migración: agentes sin instrucciones hardcodeadas
-- Mueve a DB todo el texto fijo que vivía en flow_engine.py
-- (_build_agent_prompt + continuar_agente)
-- Idempotente: se puede correr varias veces sin duplicar.
-- ============================================================

-- 1. Columnas nuevas (todas TEXT NULL)
ALTER TABLE agentes
  ADD COLUMN IF NOT EXISTS instrucciones_cierre TEXT,
  ADD COLUMN IF NOT EXISTS plantilla_salidas TEXT,
  ADD COLUMN IF NOT EXISTS label_variables TEXT;

-- 2. Seed: bloque de cierre que estaba hardcodeado en
--    flow_engine.py:1228-1242 (_build_agent_prompt, incluir_cierre=True)
UPDATE agentes
SET instrucciones_cierre = E'--- INSTRUCCIONES DE CIERRE ---\nEsta es una conversacion multi-turno. Debes seguir conversando hasta cumplir tu objetivo.\nCuando hayas CUMPLIDO tu objetivo, el usuario se despida, o la conversacion deba terminar naturalmente, incluye exactamente [FINALIZAR] al FINAL de tu mensaje.\nNO uses [FINALIZAR] si aun necesitas mas informacion o la conversacion debe continuar.'
WHERE instrucciones_cierre IS NULL;

-- 3. Seed: plantilla de salidas (flow_engine.py:1232-1236)
--    Placeholders soportados por el código nuevo: {salidas}, {ejemplo}
UPDATE agentes
SET plantilla_salidas = E'SALIDAS DISPONIBLES - Cuando termines la conversacion, elige UNA de estas salidas que mejor represente el resultado:\n{salidas}\n\nCuando la conversacion deba terminar, incluye exactamente [SALIDA:id_de_salida][FINALIZAR] al FINAL de tu mensaje.\nEjemplo: ...tu respuesta aqui... {ejemplo}'
WHERE plantilla_salidas IS NULL;

-- 4. Seed: encabezado de variables del usuario (flow_engine.py:1224)
UPDATE agentes
SET label_variables = 'DATOS DEL USUARIO:'
WHERE label_variables IS NULL;

-- 5. Seed: mensaje de límite de turnos (flow_engine.py:1313)
UPDATE agentes
SET mensaje_limite_turnos = 'Hemos alcanzado el limite de esta conversacion. Gracias por tu tiempo!'
WHERE mensaje_limite_turnos IS NULL OR mensaje_limite_turnos = '';

-- 6. Seed de los prefijos en español que estaban siendo concatenados
--    en flow_engine.py:1160-1191. Se prepende cada etiqueta DENTRO del
--    propio campo, para que al quitarse del código el contenido siga
--    llegando a OpenAI exactamente igual que antes.

UPDATE agentes
SET personalidad = E'PERSONALIDAD:\n' || personalidad
WHERE personalidad IS NOT NULL AND personalidad <> ''
  AND position('PERSONALIDAD:' in personalidad) = 0;

-- tono solo se usaba como fallback cuando NO había personalidad
UPDATE agentes
SET tono = 'TONO: Debes comunicarte de forma ' || tono || '.'
WHERE tono IS NOT NULL AND tono <> ''
  AND position('TONO:' in tono) = 0
  AND (personalidad IS NULL OR personalidad = '');

UPDATE agentes
SET idioma = 'IDIOMA: Debes responder siempre en ' || idioma || '.'
WHERE idioma IS NOT NULL AND idioma <> '' AND idioma <> 'espanol'
  AND position('IDIOMA:' in idioma) = 0;

UPDATE agentes
SET instrucciones = E'INSTRUCCIONES:\n' || instrucciones
WHERE instrucciones IS NOT NULL AND instrucciones <> ''
  AND position('INSTRUCCIONES:' in instrucciones) = 0;

UPDATE agentes
SET reglas = E'REGLAS (debes cumplir SIEMPRE):\n' || reglas
WHERE reglas IS NOT NULL AND reglas <> ''
  AND position('REGLAS' in reglas) = 0;

UPDATE agentes
SET restricciones = E'RESTRICCIONES (NUNCA hagas esto):\n' || restricciones
WHERE restricciones IS NOT NULL AND restricciones <> ''
  AND position('RESTRICCIONES' in restricciones) = 0;

UPDATE agentes
SET formato_respuesta = E'FORMATO DE RESPUESTA:\n' || formato_respuesta
WHERE formato_respuesta IS NOT NULL AND formato_respuesta <> ''
  AND position('FORMATO DE RESPUESTA' in formato_respuesta) = 0;

UPDATE agentes
SET mensaje_fuera_tema = 'Si te preguntan algo fuera de tu alcance o tema, responde exactamente: ' || mensaje_fuera_tema
WHERE mensaje_fuera_tema IS NOT NULL AND mensaje_fuera_tema <> ''
  AND position('fuera de tu alcance' in mensaje_fuera_tema) = 0;

UPDATE agentes
SET ejemplos = E'EJEMPLOS DE CONVERSACION:\n' || ejemplos
WHERE ejemplos IS NOT NULL AND ejemplos <> ''
  AND position('EJEMPLOS' in ejemplos) = 0;

-- 7. Seed: objetivo iba con prefijo en flow_engine.py:1158
UPDATE agentes
SET objetivo = 'OBJETIVO: ' || objetivo
WHERE objetivo IS NOT NULL AND objetivo <> ''
  AND position('OBJETIVO:' in objetivo) = 0;

-- LISTO. Tras esta migración + el cambio de código, el system prompt
-- enviado a OpenAI será idéntico al actual, pero 100% editable desde el panel.
