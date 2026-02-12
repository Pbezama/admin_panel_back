# Integración OAuth Facebook: PythonAnywhere ↔ Next.js

## Documento de Especificaciones para Implementación

**Fecha:** 21 de Enero 2026  
**Proyecto:** CreceTec - Admin Panel  
**Objetivo:** Conectar el OAuth de Facebook/Instagram desde Next.js delegando a PythonAnywhere, guardando tokens en Supabase

---

## 1. CONTEXTO GENERAL

### 1.1 Arquitectura Actual (Antes)

```
┌─────────────────────────────────────────────────────────┐
│  BP_comentarios.py (PythonAnywhere)                     │
│  - OAuth Facebook completo                              │
│  - Guarda en Google Sheets                              │
│  - Procesa webhooks                                     │
│  - Responde comentarios                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  comentarios_supabase.py v3.0 (PythonAnywhere)          │
│  - Procesa webhooks de Meta                             │
│  - Responde comentarios automáticamente                 │
│  - Usa Supabase 100%                                    │
│  - FUNCIONANDO CORRECTAMENTE                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Admin Panel (Next.js en Vercel)                        │
│  - Frontend de gestión                                  │
│  - Agentes IA                                           │
│  - SIN conexión a OAuth de Facebook                     │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Arquitectura Objetivo (Después)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      USUARIO EN NAVEGADOR                           │
│              Hace clic en "Conectar Facebook/Instagram"             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              ADMIN PANEL (Next.js en Vercel)                        │
│              https://controladorbbdd.vercel.app                     │
│                                                                     │
│  /api/facebook/connect     → Redirige a PythonAnywhere              │
│  /api/facebook/callback    → Recibe resultado del OAuth             │
│  /api/facebook/accounts    → Lista cuentas desde Supabase           │
│  /api/webhooks/meta        → (Opcional futuro)                      │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               │ Redirect para OAuth
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PYTHONANYWHERE (Solo OAuth Gateway)                    │
│              https://mrkt21-pbezama.pythonanywhere.com              │
│                                                                     │
│  /oauth/facebook/init      → Inicia flujo OAuth                     │
│  /oauth/facebook/callback  → Recibe código de Facebook              │
│                                                                     │
│  Funciones:                                                         │
│  1. Recibir parámetros de Next.js (user_id, marca_id, callback)    │
│  2. Redirigir a Facebook para autorización                          │
│  3. Recibir código de autorización de Facebook                      │
│  4. Intercambiar por token de larga duración                        │
│  5. Obtener páginas e Instagram Business Account                    │
│  6. GUARDAR EN SUPABASE (NO Google Sheets)                         │
│  7. Redirigir a Next.js con resultado                               │
│                                                                     │
│  ❌ NO procesa webhooks de comentarios                              │
│  ❌ NO responde comentarios                                         │
│  ❌ NO usa Google Sheets                                            │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              comentarios_supabase.py v3.0 (PythonAnywhere)          │
│                                                                     │
│  /webhook                  → Recibe eventos de Meta                 │
│                                                                     │
│  - Procesa comentarios de Instagram/Facebook                        │
│  - Genera respuestas con OpenAI                                     │
│  - Envía respuestas y DMs                                          │
│  - Lee tokens desde Supabase                                        │
│  - FUNCIONANDO - NO MODIFICAR                                       │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                    │
│                    (Base de datos compartida)                       │
│                                                                     │
│  Tablas relevantes:                                                 │
│  ├── usuarios                                                       │
│  ├── cuentas_facebook  ← Aquí se guardan los tokens OAuth          │
│  ├── cuentas_instagram ← Usada por comentarios_supabase.py         │
│  ├── base_cuentas      ← Datos de marca, prompts                   │
│  ├── logs_comentarios                                               │
│  └── comment_locks                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. URLs Y DOMINIOS

### 2.1 URLs del Sistema

| Sistema | URL | Estado |
|---------|-----|--------|
| Admin Panel (Next.js) | `https://controladorbbdd.vercel.app` | Producción |
| PythonAnywhere | `https://mrkt21-pbezama.pythonanywhere.com` | Producción |
| Facebook App Callback (existente) | `https://comentariosmarketing-pbezama.pythonanywhere.com/facebook_callback` | Funcionando |

### 2.2 Redirect URIs en Facebook Developer (Ya configurados)

Los siguientes URIs ya están configurados en la Facebook App:

