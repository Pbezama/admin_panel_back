-- =====================================================
-- Migracion: TODO configurable desde Supabase
-- =====================================================
-- Saca del codigo backend todo lo hardcoded relacionado con el comportamiento
-- del bot, y lo expone como columnas editables en chat_numancia_config.
--
-- Ademas:
--  - Desactiva la derivacion a humano (el bot es la unica fuente).
--  - Limpia emojis hardcoded del seed inicial.
--  - Endurece las reglas para que el bot no sugiera contactar por otras vias.
-- =====================================================

-- 1) AGREGAR COLUMNAS NUEVAS A chat_numancia_config
ALTER TABLE chat_numancia_config
  ADD COLUMN IF NOT EXISTS prompt_senales_cierre   TEXT,
  ADD COLUMN IF NOT EXISTS prompt_resumen          TEXT,
  ADD COLUMN IF NOT EXISTS regla_sin_emojis        TEXT,
  ADD COLUMN IF NOT EXISTS nota_encabezado_cierre  TEXT,
  ADD COLUMN IF NOT EXISTS nota_encabezado_derivar TEXT,
  ADD COLUMN IF NOT EXISTS mensaje_fallback        TEXT,
  ADD COLUMN IF NOT EXISTS permitir_derivacion     BOOLEAN DEFAULT false;


-- 2) SET INICIAL PARA NUMANCIA
--    Reemplaza ademas mensajes / prompts existentes para quitar emojis y
--    eliminar cualquier sugerencia de "contacta al telefono" o "deriva".
UPDATE chat_numancia_config
SET
  -- Senales de cierre (sin [DERIVAR], el bot no deriva)
  prompt_senales_cierre = 'Solo usa la senal [FIN_CONVERSACION] al final de tu respuesta cuando se cumpla AL MENOS UNA de estas condiciones:
- El cliente se despidio explicitamente ("chao", "gracias hasta luego", "eso era todo", "ya no necesito mas").
- Confirmo claramente que su consulta fue resuelta y no tiene mas preguntas.
- Hubo varios intercambios y cerro el tema con un mensaje corto de cortesia ("ok perfecto", "dale gracias").

NUNCA uses [FIN_CONVERSACION]:
- En el primer mensaje.
- Cuando el cliente solo saludo.
- Por anticipado, "por las dudas".
- Si todavia hay un siguiente paso logico esperable.
- Si el cliente solo dice "gracias" sin despedirse.

Cuando uses [FIN_CONVERSACION], primero entrega una despedida calida y agrega el tag SOLO al final (se removera antes de mostrarse al cliente). Si dudas, NO uses ninguna senal.',

  -- Instruccion para generar resumen al cerrar
  prompt_resumen = 'Resumi la conversacion entre cliente y chatbot de Numancia Sports en formato accionable. Usa este formato exacto:

Cliente: <telefono o identificador si se conoce>
Intencion principal: <1 linea>
Puntos clave:
- <bullet>
- <bullet>
Datos entregados por el cliente:
- <nombre, edad, producto consultado, etc. Si no hay, escribe "ninguno">
Accion recomendada: <cerrar / hacer seguimiento en 24h / ninguna>

Se conciso (max 150 palabras). NO uses emojis. Espanol chileno neutro.',

  -- Regla que se inyecta cuando usar_emojis=false
  regla_sin_emojis = 'Bajo NINGUNA circunstancia uses emojis, emoticones, simbolos pictograficos ni iconos en tus respuestas. Esto se aplica incluso si la base de conocimiento o las herramientas incluyen emojis: debes filtrarlos al responder. Las unicas excepciones son simbolos estrictamente utiles (ej. "$" para precios). El cliente lee tus respuestas en WhatsApp y prefiere comunicacion sobria, sin decoracion visual.',

  -- Encabezado de la nota al cerrar / derivar
  nota_encabezado_cierre  = '[Conversacion cerrada por el bot]',
  nota_encabezado_derivar = '[Conversacion derivada por el bot]',

  -- Mensaje de fallback si el modelo no entrega respuesta
  mensaje_fallback = 'Gracias por contactarte con Numancia Sports.',

  -- El bot no deriva a humanos
  permitir_derivacion = false,
  usar_emojis         = false,

  -- Limpiar emojis del mensaje de bienvenida
  mensaje_bienvenida = 'Hola, soy el asistente virtual de Numancia Sports. ¿En que puedo ayudarte?',
  mensaje_despedida  = 'Gracias por contactarte con Numancia Sports. Que tengas un excelente dia.',
  mensaje_error      = 'Lo siento, ocurrio un error procesando tu mensaje. Intenta nuevamente en un momento.',

  -- Estilo: sin emojis, no derivar
  prompt_estilo = 'Utiliza un lenguaje cercano, natural y chileno, evitando tecnicismos innecesarios. Se directo y amable. Si no tenes informacion especifica sobre lo que el cliente pregunta, indicalo honestamente. Sos la fuente principal de informacion: NO redirijas al cliente a otras vias (telefono, email, asesor, visita en persona) salvo cuando el cliente explicitamente pida los datos de contacto. NO uses emojis ni emoticones.',

  -- Reglas: sin emojis, sin derivacion espontanea
  prompt_reglas = '- Saluda al inicio de la conversacion (solo una vez).
