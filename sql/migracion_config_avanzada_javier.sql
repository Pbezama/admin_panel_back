-- =====================================================
-- Migracion: Configuracion Avanzada Javier
-- Mueve textos hardcodeados de BOT_PRUEBAS.py a Supabase
-- Nuevos campos en chat_academico_config
-- =====================================================

-- 1. Agregar nuevas columnas
ALTER TABLE chat_academico_config
  ADD COLUMN IF NOT EXISTS prompt_clasificacion TEXT,
  ADD COLUMN IF NOT EXISTS prompt_contexto_cliente TEXT,
  ADD COLUMN IF NOT EXISTS palabras_derivar JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS palabras_urgente JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS buffer_espera_segundos INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS mensaje_derivacion TEXT DEFAULT '';

-- 2. Poblar con los valores que estaban hardcodeados en BOT_PRUEBAS.py
UPDATE chat_academico_config
SET
  -- Prompt de clasificacion post-conversacion (era _PROMPT_RESUMEN_AREA)
  prompt_clasificacion = 'Analiza la siguiente conversacion de atencion al cliente de PreUCV/Prouniversitas (preuniversitario chileno) y responde SOLO con un JSON valido con estos dos campos:

1. "descripcion": un STRING de texto plano (NO un objeto/dict) con el resumen de la conversacion. NO incluyas datos del contacto (nombre, RUT, programa, etc.) — esos ya los tiene el sistema. Solo incluye:
   - Que necesitaba el cliente (motivo del contacto)
   - Que se intento resolver durante la conversacion
   - Si se resolvio o no, y por que
   - Si se derivo, el motivo exacto
Escribelo como un parrafo corto y claro, maximo 150 palabras. Debe ser un STRING, no un objeto JSON anidado.

2. "area": clasifica usando el formato "Area/Tipo" donde:
   - Area es UNA de: Academico, Soporte Tecnico, Finanzas, Administracion, Servicio
   - Tipo es UNO de: Urgente, Traspaso, Auditoria

AREAS TEMATICAS:
   - "Academico" -> clases, horarios, agendamiento, campus virtual, inmersion, cursos de activacion, asignaturas, notas, programas, ensayos, cambio de sede/asignatura, actividades.
   - "Soporte Tecnico" -> problemas de acceso al Campus Virtual, contrasena no funciona, error en plataforma, Zoom no abre, perfil sin opciones.
   - "Finanzas" -> pagos, cuotas, saldos, deudas, estado de cuenta, prepago, repactacion, comprobantes, cobranza, pago express, cuanto debe.
   - "Administracion" -> contratos (baja, termino, prepago de contrato, repactacion de contrato), reclamos formales, tramites administrativos, certificados, documentos oficiales.
   - "Servicio" -> consultas generales que no encajan en las categorias anteriores, informacion general, proveedores.

TIPOS (sufijo):
   - "/Urgente" -> el cliente tiene un problema CRITICO que no puede esperar. Algo esta ocurriendo AHORA MISMO: clase en vivo a la que no puede entrar, charla que ya empezo, link que no funciona justo ahora, pide hablar con alguien urgente, amenazas de cobranza, corte de servicio inminente, reclamo grave.
   - "/Traspaso" -> Javier le dio al cliente INFORMACION o INSTRUCCIONES sobre como hacer algo (pedir un certificado, acceder a un link, hacer un tramite, seguir un proceso) pero NO PODEMOS VERIFICAR que el cliente lo haya logrado realmente. El cliente recibio la info y se fue conforme, pero necesita seguimiento humano.
   - "/Auditoria" -> Javier RESOLVIO la consulta de forma directa y verificable. Le dio datos concretos al cliente (su saldo, su horario, estado de su contrato, notas) y el cliente quedo conforme. No requiere seguimiento porque la respuesta fue definitiva.

REGLAS DE CLASIFICACION:
1. Primero determina el AREA tematica
2. Luego determina el TIPO:
   - Hay emergencia AHORA MISMO o el cliente pide hablar con alguien urgente? -> /Urgente
   - Javier solo dio instrucciones/info de como hacer algo sin poder confirmar que se hizo? -> /Traspaso
   - Javier resolvio con datos concretos y verificables? -> /Auditoria
3. El formato SIEMPRE es "Area/Tipo". Nunca uses el area sola.