```
https://comentariosmarketing-pbezama.pythonanywhere.com/facebook_callback
https://www.mrkt21.com/comentarios/facebook_callback  ← DEPRECAR (dominio vendido)
https://www.mrkt21.com/presupuestos/callback          ← DEPRECAR
https://comentariosmarketing-pbezama.pythonanywhere.com/presupuestos/callback
https://localhost:5173/presupuestos/facebook-login
https://localhost:5173/
https://bot19.bepretty-store.com/ads.php
https://bepretty-store.com/home/redirect_rx_link
https://bepretty-store.com/home/facebook_login_back
https://bepretty-store.com/social_accounts/manual_renew_account
https://comentariosmarketing-pbezama.pythonanywhere.com/auth1/callback
https://comentariosmarketing-pbezama.pythonanywhere.com/auth/adoptimizer/callback
https://presupuestosfacebook-production.up.railway.app/api/auth/facebook/callback
https://admin-panel-back-psi.vercel.app/
https://controladorbbdd.vercel.app/chat
```

### 2.3 Redirect URIs a AGREGAR en Facebook Developer

```
https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/callback
```

**IMPORTANTE:** Este URI debe agregarse ANTES de implementar el código.

---

## 3. FLUJO OAUTH DETALLADO

### 3.1 Diagrama de Secuencia

```
┌──────────┐     ┌──────────┐     ┌─────────────────┐     ┌──────────┐     ┌──────────┐
│  Usuario │     │  Next.js │     │ PythonAnywhere  │     │ Facebook │     │ Supabase │
└────┬─────┘     └────┬─────┘     └───────┬─────────┘     └────┬─────┘     └────┬─────┘
     │                │                    │                    │                │
     │ Clic "Conectar"│                    │                    │                │
     │───────────────>│                    │                    │                │
     │                │                    │                    │                │
     │                │ GET /oauth/facebook/init               │                │
     │                │ ?user_id=X&marca_id=Y&callback=Z       │                │
     │                │───────────────────>│                    │                │
     │                │                    │                    │                │
     │                │    302 Redirect    │                    │                │
     │<───────────────────────────────────>│                    │                │
     │                │                    │                    │                │
     │                │                    │ GET /dialog/oauth  │                │
     │                │                    │ ?client_id=...     │                │
     │<────────────────────────────────────────────────────────>│                │
     │                │                    │                    │                │
     │  Usuario autoriza en Facebook       │                    │                │
     │────────────────────────────────────────────────────────>│                │
     │                │                    │                    │                │
     │                │                    │ GET /oauth/facebook/callback       │
     │                │                    │ ?code=AUTH_CODE    │                │
     │                │                    │<───────────────────│                │
     │                │                    │                    │                │
     │                │                    │ POST /oauth/access_token            │
     │                │                    │───────────────────>│                │
     │                │                    │ { access_token }   │                │
     │                │                    │<───────────────────│                │
     │                │                    │                    │                │
     │                │                    │ GET /me/accounts   │                │
     │                │                    │───────────────────>│                │
     │                │                    │ { pages[] }        │                │
     │                │                    │<───────────────────│                │
     │                │                    │                    │                │
     │                │                    │ INSERT cuentas_facebook             │
     │                │                    │────────────────────────────────────>│
     │                │                    │                    │                │
     │                │                    │ INSERT cuentas_instagram            │
     │                │                    │────────────────────────────────────>│
     │                │                    │                    │                │
     │                │ 302 Redirect       │                    │                │
     │                │ /api/facebook/callback?success=true    │                │
     │<───────────────│<───────────────────│                    │                │
     │                │                    │                    │                │
     │                │ Query Supabase     │                    │                │
     │                │────────────────────────────────────────────────────────>│
     │                │                    │                    │                │
     │ UI Actualizada │                    │                    │                │
     │<───────────────│                    │                    │                │
```

### 3.2 Paso a Paso

**PASO 1: Usuario inicia conexión (Next.js)**

```
Usuario hace clic en botón "Conectar Facebook/Instagram"
↓
Next.js /api/facebook/connect genera URL:
https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/init
  ?user_id={id del usuario en Supabase}
  &marca_id={id_marca / instagram_id}
  &callback_url=https://controladorbbdd.vercel.app/api/facebook/callback
↓
Redirect del navegador a PythonAnywhere
```

**PASO 2: PythonAnywhere inicia OAuth con Facebook**

```
PythonAnywhere recibe la petición
↓
Guarda en session: user_id, marca_id, callback_url
↓
Genera URL de Facebook OAuth:
https://www.facebook.com/v17.0/dialog/oauth
  ?client_id={APP_ID}
  &redirect_uri=https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/callback
  &scope=pages_show_list,pages_read_engagement,pages_manage_metadata,
         instagram_basic,instagram_manage_comments,instagram_manage_messages,
         business_management,pages_messaging
  &state={base64(user_id|marca_id|callback_url)}
↓
Redirect a Facebook
```

**PASO 3: Usuario autoriza en Facebook**