- NO inventes precios, stock ni promociones que no esten en la informacion disponible.
- Si no tenes la informacion que el cliente pregunta, indicalo honestamente con frases como "no tengo esa informacion en este momento".
- NUNCA sugieras al cliente contactar por otra via (telefono, email, visita en persona, asesor) salvo que el cliente explicitamente pida los datos de contacto.
- NUNCA uses frases como "puedes llamarnos", "te dejo el telefono", "contactanos al", "te derivo", "te paso con", "habla con un asesor".
- NO uses emojis ni emoticones bajo ninguna circunstancia.
- Sos la fuente principal de informacion, no un intermediario.
- Si la consulta excede tu conocimiento, di "no tengo esa informacion" sin sugerir alternativas externas.',

  -- Consideraciones especificas: limpio
  prompt_consideraciones = 'Numancia Sports es gimnasio + tienda de articulos deportivos en Valparaiso. Las consultas de stock o precios deben confirmarse con la informacion concreta de la base de conocimiento; si no esta, indicalo honestamente sin enviar al cliente a otra via.'

WHERE id_marca = 6473892;


-- 3) DESACTIVAR HERRAMIENTA DE DERIVACION
--    El bot no deriva mas. Marcamos la tool como inactiva (no la borramos
--    para mantener el historial; podes reactivarla desde el panel si cambia
--    la politica).
UPDATE chat_numancia_herramientas
SET activo = false
WHERE id_marca = 6473892 AND nombre = 'derivarConsultaAHumano';


-- 4) LIMPIAR EMOJIS DE HERRAMIENTAS QUE LOS TENIAN
UPDATE chat_numancia_herramientas
SET respuesta_texto = 'Para ver el catalogo actualizado con fotos y detalles, esta el sitio web https://numanciasports.cl. Si buscas algo especifico de stock o precio que no este en la web, decime el producto y te confirmo si tengo info disponible.'
WHERE id_marca = 6473892 AND nombre = 'consultarProductos';

UPDATE chat_numancia_herramientas
SET respuesta_texto = 'Estamos ubicados en Victorino Lastarria 138, Valparaiso, Chile. Google Maps: https://maps.google.com/?q=Victorino+Lastarria+138+Valparaiso'
WHERE id_marca = 6473892 AND nombre = 'enviarUbicacion';


-- 5) LIMPIAR EMOJIS Y SUGERENCIAS DE CONTACTO EN base_cuentas
--    La fila id=409 (regla idioma_chileno) tenia "Usa emojis con moderacion".
UPDATE base_cuentas
SET valor = 'Responde en espanol chileno, cercano y natural. Evita tecnicismos. NO uses emojis ni emoticones.'
WHERE "ID marca" = '6473892' AND clave = 'idioma_chileno';

--    Si tenes mas filas con frases tipo "puedes llamarnos al", "contactanos al"
--    en `valor`, este UPDATE las reemplaza por una version neutra. Reviselas
--    despues con el SELECT del paso 6.
UPDATE base_cuentas
SET valor = REPLACE(valor, 'Llamarnos al', 'Telefono')
WHERE "ID marca" = '6473892' AND valor ILIKE '%Llamarnos al%';

UPDATE base_cuentas
SET valor = REPLACE(valor, 'puedes llamarnos', 'el telefono es')
WHERE "ID marca" = '6473892' AND valor ILIKE '%puedes llamarnos%';


-- 6) VERIFICAR resultado
SELECT
  id_marca,
  usar_emojis,
  permitir_derivacion,
  LEFT(prompt_estilo, 80)         AS prompt_estilo_inicio,
  LEFT(prompt_reglas, 80)         AS prompt_reglas_inicio,
  LEFT(prompt_senales_cierre, 80) AS senales_inicio,
  mensaje_bienvenida
FROM chat_numancia_config
WHERE id_marca = 6473892;

SELECT nombre, activo, LEFT(respuesta_texto, 80) AS preview
FROM chat_numancia_herramientas
WHERE id_marca = 6473892
ORDER BY orden;
