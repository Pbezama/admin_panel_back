-- =====================================================
-- MIGRACION: Chat Academico PreUCV
-- Sistema de configuracion de chatbot desde panel CreceTec
-- =====================================================
-- ID Marca PreUCV: 17841402405921340
-- =====================================================

-- =====================================================
-- 1. CREAR TABLAS
-- =====================================================

-- Tabla principal de configuracion (1 fila por marca)
CREATE TABLE IF NOT EXISTS chat_academico_config (
  id                          SERIAL PRIMARY KEY,
  id_marca                    BIGINT NOT NULL UNIQUE,

  -- System Prompt (4 secciones)
  prompt_rol                  TEXT DEFAULT '',
  prompt_estilo               TEXT DEFAULT '',
  prompt_reglas               TEXT DEFAULT '',
  prompt_consideraciones      TEXT DEFAULT '',

  -- Parametros de conversacion
  tiempo_espera_respuesta     INTEGER DEFAULT 120,
  intentos_reactivacion       INTEGER DEFAULT 1,
  mensaje_reactivacion        TEXT DEFAULT 'Hola? Sigues ahi?',
  mensaje_despedida           TEXT DEFAULT 'Espero haberlo ayudado con sus dudas, nos vemos!',
  mensaje_timeout             TEXT DEFAULT 'Se acabo el tiempo de espera, puede comunicarse mas tarde, nos vemos',
  mensaje_error               TEXT DEFAULT 'Lo siento, ocurrio un error. Intente nuevamente mas tarde.',
  webhook_derivacion          TEXT DEFAULT '',
  webhook_callback            TEXT DEFAULT '',

  -- Parametros del modelo
  temperatura                 REAL DEFAULT 0.7,
  max_tokens                  INTEGER DEFAULT 1500,
  parallel_tool_calls         BOOLEAN DEFAULT true,

  -- Multi-canal
  canales_activos             JSONB DEFAULT '["whatsapp"]'::jsonb,

  -- Auditoria
  creado_en                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_por             TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_academico_config_marca
  ON chat_academico_config(id_marca);

-- Tabla de herramientas/tools (N por marca)
CREATE TABLE IF NOT EXISTS chat_academico_herramientas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_marca          BIGINT NOT NULL,
  nombre            VARCHAR(100) NOT NULL,
  nombre_display    VARCHAR(200),
  descripcion       TEXT NOT NULL DEFAULT '',
  tipo              VARCHAR(50) NOT NULL DEFAULT 'respuesta_fija'
                    CHECK (tipo IN ('respuesta_fija', 'google_sheets', 'custom_python', 'flujo')),
  respuesta_texto   TEXT DEFAULT '',
  id_flujo          UUID,
  parametros_openai JSONB DEFAULT '{}'::jsonb,
  activo            BOOLEAN NOT NULL DEFAULT true,
  es_semilla        BOOLEAN NOT NULL DEFAULT false,
  orden             INTEGER DEFAULT 0,
  creado_en         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  actualizado_por   TEXT,

  UNIQUE(id_marca, nombre)
);

CREATE INDEX IF NOT EXISTS idx_chat_academico_herramientas_marca
  ON chat_academico_herramientas(id_marca);
CREATE INDEX IF NOT EXISTS idx_chat_academico_herramientas_activo
  ON chat_academico_herramientas(id_marca, activo);