```
Facebook muestra pantalla de permisos
↓
Usuario acepta
↓
Facebook redirige a:
https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/callback
  ?code={AUTHORIZATION_CODE}
  &state={encoded_state}
```

**PASO 4: PythonAnywhere procesa el callback**

```
PythonAnywhere recibe el código
↓
Decodifica state para obtener user_id, marca_id, callback_url
↓
Intercambia código por token corto:
POST https://graph.facebook.com/v17.0/oauth/access_token
  ?client_id={APP_ID}
  &client_secret={APP_SECRET}
  &redirect_uri={REDIRECT_URI}
  &code={AUTHORIZATION_CODE}
↓
Intercambia token corto por token largo (60 días):
GET https://graph.facebook.com/v17.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={SHORT_TOKEN}
↓
Obtiene páginas del usuario:
GET https://graph.facebook.com/v17.0/me/accounts
  ?fields=id,name,access_token,instagram_business_account
  &access_token={LONG_TOKEN}
↓
Para cada página con Instagram Business Account:
  - Obtiene token de página de larga duración
  - Guarda en Supabase tabla "cuentas_facebook"
  - Guarda en Supabase tabla "cuentas_instagram" (para comentarios_supabase.py)
↓
Redirect a Next.js:
https://controladorbbdd.vercel.app/api/facebook/callback
  ?success=true
  &accounts_connected={número}
  &page_name={nombre primera página}
  &instagram_id={id de instagram}
```

**PASO 5: Next.js recibe confirmación**

```
Next.js /api/facebook/callback recibe los parámetros
↓
Si success=true:
  - Consulta Supabase para obtener cuentas actualizadas
  - Actualiza UI mostrando cuentas conectadas
  - Redirige a dashboard con mensaje de éxito
↓
Si success=false:
  - Muestra mensaje de error
  - Permite reintentar
```

---

## 4. ESPECIFICACIONES TÉCNICAS

### 4.1 Variables de Entorno

**PythonAnywhere (necesarias para el OAuth Gateway):**

```env
# Facebook App
APP_ID=tu_facebook_app_id
APP_SECRET=tu_facebook_app_secret
REDIRECT_URI_OAUTH=https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/callback

# Supabase (MISMO que Next.js)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_service_role_key

# Flask
SECRET_KEY=clave_secreta_flask
```

**Next.js/Vercel:**

```env
# Supabase (MISMO que PythonAnywhere)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# PythonAnywhere
PYTHONANYWHERE_OAUTH_URL=https://mrkt21-pbezama.pythonanywhere.com

# JWT
JWT_SECRET=tu_jwt_secret
```

### 4.2 Permisos de Facebook (Scopes)

```python
FACEBOOK_SCOPES = [
    'public_profile',
    'pages_show_list',
    'pages_read_engagement',
    'pages_read_user_content',
    'pages_manage_engagement',
    'pages_manage_metadata',
    'pages_messaging',
    'business_management',
    'instagram_basic',
    'instagram_manage_comments',
    'instagram_manage_messages',
]
```

### 4.3 Estructura de Tablas en Supabase

**Tabla: cuentas_facebook** (usada por Admin Panel)

```sql
CREATE TABLE IF NOT EXISTS cuentas_facebook (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER,                    -- FK a usuarios
    id_marca INTEGER,                      -- Puede ser igual a instagram_id
    page_id VARCHAR(50) NOT NULL,
    page_name VARCHAR(255),
    instagram_id VARCHAR(50),              -- Instagram Business Account ID
    instagram_username VARCHAR(100),
    access_token TEXT NOT NULL,            -- Token de larga duración
    token_expires_at TIMESTAMP,            -- Fecha de expiración
    conectado_en TIMESTAMP DEFAULT NOW(),
    activo BOOLEAN DEFAULT TRUE,
    UNIQUE(page_id, usuario_id)
);
```

**Tabla: cuentas_instagram** (usada por comentarios_supabase.py)

```sql
CREATE TABLE IF NOT EXISTS cuentas_instagram (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),                   -- ID interno del usuario
    page_id VARCHAR(50) NOT NULL,
    page_name VARCHAR(255),
    instagram_id VARCHAR(50) NOT NULL,     -- Este es el ID que usa como id_marca
    instagram_name VARCHAR(100),
    page_access_token TEXT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_conexion TIMESTAMP DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP,
    ultima_actividad TIMESTAMP,
    comentarios_procesados INTEGER DEFAULT 0,
    dms_enviados INTEGER DEFAULT 0,
    UNIQUE(instagram_id)
);
```

**NOTA IMPORTANTE:** `instagram_id` es usado como `id_marca` en todo el sistema. Cuando se guarda una cuenta, el `instagram_id` se convierte en el identificador principal de la marca.

---

## 5. CÓDIGO A IMPLEMENTAR