Ejemplos:
- "no puedo entrar a la clase que empieza ahora" -> "Academico/Urgente"
- "no me abre zoom y la clase empieza en 5 min" -> "Soporte Tecnico/Urgente"
- "me estan amenazando con cobranza" -> "Finanzas/Urgente"
- "quiero hacer un reclamo formal urgente" -> "Administracion/Urgente"
- "necesito hablar con alguien" -> "Servicio/Urgente"
- "como pido el certificado de alumno regular?" -> Javier explica el proceso -> "Administracion/Traspaso"
- "como entro al taller?" -> Javier manda el link y explica -> "Academico/Traspaso"
- "como pago mi cuota?" -> Javier explica medios de pago -> "Finanzas/Traspaso"
- "no puedo entrar al campus" -> Javier da pasos para recuperar clave -> "Soporte Tecnico/Traspaso"
- "cuanto debo?" -> Javier le dice el monto exacto -> "Finanzas/Auditoria"
- "cual es mi horario?" -> Javier le muestra su horario -> "Academico/Auditoria"
- "como esta mi contrato?" -> Javier le dice el estado exacto -> "Administracion/Auditoria"

Responde SOLO el JSON, sin texto adicional. Ejemplo de formato correcto:
{"descripcion": "El cliente consulto como pedir su certificado de alumno regular. Javier le explico el proceso paso a paso.", "area": "Administracion/Traspaso"}',

  -- Template de contexto del cliente (era _construir_contexto_cliente)
  prompt_contexto_cliente = '## Datos del Cliente Actual
- Telefono del cliente: {phone}
- Conversation ID: {conversation_id}
- Channel ID: {channel_id}
IMPORTANTE: Ya tienes los datos del alumno pre-cargados abajo. Usa esa informacion directamente para responder consultas sobre contrato, programa, clases, etc. NO le pidas el telefono ni RUT al usuario si ya tienes sus datos.
EXCEPCION FINANCIERA: Para consultas de estado de cuenta, cuanto debe, montos adeudados o pagos, SIEMPRE usa la herramienta buscarEstadoCuentaPorRut pidiendo el RUT. Los datos pre-cargados de Google Sheets NO contienen informacion financiera confiable.
Solo usa las herramientas de busqueda si necesitas datos que no estan en la pre-carga, o si el usuario pregunta por otra persona.
{datos_alumno}
## Capacidades Multimedia
- Puedes VER y analizar imagenes que el usuario envia (capturas de pantalla, fotos, comprobantes, etc.).
- Los audios y notas de voz del usuario se transcriben automaticamente y te llegan como texto con el prefijo [Nota de voz transcrita]. Responde al contenido de la transcripcion como si el usuario te lo hubiera escrito.
- Los videos se transcriben automaticamente (audio del video) y te llegan como texto con el prefijo [Video transcrito].
- Los documentos PDF te llegan como texto extraido.
- NUNCA digas que no puedes ver imagenes, escuchar audios o leer documentos. SI puedes procesarlos.',

  -- Palabras clave de derivacion inmediata (eran _PALABRAS_DERIVAR)
  palabras_derivar = '["hablar con alguien","hablar con una persona","hablar con ejecutiva","hablar con un humano","hablar con una asistente","quiero hablar con","derivar","derivame","pasame con","necesito hablar con","agente humano","persona real","ejecutivo","ejecutiva","no quiero hablar con un bot","no quiero hablar contigo"]'::jsonb,

  -- Palabras clave de urgencia inmediata (eran _PALABRAS_URGENTE)
  palabras_urgente = '["no puedo entrar a mi clase","no puedo entrar a la clase","no puedo conectarme a la clase","clase en vivo","charla en vivo","ya empezo","ya empezó","esta empezando","está empezando","no me deja entrar","no puedo acceder ahora","taller ahora","clase ahora","charla ahora","necesito entrar ahora","link no funciona"]'::jsonb,

  -- Buffer de espera entre mensajes
  buffer_espera_segundos = 8,

  -- Mensaje de derivacion a humano
  mensaje_derivacion = 'Lo siento, no he podido resolver tu consulta. Estoy derivando tu caso a uno de nuestro equipo para que te asista.',

  actualizado_en = NOW(),
  actualizado_por = 'migracion_config_avanzada'
WHERE id_marca = 17841402405921340;

-- 3. Verificar
SELECT
  CASE WHEN prompt_clasificacion IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS clasificacion,
  CASE WHEN prompt_contexto_cliente IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS contexto,
  jsonb_array_length(palabras_derivar) AS n_palabras_derivar,
  jsonb_array_length(palabras_urgente) AS n_palabras_urgente,
  buffer_espera_segundos,
  LEFT(mensaje_derivacion, 40) AS msg_derivacion
FROM chat_academico_config
WHERE id_marca = 17841402405921340;