-- Tabla de historial de cambios (audit log)
CREATE TABLE IF NOT EXISTS chat_academico_historial (
  id              SERIAL PRIMARY KEY,
  id_marca        BIGINT NOT NULL,
  usuario_nombre  TEXT,
  seccion         VARCHAR(50) NOT NULL,
  accion          VARCHAR(50) NOT NULL,
  detalle         JSONB,
  creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_academico_historial_marca
  ON chat_academico_historial(id_marca);
CREATE INDEX IF NOT EXISTS idx_chat_academico_historial_fecha
  ON chat_academico_historial(creado_en DESC);


-- =====================================================
-- 2. INSERTAR CONFIGURACION PREUCV (datos del chatacademico.py)
-- =====================================================

INSERT INTO chat_academico_config (
  id_marca,
  prompt_rol,
  prompt_estilo,
  prompt_reglas,
  prompt_consideraciones,
  tiempo_espera_respuesta,
  intentos_reactivacion,
  mensaje_reactivacion,
  mensaje_despedida,
  mensaje_timeout,
  mensaje_error,
  webhook_derivacion,
  webhook_callback,
  temperatura,
  max_tokens,
  parallel_tool_calls,
  canales_activos,
  actualizado_por
) VALUES (
  17841402405921340,

  -- prompt_rol
  'Atiende consultas, resuelve dudas y gestiona reclamos de estudiantes, apoderados y otros interesados de manera cálida, cercana y empática, ofreciendo información precisa y soluciones efectivas dentro del contexto chileno.',

  -- prompt_estilo
  'Utiliza un lenguaje natural, chileno, evitando tecnicismos. Si no posees cierta información, deriva la consulta a otro miembro del equipo. No inventes información.

- **Formación NEPQ**: Aplica los principios del NEPQ de Jeremy Miner, adaptados al ámbito académico, para dirigir conversaciones, calificar prospectos y guiar las interacciones.
- **Saludo y Personalización**: Inicia la conversación saludando de manera personalizada y adaptando las respuestas según los datos disponibles del usuario.

Proporciona respuestas de forma conversacional, adaptándose al contexto y respetando las reglas establecidas. Usa emojis y texto en negrita cuando sea necesario para mejorar la comunicación.',

  -- prompt_reglas
  '- Saluda al principio de la conversación.
- No saludes más de una vez.
- No mencionas precios en ningún momento.
- Si no sabes algo, deriva la consulta mediante el mismo medio de comunicación, sin ofrecer alternativas.
- No repitas información más de una vez a menos que te lo pregunten nuevamente.
- Utiliza emojis o texto en negrita para facilitar e interactuar mejor en la comunicación.',

  -- prompt_consideraciones
  '- Para estudiantes del programa Blender:
  - Clases de matemática y lenguaje: presenciales u online.
  - Electivos: 100% online.
- Acceso a clases virtuales siempre es mediante el campus virtual.
- Nunca se envían links de Zoom por correo electrónico, siempre están en el campus virtual.
- Si un alumno quiere ser agregado a un grupo de difusión de WhatsApp, deriva la consulta.
- Las cancelaciones y reservas de clases virtuales y presenciales se deben realizar al menos con 24 horas de anticipación.
- Las clases de M2 comienzan la semana del 5 de mayo.
- La apertura de agenda para clases presenciales son los viernes desde 14:00 hrs y para clases virtuales son los sábados desde las 13:00 hrs.',

  -- tiempo_espera_respuesta (120 seg = 2 min, como en evaluar_conversacion_bot)
  120,

  -- intentos_reactivacion (1 intento, luego deriva)
  1,

  -- mensaje_reactivacion
  'Hola? Sigues ahí?',

  -- mensaje_despedida
  'Espero haberlo ayudado con sus dudas, nos vemos!',

  -- mensaje_timeout
  'Se acabo el tiempo de espera, puede comunicarse mas tarde, nos vemos',

  -- mensaje_error
  'Lo siento, ocurrió un error. Intente nuevamente más tarde.',

  -- webhook_derivacion (MessageBird flow webhook)
  'https://flows.messagebird.com/flows/invocations/webhooks/3e2a8475-ed7f-4379-b790-8d35b1ec53f8',

  -- webhook_callback (PythonAnywhere endpoint para continuar conversacion)
  'https://robotventa-pbezama.pythonanywhere.com/ConversacionBot',

  -- temperatura
  0.7,

  -- max_tokens
  1500,

  -- parallel_tool_calls
  true,

  -- canales_activos
  '["whatsapp"]'::jsonb,

  -- actualizado_por
  'migracion_inicial'

) ON CONFLICT (id_marca) DO NOTHING;


-- =====================================================
-- 3. INSERTAR 15 HERRAMIENTAS SEMILLA (del chatacademico.py)
-- =====================================================

-- Tool 1: obtenerCertificadoAlumnoRegular
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'obtenerCertificadoAlumnoRegular',
  'Certificado Alumno Regular',
  'Proporciona información para obtener el certificado de alumno regular.',
  'respuesta_fija',
  'Para obtener el certificado de alumno regular, debes solicitarlo mediante correo electronico a docencia@pre-ucv.cl.',
  '{"type":"object","properties":{"consulta":{"type":"string","description":"Texto de la consulta del cliente."}},"required":["consulta"],"additionalProperties":false}'::jsonb,
  true, true, 1, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 2: tutorialAgendamiento
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'tutorialAgendamiento',
  'Tutorial Agendamiento',
  'Proporciona un tutorial de agendamiento para alumnos o apoderados que no sepan cómo agendar o consulten sobre el horario de clases.',
  'respuesta_fija',
  'El sistema de agendamiento se actualiza semana tras semana a través de la plataforma virtual. Para aprender a agendar tus clases, revisa los siguientes tutoriales Agendamiento Clases Presenciales: [https://youtu.be/rgXn5wPQt-c]  Agendamiento Clases Virtuales: [https://youtu.be/UtYQDpVLYIo]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 2, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 3: comoEntrarAclases
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'comoEntrarAclases',
  'Cómo Entrar a Clases',
  'Proporciona un tutorial para que los alumnos o apoderados aprendan cómo ingresar a sus clases agendadas y muestra donde está ubicado el link de las clases.',
  'respuesta_fija',
  'Para aprender a ingresar a tus clases agendadas, revisa el siguiente tutorial: [https://www.youtube.com/watch?v=J0AGih5wfAs]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 3, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 4: solicitudTerminoDeContrato
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'solicitudTerminoDeContrato',
  'Término de Contrato',
  'Proporciona formulario google para que los alumnos o apoderados soliciten dar de baja el contrato.',
  'respuesta_fija',
  '¿Quieres solicitar el término de contrato? Debes completar un formulario con toda la información y documentación necesaria.

📌 Requisitos básicos:
✅ Estar conectado con una cuenta de Google.
✅ Ingresar nombres completos del alumno y apoderado (como aparecen en la matrícula).
✅ Adjuntar documentos según la causal (ver cláusula 8va del contrato). Si no aplica ninguna, puedes elegir la opción "Otro" y explicar tu caso.

⏳ Plazos importantes:
Tiempo máximo de respuesta: 15 días hábiles.
Si no respondes dentro de 30 días, la solicitud se rechazará automáticamente.

¿Te comparto el enlace al formulario? 😊: [https://docs.google.com/forms/d/e/1FAIpQLSdT4tNLZXpjIn1G3a6GnG00DXiyoREWbGA512Ee4lCg2eFp2Q/viewform]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 4, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 5: derivarConsultaAHumano
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'derivarConsultaAHumano',
  'Derivar a Humano',
  'Deriva la consulta a un agente humano cuando no se puede resolver el problema.',
  'custom_python',
  'Lo siento, no he podido resolver tu consulta. Estoy derivando tu caso a uno de nuestro equipo para que te asista.',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 5, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 6: obtenerDatosAlumnoDesdeSheets
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'obtenerDatosAlumnoDesdeSheets',
  'Buscar Alumno por Teléfono',
  'Obtiene datos del alumno o apoderado a partir de un número de teléfono consultando Google Sheets.',
  'google_sheets',
  '',
  '{"type":"object","properties":{"telefono":{"type":"string","description":"Número de teléfono para buscar en las hojas de cálculo."}},"required":["telefono"],"additionalProperties":false}'::jsonb,
  true, true, 6, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 7: obtenerDatosAlumnoPorRutDesdeSheets
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'obtenerDatosAlumnoPorRutDesdeSheets',
  'Buscar Alumno por RUT',
  'Obtiene datos del alumno o apoderado a partir del RUT consultando Google Sheets. Se utiliza cuando no se encuentran datos utilizando el número de celular.',
  'google_sheets',
  '',
  '{"type":"object","properties":{"rut":{"type":"string","description":"RUT del alumno para buscar en las hojas de cálculo."}},"required":["rut"],"additionalProperties":false}'::jsonb,
  true, true, 7, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 8: informacionActividades
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'informacionActividades',
  'Información Actividades',
  'Proporciona información sobre las actividades que le corresponde realizar a un alumno o apoderado.',
  'respuesta_fija',
  'Todas las actividades que le corresponde realizar se envían mediante correo electrónico la semana anterior a las actividades y mediante grupo de WhatsApp del programa contratado.',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 8, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 9: entrarAlCampus
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'entrarAlCampus',
  'Entrar al Campus',
  'Proporciona información para cuando el alumno no sabe acceder o no puede entrar al campus virtual.',
  'respuesta_fija',
  'Para ingresar al campus debes seguir los pasos que están en la imagen que te acabo de enviar: [https://imgur.com/a/ZOtRcpk]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 9, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 10: ClaveDelCampus
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'ClaveDelCampus',
  'Clave del Campus',
  'Proporciona información para cuando el alumno no sabe cuál es su contraseña o usuario para acceder al campus virtual.',
  'respuesta_fija',
  'Tu clave y usuario del campus virtual es con tu nombre y rut. Para entrar sigue los pasos de la siguiente imagen: [https://imgur.com/a/ZOtRcpk]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 10, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 11: CuotasPendientes
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'CuotasPendientes',
  'Cuotas Pendientes',
  'Proporciona información para cuando el usuario no sabe cuánto debe pagar ni cómo pagar el preuniversitario.',
  'respuesta_fija',
  '💬 ¿Quieres revisar o pagar tus cuotas pendientes?
¡Súper fácil! Solo sigue estos pasos:
1️⃣ Ingresa a preucv.cl
2️⃣ Haz clic en Pago Express
3️⃣ Ingresa el RUT del apoderado (quien firmó el contrato)
4️⃣ Revisa el valor total a pagar
5️⃣ Realiza el pago de forma segura a través de WebPay
Como se ve en la siguiente imagen: [https://imgur.com/a/pago-express-preucv-GyBE4IL]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 11, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 12: paseDeAgendamiento
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'paseDeAgendamiento',
  'Pase de Agendamiento',
  'Proporciona información para cuando los alumnos que van a clases presenciales no saben sacar ni cómo usar su pase de agendamiento.',
  'respuesta_fija',
  '¿Vas a clases presenciales? ¡No olvides tu Pase de Agendamiento!
🔹 Te lo enviaremos por correo, revisa tu bandeja de entrada y/o spam.
🔹 Llega 30 minutos antes y ten tu pase listo para mostrarlo al ingresar.
🔹 El código QR del pase es tu asistencia y será escaneado en la sede.
🔹 Sin pase no podrás ingresar, así que revísalo con anticipación.
¿Quieres que te ayudemos a ubicar tu pase? 😊 mira la siguiente imagen: [https://imgur.com/a/G3DgDsb]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 12, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 13: cambioDeSedeAcademica
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'cambioDeSedeAcademica',
  'Cambio de Sede',
  'Proporciona información de cómo solicitar el cambio de sede académica.',
  'respuesta_fija',
  'Para solicitar cambiar sede academica debes enviar un correo de manera formal con la solicitud a docencia@pre-ucv.cl',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 13, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 14: cambioDeAsignatura
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'cambioDeAsignatura',
  'Cambio de Asignatura',
  'Proporciona información de cómo solicitar el cambio de asignatura.',
  'respuesta_fija',
  'Para solicitar cambio de asignatura debe enviar un correo de manera formal con la solicitud a docencia@pre-ucv.cl',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 14, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- Tool 15: inicioClases
INSERT INTO chat_academico_herramientas (id_marca, nombre, nombre_display, descripcion, tipo, respuesta_texto, parametros_openai, activo, es_semilla, orden, actualizado_por)
VALUES (
  17841402405921340,
  'inicioClases',
  'Inicio de Clases',
  'Proporciona la información de inicio de clases e invoca el tutorial de agendamiento.',
  'respuesta_fija',
  'Las actividades de inmersión comienzan 48 horas después de realizar la matrícula, y las clases como tal comienzan el 7 de abril. Toda la información le llegará mediante correo electrónico para que esté pendiente.

El sistema de agendamiento se actualiza semana tras semana a través de la plataforma virtual. Para aprender a agendar tus clases, revisa los siguientes tutoriales Agendamiento Clases Presenciales: [https://youtu.be/rgXn5wPQt-c]  Agendamiento Clases Virtuales: [https://youtu.be/UtYQDpVLYIo]',
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
  true, true, 15, 'migracion_inicial'
) ON CONFLICT (id_marca, nombre) DO NOTHING;

-- =====================================================
-- 4. REGISTRO EN HISTORIAL
-- =====================================================

INSERT INTO chat_academico_historial (id_marca, usuario_nombre, seccion, accion, detalle)
VALUES (
  17841402405921340,
  'migracion_inicial',
  'instrucciones',
  'crear',
  '{"nota": "Configuracion inicial migrada desde chatacademico.py con 15 herramientas semilla"}'::jsonb
);