### 5.1 PythonAnywhere: Nuevo Blueprint OAuth Gateway

**Archivo: `BP_oauth_gateway.py`**

Este es un NUEVO archivo que debe crearse. Es un Blueprint de Flask que maneja SOLO el OAuth.

```python
"""
BP_oauth_gateway.py
===================
Blueprint para manejar OAuth de Facebook/Instagram.
Solo hace OAuth y guarda en Supabase.
NO procesa comentarios, NO usa Google Sheets.
"""

import os
import json
import base64
import requests
from datetime import datetime, timedelta
from flask import Blueprint, request, redirect, session, jsonify
from supabase import create_client, Client

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════════

oauth_bp = Blueprint('oauth', __name__, url_prefix='/oauth')

# Facebook App credentials
APP_ID = os.environ.get('APP_ID') or os.environ.get('APP_ID_COMENTARIOS')
APP_SECRET = os.environ.get('APP_SECRET') or os.environ.get('APP_SECRET_COMENTARIOS')
REDIRECT_URI = os.environ.get('REDIRECT_URI_OAUTH', 
    'https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/callback')

# Supabase
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Facebook Graph API version
GRAPH_API_VERSION = 'v17.0'
GRAPH_API_URL = f'https://graph.facebook.com/{GRAPH_API_VERSION}'

# Permisos requeridos
FACEBOOK_SCOPES = [
    'public_profile',
    'pages_show_list',
    'pages_read_engagement',
    'pages_read_user_content',
    'pages_manage_engagement',
    'pages_manage_metadata',
    'pages_messaging',
    'business_management',
    'instagram_basic',
    'instagram_manage_comments',
    'instagram_manage_messages',
]

# ═══════════════════════════════════════════════════════════════════════════════
# UTILIDADES
# ═══════════════════════════════════════════════════════════════════════════════

def encode_state(user_id, marca_id, callback_url):
    """Codifica los parámetros en base64 para el state de OAuth."""
    data = f"{user_id}|{marca_id}|{callback_url}"
    return base64.urlsafe_b64encode(data.encode()).decode()

def decode_state(state):
    """Decodifica el state de OAuth."""
    try:
        data = base64.urlsafe_b64decode(state.encode()).decode()
        parts = data.split('|')
        return {
            'user_id': parts[0],
            'marca_id': parts[1],
            'callback_url': parts[2] if len(parts) > 2 else None
        }
    except Exception as e:
        print(f"[OAUTH] Error decodificando state: {e}")
        return None

def get_long_lived_token(short_token):
    """Intercambia token corto por token de larga duración (60 días)."""
    url = f'{GRAPH_API_URL}/oauth/access_token'
    params = {
        'grant_type': 'fb_exchange_token',
        'client_id': APP_ID,
        'client_secret': APP_SECRET,
        'fb_exchange_token': short_token
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        return data.get('access_token'), data.get('expires_in')
    else:
        print(f"[OAUTH] Error obteniendo long-lived token: {response.text}")
        return None, None

def get_page_long_lived_token(page_id, user_access_token):
    """Obtiene token de larga duración para una página específica."""
    url = f'{GRAPH_API_URL}/{page_id}'
    params = {
        'fields': 'access_token',
        'access_token': user_access_token
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json().get('access_token')
    return None

def get_user_pages(access_token):
    """Obtiene las páginas del usuario con sus Instagram Business Accounts."""
    url = f'{GRAPH_API_URL}/me/accounts'
    params = {
        'fields': 'id,name,access_token,instagram_business_account{id,username}',
        'access_token': access_token
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json().get('data', [])
    else:
        print(f"[OAUTH] Error obteniendo páginas: {response.text}")
        return []

def save_account_to_supabase(user_id, marca_id, page_data, long_token):
    """
    Guarda la cuenta en Supabase.
    Guarda en DOS tablas:
    1. cuentas_facebook (para Admin Panel)
    2. cuentas_instagram (para comentarios_supabase.py)
    """
    page_id = page_data.get('id')
    page_name = page_data.get('name')
    page_token = page_data.get('access_token')
    
    # Obtener Instagram Business Account
    instagram_account = page_data.get('instagram_business_account', {})
    instagram_id = instagram_account.get('id') if isinstance(instagram_account, dict) else None
    instagram_username = instagram_account.get('username', '') if isinstance(instagram_account, dict) else ''
    
    if not instagram_id:
        print(f"[OAUTH] Página {page_name} no tiene Instagram Business Account, omitiendo")
        return None
    
    # Obtener token de página de larga duración
    page_long_token = get_page_long_lived_token(page_id, long_token) or page_token
    
    # Calcular fecha de expiración (60 días)
    token_expires_at = (datetime.now() + timedelta(days=60)).isoformat()
    
    try:
        # 1. Guardar en cuentas_facebook (para Admin Panel)
        existing_fb = supabase.table("cuentas_facebook")\
            .select("id")\
            .eq("page_id", page_id)\
            .eq("usuario_id", int(user_id) if user_id.isdigit() else 0)\
            .execute()
        
        fb_data = {
            "usuario_id": int(user_id) if user_id.isdigit() else None,
            "id_marca": int(marca_id) if marca_id and str(marca_id).isdigit() else None,
            "page_id": page_id,
            "page_name": page_name,
            "instagram_id": instagram_id,
            "instagram_username": instagram_username,
            "access_token": page_long_token,
            "token_expires_at": token_expires_at,
            "activo": True
        }
        
        if existing_fb.data:
            supabase.table("cuentas_facebook")\
                .update(fb_data)\
                .eq("id", existing_fb.data[0]["id"])\
                .execute()
            print(f"[OAUTH] cuentas_facebook actualizada: {page_name}")
        else:
            fb_data["conectado_en"] = datetime.now().isoformat()
            supabase.table("cuentas_facebook").insert(fb_data).execute()
            print(f"[OAUTH] cuentas_facebook creada: {page_name}")
        
        # 2. Guardar en cuentas_instagram (para comentarios_supabase.py)
        existing_ig = supabase.table("cuentas_instagram")\
            .select("id")\
            .eq("instagram_id", instagram_id)\
            .execute()
        
        ig_data = {
            "user_id": str(user_id),
            "page_id": page_id,
            "page_name": page_name,
            "instagram_id": instagram_id,
            "instagram_name": instagram_username,
            "page_access_token": page_long_token,
            "activo": True,
            "fecha_actualizacion": datetime.now().isoformat()
        }
        
        if existing_ig.data:
            supabase.table("cuentas_instagram")\
                .update(ig_data)\
                .eq("instagram_id", instagram_id)\
                .execute()
            print(f"[OAUTH] cuentas_instagram actualizada: {instagram_username}")
        else:
            ig_data["fecha_conexion"] = datetime.now().isoformat()
            supabase.table("cuentas_instagram").insert(ig_data).execute()
            print(f"[OAUTH] cuentas_instagram creada: {instagram_username}")
        
        # 3. Crear entrada en base_cuentas si no existe (para datos de marca)
        existing_marca = supabase.table("base_cuentas")\
            .select("id")\
            .eq("ID marca", instagram_id)\
            .execute()
        
        if not existing_marca.data:
            supabase.table("base_cuentas").insert({
                "Nombre marca": page_name,
                "Estado": True,
                "ID marca": instagram_id,
                "categoria": "prompt",
                "clave": "prompt_principal",
                "valor": f"Somos el equipo de atención al cliente de {page_name}. Respondemos de forma cálida, cercana y profesional.",
                "prioridad": 1
            }).execute()
            print(f"[OAUTH] base_cuentas: Prompt default creado para {page_name}")
        
        return {
            "page_id": page_id,
            "page_name": page_name,
            "instagram_id": instagram_id,
            "instagram_username": instagram_username
        }
        
    except Exception as e:
        print(f"[OAUTH] Error guardando en Supabase: {e}")
        return None

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@oauth_bp.route('/facebook/init', methods=['GET'])
def facebook_init():
    """
    Inicia el flujo OAuth de Facebook.
    
    Query params:
        - user_id: ID del usuario en Supabase
        - marca_id: ID de la marca (puede ser nuevo o existente)
        - callback_url: URL de Next.js para recibir el resultado
    """
    user_id = request.args.get('user_id')
    marca_id = request.args.get('marca_id', '')
    callback_url = request.args.get('callback_url')
    
    if not user_id:
        return jsonify({'error': 'user_id es requerido'}), 400
    
    if not callback_url:
        return jsonify({'error': 'callback_url es requerido'}), 400
    
    # Codificar state
    state = encode_state(user_id, marca_id, callback_url)
    
    # Construir URL de Facebook OAuth
    scopes = ','.join(FACEBOOK_SCOPES)
    fb_auth_url = (
        f"https://www.facebook.com/{GRAPH_API_VERSION}/dialog/oauth"
        f"?client_id={APP_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope={scopes}"
        f"&state={state}"
    )
    
    print(f"[OAUTH] Iniciando OAuth para user_id={user_id}, redirigiendo a Facebook")
    return redirect(fb_auth_url)


@oauth_bp.route('/facebook/callback', methods=['GET'])
def facebook_callback():
    """
    Callback de Facebook OAuth.
    Procesa el código de autorización y guarda tokens en Supabase.
    """
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')
    error_description = request.args.get('error_description')
    
    # Decodificar state
    state_data = decode_state(state) if state else None
    callback_url = state_data.get('callback_url') if state_data else 'https://controladorbbdd.vercel.app'
    
    # Manejar errores de Facebook
    if error:
        error_msg = error_description or error
        print(f"[OAUTH] Error de Facebook: {error_msg}")
        return redirect(f"{callback_url}?success=false&error={error_msg}")
    
    if not code:
        print("[OAUTH] No se recibió código de autorización")
        return redirect(f"{callback_url}?success=false&error=no_code")
    
    if not state_data:
        print("[OAUTH] State inválido o no presente")
        return redirect(f"{callback_url}?success=false&error=invalid_state")
    
    user_id = state_data.get('user_id')
    marca_id = state_data.get('marca_id')
    
    print(f"[OAUTH] Procesando callback para user_id={user_id}")
    
    # Paso 1: Intercambiar código por token
    token_url = f'{GRAPH_API_URL}/oauth/access_token'
    token_params = {
        'client_id': APP_ID,
        'client_secret': APP_SECRET,
        'redirect_uri': REDIRECT_URI,
        'code': code
    }
    
    token_response = requests.get(token_url, params=token_params)
    if token_response.status_code != 200:
        error_msg = token_response.json().get('error', {}).get('message', 'token_exchange_failed')
        print(f"[OAUTH] Error intercambiando código: {token_response.text}")
        return redirect(f"{callback_url}?success=false&error={error_msg}")
    
    short_token = token_response.json().get('access_token')
    
    # Paso 2: Obtener token de larga duración
    long_token, expires_in = get_long_lived_token(short_token)
    if not long_token:
        long_token = short_token  # Usar el corto si falla
        print("[OAUTH] Usando token corto (fallo al obtener long-lived)")
    
    # Paso 3: Obtener páginas del usuario
    pages = get_user_pages(long_token)
    
    if not pages:
        print("[OAUTH] No se encontraron páginas")
        return redirect(f"{callback_url}?success=false&error=no_pages")
    
    # Paso 4: Guardar cada página con Instagram Business Account
    accounts_connected = []
    for page in pages:
        result = save_account_to_supabase(user_id, marca_id, page, long_token)
        if result:
            accounts_connected.append(result)
    
    if not accounts_connected:
        print("[OAUTH] Ninguna página tiene Instagram Business Account")
        return redirect(f"{callback_url}?success=false&error=no_instagram_accounts")
    
    # Paso 5: Redirigir a Next.js con éxito
    first_account = accounts_connected[0]
    redirect_params = (
        f"?success=true"
        f"&accounts_connected={len(accounts_connected)}"
        f"&page_name={first_account['page_name']}"
        f"&instagram_id={first_account['instagram_id']}"
    )
    
    print(f"[OAUTH] ✅ OAuth completado. {len(accounts_connected)} cuentas conectadas")
    return redirect(f"{callback_url}{redirect_params}")


@oauth_bp.route('/facebook/status', methods=['GET'])
def facebook_status():
    """Endpoint de diagnóstico para verificar configuración."""
    return jsonify({
        "status": "ok",
        "app_id_configured": bool(APP_ID),
        "app_secret_configured": bool(APP_SECRET),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "redirect_uri": REDIRECT_URI,
        "scopes": FACEBOOK_SCOPES
    })
```

