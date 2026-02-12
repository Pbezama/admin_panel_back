# Admin Panel API - Documentación Completa

## Resumen Ejecutivo

**Admin Panel API** es un sistema de gestión empresarial con inteligencia artificial integrada, construido con Next.js 16. Permite a administradores de marcas gestionar datos, tareas y comentarios con asistencia de agentes IA, integrados con WhatsApp Business y Facebook/Instagram.

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Framework | Next.js 16.1.1 (API Routes) |
| Base de Datos | Supabase (PostgreSQL) |
| Almacenamiento | Supabase Storage |
| IA | OpenAI GPT-4o + Whisper |
| Mensajería | WhatsApp Business API |
| OAuth | Facebook Graph API v17.0 |
| Autenticación | JWT (jose) |
| Frontend | React 19.2.3 |

---

## Estructura del Proyecto

```
admin-panel-api/
├── app/
│   ├── api/                    # Endpoints REST
│   │   ├── auth/               # Autenticación
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── verify/
│   │   ├── chat/               # Chat con agentes IA
│   │   │   ├── chatia/
│   │   │   └── controlador/
│   │   ├── comments/           # Gestión de comentarios
│   │   ├── data/               # CRUD de datos de marca
│   │   ├── facebook/           # OAuth y cuentas FB/IG
│   │   ├── limites/            # Sistema de límites
│   │   ├── logs/               # Auditoría
│   │   ├── onboarding/         # Flujo inicial
│   │   ├── tareas/             # Sistema de tareas
│   │   ├── webhooks/           # Webhooks externos
│   │   ├── health/
│   │   └── transcribe/
│   ├── layout.js
│   └── page.js
├── lib/                        # Librerías core
│   ├── supabase.js            # Cliente BD (1292 líneas)
│   ├── auth.js                # JWT (109 líneas)
│   ├── whatsapp.js            # WhatsApp API (260 líneas)
│   ├── openai.js              # Cliente OpenAI (64 líneas)
│   ├── facebook.js            # OAuth Facebook (226 líneas)
│   └── limites.js             # Sistema de planes (163 líneas)
├── services/                   # Servicios de negocio
│   ├── agentManager.js        # Orquestador de agentes IA
│   ├── whatsappHandler.js     # Procesador mensajes entrantes
│   ├── whatsappSessionManager.js
│   └── whatsappControlador.js
├── agents/                     # Agentes de IA
│   ├── base/
│   │   └── BaseAgent.js
│   ├── controlador/           # Agente de gestión BD
│   │   ├── config.js
│   │   ├── tools.js
│   │   └── prompt.js
│   ├── chatia/                # Agente creativo
│   │   ├── config.js
│   │   ├── tools.js
│   │   └── prompt.js
│   └── index.js
└── package.json
```

---

## Módulos Principales

### 1. lib/supabase.js - Base de Datos

Cliente completo de Supabase con todas las operaciones CRUD.

#### Autenticación
```javascript
registrarUsuario(datos)          // Crear usuario + marca + límites
loginUsuario(usuario, contrasena) // Login con actualización último_login
emailExiste(email)               // Verificar duplicados
```

#### Datos de Marca
```javascript
obtenerDatosMarca(idMarca)       // Obtener datos activos
agregarDato(dato)                // Insertar nuevo dato
modificarDato(id, updates)       // Actualizar dato
desactivarDato(id)               // Soft delete
```

#### Tareas
```javascript
obtenerTareas(opciones)          // Listar con filtros por rol
crearTarea(tarea)                // Crear con notificación WhatsApp
actualizarTarea(id, updates)     // Actualizar campos
cambiarEstadoTareaConHistorial() // Cambio con registro en historial
obtenerColaboradores(idMarca)    // Listar colaboradores activos
```

#### Notas y Archivos
```javascript
obtenerNotasTarea(idTarea)       // Listar notas
agregarNotaTarea(nota)           // Agregar nota/comentario
subirArchivoTarea(buffer, idTarea, info) // Storage upload
obtenerHistorialTarea(idTarea)   // Ver cambios históricos
```

#### Facebook/Instagram
```javascript
guardarCuentaFacebook(datos)     // Guardar cuenta conectada
obtenerCuentasFacebook(idMarca)  // Listar cuentas
desconectarCuentaFacebook()      // Desactivar conexión
obtenerTokenFacebook()           // Obtener access token
```