### 5.2 Modificar app.py para registrar el Blueprint

**En el archivo `app.py` existente, agregar:**

```python
# Al inicio, con los otros imports de blueprints
from BP_oauth_gateway import oauth_bp

# Después de los otros register_blueprint
app.register_blueprint(oauth_bp)
```

### 5.3 Next.js: Endpoint para iniciar OAuth

**Archivo: `app/api/facebook/connect/route.js`**

```javascript
// app/api/facebook/connect/route.js
import { NextResponse } from 'next/server';
import { verificarAutenticacion } from '@/lib/auth';

const PYTHONANYWHERE_URL = process.env.PYTHONANYWHERE_OAUTH_URL || 
    'https://mrkt21-pbezama.pythonanywhere.com';

export async function GET(request) {
    try {
        // Verificar autenticación
        const usuario = await verificarAutenticacion(request);
        if (!usuario) {
            return NextResponse.json(
                { error: 'No autorizado' },
                { status: 401 }
            );
        }

        // Construir callback URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://controladorbbdd.vercel.app';
        const callbackUrl = `${baseUrl}/api/facebook/callback`;

        // Construir URL de OAuth en PythonAnywhere
        const oauthUrl = new URL(`${PYTHONANYWHERE_URL}/oauth/facebook/init`);
        oauthUrl.searchParams.set('user_id', usuario.id.toString());
        oauthUrl.searchParams.set('marca_id', usuario.id_marca?.toString() || '');
        oauthUrl.searchParams.set('callback_url', callbackUrl);

        console.log('[FACEBOOK] Redirigiendo a OAuth:', oauthUrl.toString());

        // Redirigir al usuario
        return NextResponse.redirect(oauthUrl.toString());

    } catch (error) {
        console.error('[FACEBOOK] Error iniciando OAuth:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
```

### 5.4 Next.js: Endpoint para recibir callback

**Archivo: `app/api/facebook/callback/route.js`**

```javascript
// app/api/facebook/callback/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    
    const success = searchParams.get('success') === 'true';
    const error = searchParams.get('error');
    const accountsConnected = searchParams.get('accounts_connected');
    const pageName = searchParams.get('page_name');
    const instagramId = searchParams.get('instagram_id');

    // URL base para redirección
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://controladorbbdd.vercel.app';

    if (success) {
        console.log(`[FACEBOOK] OAuth exitoso: ${accountsConnected} cuentas conectadas`);
        
        // Redirigir al dashboard con mensaje de éxito
        const successUrl = new URL('/dashboard', baseUrl);
        successUrl.searchParams.set('facebook_connected', 'true');
        successUrl.searchParams.set('accounts', accountsConnected);
        successUrl.searchParams.set('page_name', pageName || '');
        
        return NextResponse.redirect(successUrl.toString());
    } else {
        console.error(`[FACEBOOK] OAuth fallido: ${error}`);
        
        // Redirigir con error
        const errorUrl = new URL('/dashboard', baseUrl);
        errorUrl.searchParams.set('facebook_error', error || 'unknown');
        
        return NextResponse.redirect(errorUrl.toString());
    }
}
```