#### Límites y Uso
```javascript
obtenerUsoMarca(idMarca)         // Obtener contadores
incrementarUso(idMarca, campo)   // Aumentar contador
decrementarUso(idMarca, campo)   // Disminuir contador
sincronizarUso(idMarca)          // Sync contadores con BD
verificarOnboarding(userId)      // Estado de onboarding
```

---

### 2. lib/auth.js - Autenticación JWT

```javascript
crearToken(usuario)              // JWT 24h con payload completo
verificarToken(token)            // Verificar y extraer payload
extraerToken(request)            // Obtener del header Authorization
verificarAutenticacion(request)  // Middleware de auth
esAdmin(usuario)                 // Verificar rol admin
esColaborador(usuario)           // Verificar rol colaborador
```

**Estructura del Token:**
```javascript
{
  id, usuario, nombre, id_marca, nombre_marca,
  es_super_admin, tipo_usuario, exp, iat
}
```

---

### 3. lib/whatsapp.js - WhatsApp Business API

```javascript
enviarNotificacionTarea(telefono, nombre) // Template de tarea asignada
enviarMensaje(telefono, texto)            // Mensaje simple
enviarMensajeConBotones(telefono, texto, botones) // Botones interactivos
enviarMenu(telefono, texto, boton, opciones)      // Lista de opciones
```

**Configuración:**
- Template: `2025_12_19_hola_mundo`
- Idioma: `es_CL`
- Versión API: `v18.0`
- Formato teléfono: `56991709265` (código país sin +)

---

### 4. lib/facebook.js - OAuth Facebook

```javascript
// OAuth Flow
buildOAuthUrl(state)             // URL de login
exchangeCodeForToken(code)       // Token corta duración
getLongLivedToken(token)         // Token 60 días
getPageLongLivedToken(pageId, token) // Token de página

// Datos
getUserPages(accessToken)        // Páginas del usuario
getInstagramAccount(igId, token) // Instagram Business
debugToken(accessToken)          // Validar token

// Utilidades
encodeState(userId, marcaId, callback) // State base64
decodeState(state)                     // Decodificar
```

---

### 5. lib/limites.js - Sistema de Planes

```javascript
const LIMITES = {
  gratuito: {
    comentarios: 5,
    datos: 5,
    tareas: 5,
    colaboradores: 0,        // Solo admin
    cuentas_facebook: 1,
    mensajes_chat: 20,
    informes: false,
    historial_tareas: false,
    archivos_adjuntos: false
  },
  premium: {
    comentarios: Infinity,
    datos: Infinity,
    tareas: Infinity,
    colaboradores: Infinity,
    cuentas_facebook: 10,
    mensajes_chat: Infinity,
    informes: true,
    historial_tareas: true,
    archivos_adjuntos: true
  }
}
```

```javascript
puedeRealizarAccion(plan, tipo, cantidad) // Verificar si puede
obtenerLimitesRestantes(plan, uso)        // Calcular disponible
tieneAcceso(plan, funcionalidad)          // Acceso a feature
getMensajeLimite(tipo, limite)            // Mensaje de error
```

---

## Sistema de Agentes IA

### Arquitectura

```
Usuario → API Endpoint → AgentManager → Agente → OpenAI → Tool Call → Respuesta
```

### AgentManager (services/agentManager.js)

```javascript
class AgentManager {
  setAgent(agentId)              // Cambiar agente activo
  getCurrentAgent()              // Obtener agente actual
  processMessage(msg, ctx, hist) // Procesar con OpenAI
  formatHistory(historial)       // Formatear para API
  reset()                        // Volver a controlador
}
```

### Agente Controlador

- **Rol:** Gestión de datos de marca en BD
- **Color:** Azul (#3b82f6)
- **Temperature:** 0.7
- **Puede delegar a:** ChatIA

**Tools disponibles:**
| Tool | Descripción |
|------|-------------|
| `responder_texto` | Respuesta conversacional |
| `mostrar_datos` | Tabla formateada |
| `pedir_confirmacion` | Pedir aprobación antes de CRUD |
| `ejecutar_accion` | Ejecutar cambio confirmado |
| `consultar_comentarios` | Buscar con filtros |
| `sugerir_delegacion` | Derivar a ChatIA |
| `crear_tarea` | Asignar tarea a colaborador |

### Agente ChatIA

- **Rol:** Asistente creativo para ideación
- **Color:** Naranja (#f59e0b)
- **Temperature:** 0.8
- **Puede delegar a:** Controlador

**Capacidades:**
- Idear promociones y ofertas
- Crear reglas y políticas
- Brainstorming creativo
- Redacción de textos
- Análisis de comentarios

**Nota:** ChatIA NO accede directamente a BD. Sugiere acciones mediante `sugerir_delegacion` y el Controlador ejecuta.

---

## API Endpoints

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrar usuario + marca |
| POST | `/api/auth/login` | Login, retorna JWT |
| GET | `/api/auth/verify` | Verificar token válido |

### Datos de Marca

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/data/marca` | Obtener datos activos |
| POST | `/api/data/add` | Agregar dato (verifica límites) |
| PUT | `/api/data/update` | Modificar dato |
| POST | `/api/data/deactivate` | Soft delete |

### Tareas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tareas` | Listar (filtro por rol) |
| POST | `/api/tareas` | Crear + notificación WhatsApp |
| GET | `/api/tareas/[id]` | Detalle de tarea |
| PUT | `/api/tareas/[id]` | Actualizar tarea |
| POST | `/api/tareas/[id]/notas` | Agregar nota |
| GET | `/api/tareas/[id]/notas` | Listar notas |
| GET | `/api/tareas/[id]/historial` | Ver cambios |
| POST | `/api/tareas/[id]/upload` | Subir archivo |
| GET | `/api/tareas/archivos` | Listar archivos |
| GET | `/api/tareas/colaboradores` | Listar colaboradores |

### Chat IA

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/chat/controlador` | Chat con Controlador |
| POST | `/api/chat/chatia` | Chat con ChatIA |

**Body:**
```json
{
  "mensaje": "texto del usuario",
  "contexto": { "datos": [...], "idMarca": 1 }
}
```

**Respuesta:**
```json
{
  "tipo_respuesta": "texto|tabla|confirmacion|accion_confirmada",
  "contenido": "...",
  "accionPendiente": { "accion": "agregar", "parametros": {...} }
}
```

### Facebook/Instagram

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/facebook/connect` | Iniciar OAuth |
| GET | `/api/facebook/callback` | Callback OAuth |
| GET | `/api/facebook/accounts` | Listar cuentas |
| POST | `/api/facebook/disconnect` | Desconectar cuenta |
| GET | `/api/facebook/proxy-accounts` | Cuentas con detalles |

### Onboarding y Límites

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/onboarding/status` | Estado de onboarding |
| POST | `/api/onboarding/complete` | Completar (requiere FB) |
| GET | `/api/limites` | Obtener límites y uso |
| POST | `/api/limites/sync` | Sincronizar contadores |

### Webhooks

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/webhooks/whatsapp` | Verificación Meta |
| POST | `/api/webhooks/whatsapp` | Recibir mensajes |

### Utilidades

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/transcribe` | Transcribir audio (Whisper) |
| POST | `/api/logs/action` | Registrar acción admin |
| GET | `/api/logs/chat` | Historial de chats |

---

## Modelos de Datos (Supabase)

### usuarios
```sql
id              SERIAL PRIMARY KEY
usuario         VARCHAR (email)
contrasena      VARCHAR (NOTA: sin hash actualmente)
nombre          VARCHAR
id_marca        INTEGER
nombre_marca    VARCHAR
tipo_usuario    VARCHAR ('adm' | 'colaborador')
es_super_admin  BOOLEAN
activo          BOOLEAN
plan            VARCHAR ('gratuito' | 'premium')
onboarding_completado BOOLEAN
ultimo_login    TIMESTAMP
fecha_registro  TIMESTAMP
telefono        VARCHAR
```

### base_cuentas (datos de marca)
```sql
id              SERIAL PRIMARY KEY
"ID marca"      INTEGER
"Nombre marca"  VARCHAR
"Categoría"     VARCHAR
"Clave"         VARCHAR
"Valor"         TEXT
"Prioridad"     INTEGER (1-6)
"Estado"        BOOLEAN
fecha_inicio    DATE
fecha_caducidad DATE
creado_en       TIMESTAMP
```

### tareas
```sql
id              SERIAL PRIMARY KEY
id_marca        INTEGER
nombre_marca    VARCHAR
titulo          VARCHAR
descripcion     TEXT
tipo            VARCHAR
prioridad       VARCHAR
estado          VARCHAR ('pendiente' | 'en_progreso' | 'completada')
asignado_a      INTEGER (FK usuarios)
nombre_asignado VARCHAR
creado_por      INTEGER
creado_por_sistema BOOLEAN
fecha_creacion  TIMESTAMP
fecha_limite    DATE
fecha_completada TIMESTAMP
activo          BOOLEAN
```

### notas_tareas
```sql
id              SERIAL PRIMARY KEY
id_tarea        INTEGER (FK tareas)
contenido       TEXT
nombre_creador  VARCHAR
usuario_id      INTEGER
archivo_url     VARCHAR
archivo_nombre  VARCHAR
archivo_tipo    VARCHAR
archivo_tamano  INTEGER
fecha_creacion  TIMESTAMP
```

### historial_tareas
```sql
id              SERIAL PRIMARY KEY
id_tarea        INTEGER (FK tareas)
campo_modificado VARCHAR
valor_anterior  TEXT
valor_nuevo     TEXT
modificado_por  INTEGER
nombre_modificador VARCHAR
fecha_modificacion TIMESTAMP
```

### cuentas_facebook
```sql
id              SERIAL PRIMARY KEY
usuario_id      INTEGER
id_marca        INTEGER
page_id         VARCHAR
page_name       VARCHAR
instagram_id    VARCHAR
instagram_username VARCHAR
access_token    TEXT
token_expires_at TIMESTAMP
conectado_en    TIMESTAMP
activo          BOOLEAN
```

### limites_uso
```sql
id_marca            INTEGER PRIMARY KEY
comentarios_usados  INTEGER
datos_usados        INTEGER
tareas_usadas       INTEGER
ultima_actualizacion TIMESTAMP
```

### logs_comentarios
```sql
id                  SERIAL PRIMARY KEY
id_marca            INTEGER
comentario_original TEXT
respuesta_comentario TEXT
es_inapropiado      BOOLEAN
clasificacion       VARCHAR
creado_en           TIMESTAMP
```

---

## Flujos Principales

### 1. Registro y Onboarding

```
1. POST /api/auth/register
   → Crear usuario + marca + límites iniciales
   → Retornar JWT

2. GET /api/onboarding/status
   → Verificar: completado?, tiene_facebook?

3. GET /api/facebook/connect
   → Redirigir a OAuth Facebook

4. GET /api/facebook/callback
   → Guardar página + Instagram Business

5. POST /api/onboarding/complete
   → Verificar ≥1 cuenta conectada
   → Marcar completado
```

### 2. Gestión de Datos con IA

```
1. Usuario: "Agrega promoción 20% descuento"
   → POST /api/chat/controlador

2. Controlador analiza y retorna:
   { tipo: 'pedir_confirmacion', accionPendiente: {...} }

3. Usuario confirma en frontend

4. Frontend envía confirmación
   → Controlador ejecuta con ejecutar_accion

5. Backend:
   → Verifica límites
   → POST /api/data/add
   → Incrementa datos_usados
```

### 3. Asignación de Tareas

```
1. Admin: "Asigna tarea a Juan"
   → POST /api/tareas

2. Backend:
   → Crear tarea en BD
   → Incrementar tareas_usadas
   → enviarNotificacionTarea() WhatsApp

3. Colaborador recibe notificación

4. Colaborador accede:
   → GET /api/tareas (sus tareas)
   → Agrega notas, cambia estado
```

### 4. Webhook WhatsApp Entrante

```
1. Cliente envía mensaje

2. Meta → POST /api/webhooks/whatsapp
   → Retorna 200 inmediatamente

3. Background:
   → Buscar usuario por teléfono
   → Procesar con agente
   → Responder automáticamente
```

---

## Variables de Entorno

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# WhatsApp Business
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_TEMPLATE_NAME=

# Facebook
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=

# JWT
JWT_SECRET=
```

---

## Consideraciones de Seguridad

**Implementado:**
- JWT autenticación
- Validación de entrada
- Verificación de roles
- Soft deletes
- Auditoría de cambios

**Pendiente:**
- Hashear contraseñas (bcrypt)
- Configurar CORS
- Rate limiting
- Refresh tokens
- HTTPS en producción

---

## Puntos de Integración

Para integrar un nuevo proyecto con este sistema, los principales puntos son:

1. **Autenticación:** Usar `/api/auth/*` endpoints con JWT
2. **Datos:** CRUD via `/api/data/*` endpoints
3. **Tareas:** Sistema completo en `/api/tareas/*`
4. **IA:** Interactuar con agentes via `/api/chat/*`
5. **Webhooks:** Recibir eventos en `/api/webhooks/*`
6. **Límites:** Verificar siempre antes de crear recursos

---

*Documentación generada el 21/01/2026*