### 5.5 Next.js: Endpoint para listar cuentas

**Archivo: `app/api/facebook/accounts/route.js`**

```javascript
// app/api/facebook/accounts/route.js
import { NextResponse } from 'next/server';
import { verificarAutenticacion } from '@/lib/auth';
import { obtenerCuentasFacebook } from '@/lib/supabase';

export async function GET(request) {
    try {
        // Verificar autenticación
        const usuario = await verificarAutenticacion(request);
        if (!usuario) {
            return NextResponse.json(
                { error: 'No autorizado' },
                { status: 401 }
            );
        }

        // Obtener cuentas desde Supabase
        const cuentas = await obtenerCuentasFacebook(usuario.id_marca);

        return NextResponse.json({
            success: true,
            cuentas: cuentas,
            total: cuentas.length
        });

    } catch (error) {
        console.error('[FACEBOOK] Error obteniendo cuentas:', error);
        return NextResponse.json(
            { error: 'Error obteniendo cuentas' },
            { status: 500 }
        );
    }
}
```

### 5.6 Next.js: Función en lib/supabase.js

**Agregar a `lib/supabase.js`:**

```javascript
/**
 * Obtiene las cuentas de Facebook/Instagram conectadas para una marca
 */
export async function obtenerCuentasFacebook(idMarca) {
    try {
        // Buscar por id_marca o por usuario_id
        const { data, error } = await supabase
            .from('cuentas_facebook')
            .select('*')
            .eq('activo', true)
            .or(`id_marca.eq.${idMarca},usuario_id.eq.${idMarca}`)
            .order('conectado_en', { ascending: false });

        if (error) {
            console.error('[SUPABASE] Error obteniendo cuentas Facebook:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('[SUPABASE] Error:', error);
        return [];
    }
}

/**
 * Desconecta una cuenta de Facebook/Instagram
 */
export async function desconectarCuentaFacebook(pageId, usuarioId) {
    try {
        // Desactivar en cuentas_facebook
        const { error: fbError } = await supabase
            .from('cuentas_facebook')
            .update({ activo: false })
            .eq('page_id', pageId)
            .eq('usuario_id', usuarioId);

        if (fbError) {
            console.error('[SUPABASE] Error desconectando cuenta Facebook:', fbError);
            return false;
        }

        // También desactivar en cuentas_instagram si existe
        const { data: fbData } = await supabase
            .from('cuentas_facebook')
            .select('instagram_id')
            .eq('page_id', pageId)
            .single();

        if (fbData?.instagram_id) {
            await supabase
                .from('cuentas_instagram')
                .update({ activo: false })
                .eq('instagram_id', fbData.instagram_id);
        }

        return true;
    } catch (error) {
        console.error('[SUPABASE] Error:', error);
        return false;
    }
}
```

---

## 6. CONFIGURACIÓN EN FACEBOOK DEVELOPER

### 6.1 Agregar Redirect URI

1. Ir a https://developers.facebook.com
2. Seleccionar tu App
3. Ir a **Configuración** > **Básica** (o Facebook Login > Settings)
4. En "URI de redireccionamiento de OAuth válidos", agregar:
   ```
   https://mrkt21-pbezama.pythonanywhere.com/oauth/facebook/callback
   ```
5. Guardar cambios

### 6.2 Verificar Permisos

Asegurarse de que la App tenga los siguientes permisos aprobados:

- `pages_show_list`
- `pages_read_engagement`
- `pages_read_user_content`
- `pages_manage_engagement`
- `pages_manage_metadata`
- `pages_messaging`
- `business_management`
- `instagram_basic`
- `instagram_manage_comments`
- `instagram_manage_messages`

### 6.3 Modo de la App

La App debe estar en modo **Producción** (Live) para que usuarios externos puedan conectarse.

---

## 7. ORDEN DE IMPLEMENTACIÓN

### Paso 1: Configuración previa
1. [ ] Agregar redirect URI en Facebook Developer
2. [ ] Verificar variables de entorno en PythonAnywhere
3. [ ] Verificar variables de entorno en Vercel
4. [ ] Verificar que Supabase tiene las tablas necesarias

### Paso 2: PythonAnywhere
1. [ ] Crear archivo `BP_oauth_gateway.py`
2. [ ] Modificar `app.py` para registrar el blueprint
3. [ ] Reiniciar la aplicación en PythonAnywhere
4. [ ] Probar endpoint `/oauth/facebook/status`

### Paso 3: Next.js
1. [ ] Crear/modificar `app/api/facebook/connect/route.js`
2. [ ] Crear/modificar `app/api/facebook/callback/route.js`
3. [ ] Crear/modificar `app/api/facebook/accounts/route.js`
4. [ ] Agregar funciones a `lib/supabase.js`
5. [ ] Deploy a Vercel

### Paso 4: Pruebas
1. [ ] Probar flujo completo desde Next.js
2. [ ] Verificar que se guarda en Supabase
3. [ ] Verificar que `comentarios_supabase.py` puede leer los tokens
4. [ ] Probar que se reciben y responden comentarios

---

## 8. TROUBLESHOOTING

### Error: "redirect_uri is not allowed"
- Verificar que el URI está exactamente igual en Facebook Developer
- No debe haber espacios ni caracteres extra
- El protocolo debe ser `https://`

### Error: "Invalid state parameter"
- El state se codifica en base64, verificar que no se corrompe
- Verificar que la session de Flask está funcionando

### Error: "No se encontraron páginas"
- El usuario debe ser admin de al menos una página de Facebook
- La página debe tener un Instagram Business Account conectado

### Error: "Token expirado"
- Los tokens de usuario duran 60 días
- Implementar refresh automático o pedir reconexión

### Las cuentas no aparecen en Next.js
- Verificar que `SUPABASE_URL` es el mismo en ambos sistemas
- Verificar que se está consultando la tabla correcta
- Revisar logs de Supabase

### comentarios_supabase.py no encuentra los tokens
- Verificar que se guarda en `cuentas_instagram` (no solo `cuentas_facebook`)
- Verificar que el `instagram_id` es correcto
- Verificar que `activo = true`

---

## 9. REFERENCIAS

### URLs de Meta Graph API

```
Base URL: https://graph.facebook.com/v17.0

OAuth Dialog:
https://www.facebook.com/v17.0/dialog/oauth

Token Exchange:
GET /oauth/access_token

User Pages:
GET /me/accounts?fields=id,name,access_token,instagram_business_account

Instagram Account:
GET /{instagram-business-account-id}?fields=id,username

Debug Token:
GET /debug_token?input_token={token}&access_token={app_token}
```

### Documentación Oficial

- [Facebook Login](https://developers.facebook.com/docs/facebook-login/)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [Long-lived Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/)
- [Page Access Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/#pagetokens)

---

## 10. NOTAS FINALES

### Sobre el dominio mrkt21.com
- Este dominio fue vendido a otra empresa
- TODOS los redirect URIs que apuntan a `mrkt21.com` deben considerarse deprecados
- NO agregar nuevos URIs con este dominio
- El código existente que referencia `mrkt21.com` debe actualizarse

### Sobre Google Sheets
- El sistema anterior usaba Google Sheets para almacenar tokens
- Este nuevo sistema usa SOLO Supabase
- `BP_comentarios.py` puede seguir existiendo pero NO debe usarse para nuevas conexiones
- La migración de datos existentes de Google Sheets a Supabase es un paso separado

### Sobre comentarios_supabase.py
- Este archivo FUNCIONA correctamente y NO debe modificarse
- Lee tokens de la tabla `cuentas_instagram` en Supabase
- El nuevo OAuth Gateway guarda en esta tabla para mantener compatibilidad
- Los webhooks de Meta siguen apuntando a este endpoint