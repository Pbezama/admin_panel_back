


""" BP_COMENTARIOS - Sistema de Respuesta Automática a Comentarios Versión: 5.0 - Unificado con Anti-bucle + Posts Detection + 100% Supabase =========================================================================== CARACTERÍSTICAS: - Sistema anti-bucle completo (previene responder a propios comen

pasted


Hay una parte de mi código en donde reconoce las publicaciones, aqui toma la info y crea la regla, neecsito que no la cree, sino que rescate los datos y los mande como tarea para revisar por el dueño de la marca, en donde se activará un flujo que le manda un wsp al dueño con "se detectó nueva publicación, entrar al siguiente link para revisar su base de datos".

Aqui ingresará a su sistema que ya existe, y verá la tarea asignada, que será confirmación de nueva regla, entonces aqui la persona confirma si o no a la regla o la puede modificar. 



Contenido pegado
79.14 KB •1,981 líneas
•
El formato puede ser inconsistente con la fuente

"""
BP_COMENTARIOS - Sistema de Respuesta Automática a Comentarios
Versión: 5.0 - Unificado con Anti-bucle + Posts Detection + 100% Supabase
===========================================================================

CARACTERÍSTICAS:
- Sistema anti-bucle completo (previene responder a propios comentarios)
- Detección de posts nuevos → guarda en base_cuentas (categoría: publicacion, prioridad: 2)
- Webhooks de Meta (Instagram + Facebook) mejorados
- Sistema de prioridades en prompts (1=siempre, 2-3=relevante, 4+=solo si pregunta)
- 100% Supabase (con fallback a Google Sheets para compatibilidad)
- Historial de conversaciones para DMs
- Suscripción automática de páginas a webhooks
- Endpoints de diagnóstico

RUTAS:
- /comentarios/                  → Home
- /comentarios/login             → Login
- /comentarios/dashboard         → Dashboard principal
- /comentarios/webhook           → Webhook de Meta
- /comentarios/connect_facebook  → OAuth Facebook
- /comentarios/prompts           → Gestión de prompts
- /comentarios/registro_comentarios → Ver comentarios
- /comentarios/reportes          → Reportes y estadísticas
"""

import os
import requests
import json
import time
from flask import Blueprint, redirect, request, session, url_for, render_template, flash, jsonify
from datetime import datetime, timedelta
from collections import Counter, defaultdict
import calendar
import base64
import hmac
import hashlib

# Supabase
from supabase import create_client, Client

# Google Sheets (fallback)
from google.oauth2 import service_account
from googleapiclient.discovery import build

# OpenAI
from openai import OpenAI

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN DEL BLUEPRINT
# ═══════════════════════════════════════════════════════════════════════════════

comentarios_bp = Blueprint(
    'comentarios',
    __name__,
    url_prefix='/comentarios',
    template_folder='templates/comentarios'
)

# ═══════════════════════════════════════════════════════════════════════════════
# VARIABLES DE ENTORNO
# ═══════════════════════════════════════════════════════════════════════════════

# Meta API
VERIFY_TOKEN = os.getenv('VERIFY_TOKEN')
APP_ID = os.getenv('APP_ID_COMENTARIOS')
APP_SECRET = os.getenv('APP_SECRET_COMENTARIOS')
REDIRECT_URI = os.getenv('REDIRECT_URI_COMENTARIOS', 'https://mrkt21-pbezama.pythonanywhere.com/comentarios/facebook_callback')

# OpenAI
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# Google Sheets (fallback)
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SERVICE_ACCOUNT_FILE = os.getenv('SERVICE_ACCOUNT_KEY')
SPREADSHEET_ID = os.getenv('SPREADSHEET_ID_COMENTARIOS')

# Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# Google Sheets service (fallback)
try:
    creds = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    sheets_service = build('sheets', 'v4', credentials=creds)
    sheet = sheets_service.spreadsheets()
except Exception as e:
    print(f"[SHEETS] No se pudo inicializar Google Sheets: {e}")
    sheet = None


# ═══════════════════════════════════════════════════════════════════════════════
# CLASE: Sistema Anti-Bucle
# ═══════════════════════════════════════════════════════════════════════════════

class AntiLoopSystem:
    """Previene que el bot responda a sus propios comentarios o procese duplicados"""

    def __init__(self):
        self.processed_comments = {}
        self.bot_sent_replies = set()
        self.own_account_ids = set()
        self.CACHE_EXPIRY = 3600  # 1 hora

    def load_own_account_ids(self):
        """Carga los IDs de las cuentas propias desde Supabase"""
        if not supabase:
            return
        try:
            response = supabase.table("cuentas_instagram")\
                .select("instagram_id, page_id")\
                .eq("activo", True)\
                .execute()

            for account in response.data:
                if account.get('instagram_id'):
                    self.own_account_ids.add(str(account['instagram_id']))
                if account.get('page_id'):
                    self.own_account_ids.add(str(account['page_id']))

            print(f"[ANTI-LOOP] ✅ Cargados {len(self.own_account_ids)} IDs de cuentas propias")
        except Exception as e:
            print(f"[ANTI-LOOP] ❌ Error cargando IDs: {e}")

    def is_own_account(self, user_id):
        """Verifica si un user_id es de una cuenta propia"""
        return str(user_id) in self.own_account_ids

    def is_comment_duplicate(self, comment_id):
        """Verifica si un comentario ya fue procesado"""
        return comment_id in self.processed_comments

    def mark_comment_processed(self, comment_id):
        """Marca un comentario como procesado"""
        self.processed_comments[comment_id] = time.time()
        self._cleanup_old_entries()

    def mark_bot_reply(self, reply_id):
        """Marca una respuesta como enviada por el bot"""
        self.bot_sent_replies.add(str(reply_id))

    def is_bot_reply(self, comment_id):
        """Verifica si un comentario es una respuesta del bot"""
        return str(comment_id) in self.bot_sent_replies

    def add_own_account(self, account_id):
        """Añade un ID a la lista de cuentas propias"""
        self.own_account_ids.add(str(account_id))

    def _cleanup_old_entries(self):
        """Limpia entradas antiguas del cache"""
        current_time = time.time()
        expired = [k for k, v in self.processed_comments.items()
                   if current_time - v > self.CACHE_EXPIRY]
        for k in expired:
            del self.processed_comments[k]

# Instancia global
anti_loop = AntiLoopSystem()


# ═══════════════════════════════════════════════════════════════════════════════
# CLASE: Historial de Conversaciones (para DMs)
# ═══════════════════════════════════════════════════════════════════════════════

class ConversationHistory:
    """Mantiene historial de conversaciones para respuestas contextuales en DMs"""

    def __init__(self, max_messages=20, expiry_minutes=60):
        self.histories = defaultdict(list)
        self.last_activity = {}
        self.max_messages = max_messages
        self.expiry_minutes = expiry_minutes

    def add_message(self, user_id, role, content):
        self._cleanup_expired(user_id)
        self.histories[user_id].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        self.last_activity[user_id] = datetime.now()
        if len(self.histories[user_id]) > self.max_messages:
            self.histories[user_id] = self.histories[user_id][-self.max_messages:]

    def get_history(self, user_id):
        self._cleanup_expired(user_id)
        return self.histories.get(user_id, [])

    def clear(self, user_id):
        if user_id in self.histories:
            del self.histories[user_id]
        if user_id in self.last_activity:
            del self.last_activity[user_id]

    def _cleanup_expired(self, user_id):
        if user_id in self.last_activity:
            if datetime.now() - self.last_activity[user_id] > timedelta(minutes=self.expiry_minutes):
                self.clear(user_id)

# Instancia global
conversation_history = ConversationHistory()


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE SUPABASE - USUARIOS
# ═══════════════════════════════════════════════════════════════════════════════

def login_usuario_supabase(usuario, contrasena):
    """Autentica usuario en Supabase"""
    if not supabase:
        return None
    try:
        result = supabase.table('usuarios').select('*')\
            .eq('usuario', usuario)\
            .eq('activo', True)\
            .execute()

        if not result.data:
            print(f"[LOGIN] Usuario no encontrado: {usuario}")
            return None

        user = result.data[0]

        if user['contrasena'] != contrasena:
            print(f"[LOGIN] Contraseña incorrecta: {usuario}")
            return None

        # Actualizar último login
        supabase.table('usuarios').update({
            'ultimo_login': datetime.now().isoformat()
        }).eq('id', user['id']).execute()

        print(f"[LOGIN] ✅ Login exitoso: {user['nombre']} ({usuario})")
        return user

    except Exception as e:
        print(f"[LOGIN] Error: {e}")
        return None


def get_users_from_sheet():
    """Obtiene usuarios de Google Sheets (fallback)"""
    if not sheet:
        return {}
    try:
        result = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range='usuarios y claves iniciales!A:C'
        ).execute()
        values = result.get('values', [])
        users = {}
        for row in values[1:]:
            if len(row) >= 3:
                user_id, username, password = row[0], row[1], row[2]
                users[username] = {'id': user_id, 'password': password}
        return users
    except Exception as e:
        print(f"[SHEETS] Error obteniendo usuarios: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE SUPABASE - CUENTAS
# ═══════════════════════════════════════════════════════════════════════════════

def get_user_accounts_supabase(user_id, id_marca=None):
    """Obtiene cuentas de Facebook/Instagram desde Supabase"""
    if not supabase:
        return []
    try:
        query = supabase.table('cuentas_instagram').select('*').eq('activo', True)

        if id_marca:
            # Buscar por id_marca si está disponible
            query = query.or_(f"user_id.eq.{user_id},page_id.eq.{id_marca}")
        else:
            query = query.eq('user_id', str(user_id))

        result = query.execute()

        accounts = []
        for row in result.data:
            accounts.append({
                'user_id': row.get('user_id'),
                'page_id': row.get('page_id'),
                'page_name': row.get('page_name'),
                'instagram_id': row.get('instagram_id'),
                'instagram_username': row.get('instagram_name')
            })
        return accounts

    except Exception as e:
        print(f"[SUPABASE] Error obteniendo cuentas: {e}")
        return []


def get_account_by_page_id(page_id):
    """Busca cuenta por page_id en Supabase"""
    if not supabase:
        return None
    try:
        response = supabase.table("cuentas_instagram")\
            .select("*")\
            .eq("page_id", str(page_id))\
            .eq("activo", True)\
            .execute()
        return response.data[0] if response.data else None
    except Exception as e:
        print(f"[SUPABASE] Error buscando cuenta por page_id: {e}")
        return None


def get_account_by_instagram_id(instagram_id):
    """Busca cuenta por instagram_id en Supabase"""
    if not supabase:
        return None
    try:
        response = supabase.table("cuentas_instagram")\
            .select("*")\
            .eq("instagram_id", str(instagram_id))\
            .eq("activo", True)\
            .execute()
        return response.data[0] if response.data else None
    except Exception as e:
        print(f"[SUPABASE] Error buscando cuenta por instagram_id: {e}")
        return None


def save_account_to_supabase(user_id, page_id, page_name, instagram_id, page_access_token, instagram_name=""):
    """Guarda o actualiza cuenta en Supabase"""
    if not supabase:
        return False
    try:
        existing = supabase.table("cuentas_instagram")\
            .select("id")\
            .eq("page_id", str(page_id))\
            .execute()

        data = {
            'user_id': str(user_id),
            'page_id': str(page_id),
            'page_name': page_name,
            'instagram_id': str(instagram_id) if instagram_id else None,
            'page_access_token': page_access_token,
            'instagram_name': instagram_name,
            'activo': True,
            'fecha_actualizacion': datetime.now().isoformat()
        }

        if existing.data:
            supabase.table("cuentas_instagram")\
                .update(data)\
                .eq("page_id", str(page_id))\
                .execute()
            print(f"[SUPABASE] ✅ Cuenta actualizada: {page_name}")
        else:
            data['fecha_conexion'] = datetime.now().isoformat()
            supabase.table("cuentas_instagram").insert(data).execute()
            print(f"[SUPABASE] ✅ Cuenta creada: {page_name}")

            # Crear prompt default para nueva marca
            if instagram_id:
                crear_prompt_default(instagram_id, page_name)

        return True
    except Exception as e:
        print(f"[SUPABASE] ❌ Error guardando cuenta: {e}")
        return False


def crear_prompt_default(instagram_id, nombre_marca):
    """Crea un prompt por defecto para una nueva marca"""
    if not supabase:
        return
    try:
        existing = supabase.table("base_cuentas")\
            .select("id")\
            .eq("ID marca", str(instagram_id))\
            .eq("categoria", "prompt")\
            .execute()

        if not existing.data:
            supabase.table("base_cuentas").insert({
                "Nombre marca": nombre_marca,
                "Estado": True,
                "ID marca": str(instagram_id),
                "categoria": "prompt",
                "clave": "prompt_principal",
                "valor": f"Somos el equipo de atención al cliente de {nombre_marca}. Respondemos de forma cálida, cercana y profesional. Nuestro objetivo es generar interés y confianza, indicando que nos pondremos en contacto por inbox para dar más información.",
                "prioridad": 1
            }).execute()
            print(f"[SUPABASE] ✅ Prompt default creado para: {nombre_marca}")
    except Exception as e:
        print(f"[SUPABASE] Error creando prompt default: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE APROBACIÓN DE REGLAS
# ═══════════════════════════════════════════════════════════════════════════════

# Configuración de WhatsApp Business API (Meta)
WHATSAPP_ACCESS_TOKEN = os.getenv('WHATSAPP_ACCESS_TOKEN')
WHATSAPP_PHONE_NUMBER_ID = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
WHATSAPP_API_URL = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages" if WHATSAPP_PHONE_NUMBER_ID else None

def get_admin_phone_by_marca(instagram_id):
    """
    Obtiene el teléfono del administrador (tipo_usuario='adm')
    de la marca asociada al instagram_id
    """
    if not supabase:
        return None
    try:
        # Primero obtener info de la cuenta
        cuenta = supabase.table("cuentas_instagram")\
            .select("user_id, page_id")\
            .eq("instagram_id", str(instagram_id))\
            .eq("activo", True)\
            .execute()

        print(f"[ADMIN] Buscando admin para instagram_id: {instagram_id}")
        print(f"[ADMIN] Cuenta encontrada: {cuenta.data}")

        # OPCIÓN 1: Si cuentas_instagram tiene user_id, buscar directamente por ID
        if cuenta.data and cuenta.data[0].get('user_id'):
            user_id = cuenta.data[0]['user_id']
            print(f"[ADMIN] Intentando buscar por user_id: {user_id}")

            resultado = supabase.table("usuarios")\
                .select("id, nombre, telefono, id_marca, nombre_marca")\
                .eq("id", int(user_id) if user_id.isdigit() else user_id)\
                .eq("activo", True)\
                .execute()

            print(f"[ADMIN] Resultado por user_id: {resultado.data}")

            if resultado.data and resultado.data[0].get('telefono'):
                admin = resultado.data[0]
                print(f"[ADMIN] ✅ Encontrado por user_id: {admin['nombre']} - Tel: {admin['telefono']}")
                return {
                    'id': admin['id'],
                    'nombre': admin['nombre'],
                    'telefono': admin['telefono'],
                    'id_marca': admin['id_marca'],
                    'nombre_marca': admin.get('nombre_marca', 'Marca')
                }

        # OPCIÓN 2: Buscar admin por id_marca (puede ser instagram_id o page_id)
        buscar_ids = [str(instagram_id)]
        if cuenta.data and cuenta.data[0].get('page_id'):
            buscar_ids.append(str(cuenta.data[0]['page_id']))

        print(f"[ADMIN] Buscando por id_marca en: {buscar_ids}")

        for id_marca in buscar_ids:
            resultado = supabase.table("usuarios")\
                .select("id, nombre, telefono, id_marca, nombre_marca")\
                .eq("tipo_usuario", "adm")\
                .eq("activo", True)\
                .eq("id_marca", id_marca)\
                .execute()

            print(f"[ADMIN] Resultado para id_marca={id_marca}: {len(resultado.data) if resultado.data else 0} usuarios")

            # Buscar el PRIMER admin que tenga teléfono
            if resultado.data:
                for admin in resultado.data:
                    if admin.get('telefono'):
                        print(f"[ADMIN] ✅ Encontrado: {admin['nombre']} - Tel: {admin['telefono']}")
                        return {
                            'id': admin['id'],
                            'nombre': admin['nombre'],
                            'telefono': admin['telefono'],
                            'id_marca': admin['id_marca'],
                            'nombre_marca': admin.get('nombre_marca', 'Marca')
                        }
                print(f"[ADMIN] ⚠️ Se encontraron {len(resultado.data)} admins pero ninguno tiene teléfono")

        print(f"[ADMIN] ⚠️ No se encontró admin con teléfono para marca: {instagram_id}")
        return None

    except Exception as e:
        print(f"[ADMIN] ❌ Error buscando admin: {e}")
        import traceback
        traceback.print_exc()
        return None


def create_approval_task(instagram_id, page_name, post_data, admin_info):
    """
    Crea una tarea de aprobación en Supabase
    """
    print(f"[TAREA] Iniciando creación de tarea para {page_name}")

    if not supabase:
        print(f"[TAREA] ❌ Supabase no disponible")
        return None
    try:
        caption_preview = post_data.get('caption', 'Sin descripción')[:200]
        permalink = post_data.get('permalink', 'N/A')
        media_type = post_data.get('media_type', 'unknown')

        tarea = {
            "id_marca": admin_info['id_marca'],
            "nombre_marca": page_name,
            "titulo": f"Nueva publicación detectada",
            "descripcion": (
                f"Se detectó una nueva publicación en {page_name}.\n\n"
                f"Caption: {caption_preview}...\n\n"
                f"Link: {permalink}\n\n"
                f"Tipo: {media_type}\n\n"
                f"Responde por WhatsApp (Si/No/Modificar) o desde el dashboard."
            ),
            "tipo": "aprobacion_regla",
            "prioridad": "alta",
            "estado": "pendiente",
            "asignado_a": admin_info['id'],
            "nombre_asignado": admin_info['nombre'],
            "creado_por": None,
            "creado_por_sistema": True,
            "fecha_creacion": datetime.now().isoformat(),
            "activo": True
        }

        print(f"[TAREA] Insertando tarea: asignado_a={admin_info['id']}")
        resultado = supabase.table("tareas").insert(tarea).execute()

        if resultado.data:
            tarea_id = resultado.data[0]['id']
            print(f"[TAREA] ✅ Tarea de aprobación creada: #{tarea_id}")
            return resultado.data[0]
        else:
            print(f"[TAREA] ⚠️ Insert no devolvió datos")
            return None

    except Exception as e:
        print(f"[TAREA] ❌ Error creando tarea: {e}")
        import traceback
        traceback.print_exc()
        return None


def send_whatsapp_approval_request(admin_info, post_data, page_name, tarea_id):
    """
    Envía mensaje WhatsApp con botones al admin para aprobar/rechazar
    Usa directamente la API de Meta WhatsApp Business
    """
    telefono = admin_info['telefono']
    print(f"[WHATSAPP] Iniciando envío a {telefono}")

    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print(f"[WHATSAPP] ❌ Credenciales no configuradas")
        return False

    try:
        caption_preview = post_data.get('caption', 'Sin descripción')[:150]

        mensaje = (
            f"Nueva publicacion detectada\n\n"
            f"Marca: {page_name}\n\n"
            f"{caption_preview}...\n\n"
            f"Deseas usar esta publicacion para respuestas automaticas?\n\n"
            f"Responde:\n"
            f"Si - Aprobar regla\n"
            f"No - Rechazar\n"
            f"Modificar - Ver en dashboard"
        )

        # Payload para mensaje con botones interactivos
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": telefono,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": mensaje},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"aprobar_{tarea_id}",
                                "title": "Si, aprobar"
                            }
                        },
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"rechazar_{tarea_id}",
                                "title": "No, rechazar"
                            }
                        },
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"modificar_{tarea_id}",
                                "title": "Modificar"
                            }
                        }
                    ]
                }
            }
        }

        print(f"[WHATSAPP] Enviando a API Meta...")
        response = requests.post(
            WHATSAPP_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
                "Content-Type": "application/json"
            },
            timeout=15
        )

        print(f"[WHATSAPP] Respuesta: {response.status_code}")

        if response.ok:
            print(f"[WHATSAPP] ✅ Mensaje enviado a {telefono}")
            return True
        else:
            error_msg = response.json().get('error', {}).get('message', response.text[:200])
            print(f"[WHATSAPP] ❌ Error: {error_msg}")
            return False

    except Exception as e:
        print(f"[WHATSAPP] ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_whatsapp_text(telefono, mensaje):
    """
    Envía un mensaje de texto simple por WhatsApp
    """
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print(f"[WHATSAPP] ❌ Credenciales no configuradas")
        return False

    try:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": telefono,
            "type": "text",
            "text": {"body": mensaje}
        }

        response = requests.post(
            WHATSAPP_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
                "Content-Type": "application/json"
            },
            timeout=15
        )

        return response.ok

    except Exception as e:
        print(f"[WHATSAPP] ❌ Error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE SUPABASE - DATOS DE MARCA (PROMPTS Y PUBLICACIONES)
# ═══════════════════════════════════════════════════════════════════════════════

def get_brand_data(instagram_id):
    """Obtiene datos de marca con sistema de prioridades"""
    if not supabase:
        return None
    try:
        response = supabase.table("base_cuentas")\
            .select("*")\
            .eq("ID marca", str(instagram_id))\
            .eq("Estado", True)\
            .execute()

        if not response.data:
            print(f"[SUPABASE] No se encontró marca: {instagram_id}")
            return None

        datos_marca = response.data
        nombre_marca = datos_marca[0].get("Nombre marca", "Marca desconocida")

        return organizar_datos_marca(datos_marca, nombre_marca)
    except Exception as e:
        print(f"[SUPABASE] Error obteniendo datos de marca: {e}")
        return None


def organizar_datos_marca(datos_marca, nombre_marca):
    """Organiza datos de marca por prioridad"""
    hoy = datetime.now().date()
    datos = {
        "nombre_marca": nombre_marca,
        "siempre_incluir": [],      # prioridad 1
        "si_relevante": [],         # prioridad 2-3 (incluye publicaciones)
        "solo_si_pregunta": [],     # prioridad 4+
        "promociones_activas": [],
        "publicaciones_recientes": []
    }

    for dato in datos_marca:
        prioridad = dato.get("prioridad", 3)
        categoria = dato.get("categoria", "otro")
        clave = dato.get("clave", "")
        valor = dato.get("valor", "")
        fecha_caducidad = dato.get("fecha_caducidad")

        # Manejar promociones
        if categoria in ["promocion", "promo"]:
            if fecha_caducidad:
                try:
                    fecha_exp = datetime.fromisoformat(fecha_caducidad.replace("Z", "+00:00")).date()
                    if fecha_exp < hoy:
                        continue  # Promoción expirada
                except:
                    pass
            datos["promociones_activas"].append({"clave": clave, "valor": valor})
            continue

        # Manejar publicaciones
        if categoria == "publicacion":
            datos["publicaciones_recientes"].append({"clave": clave, "valor": valor})
            # También agregar a si_relevante para que se use en respuestas
            datos["si_relevante"].append({"categoria": categoria, "clave": clave, "valor": valor})
            continue

        # Clasificar por prioridad
        dato_simple = {"categoria": categoria, "clave": clave, "valor": valor}
        if prioridad == 1:
            datos["siempre_incluir"].append(dato_simple)
        elif prioridad in [2, 3]:
            datos["si_relevante"].append(dato_simple)
        else:
            datos["solo_si_pregunta"].append(dato_simple)

    print(f"[SUPABASE] Datos de {nombre_marca}: P1={len(datos['siempre_incluir'])}, P2-3={len(datos['si_relevante'])}, Promos={len(datos['promociones_activas'])}, Posts={len(datos['publicaciones_recientes'])}")
    return datos


def save_post_to_base_cuentas(instagram_id, page_name, post_data, estado_aprobacion='activo'):
    """
    Guarda una publicación nueva en base_cuentas con categoría 'publicacion' y prioridad 2

    post_data debe contener:
    - post_id: ID de la publicación
    - caption: Texto/descripción de la publicación
    - media_type: Tipo (photo, video, reel, etc.)
    - media_url: URL del media (opcional)
    - permalink: Link a la publicación (opcional)
    - timestamp: Fecha de publicación

    estado_aprobacion: 'pendiente', 'activo', o 'rechazada'
    """
    if not supabase:
        return False

    try:
        post_id = post_data.get('post_id')
        caption = post_data.get('caption', '')
        media_type = post_data.get('media_type', 'unknown')
        permalink = post_data.get('permalink', '')
        timestamp = post_data.get('timestamp', datetime.now().isoformat())

        # Verificar si ya existe esta publicación
        existing = supabase.table("base_cuentas")\
            .select("id")\
            .eq("ID marca", str(instagram_id))\
            .eq("categoria", "publicacion")\
            .eq("clave", str(post_id))\
            .execute()

        if existing.data:
            print(f"[SUPABASE] Publicación ya existe: {post_id}")
            return False

        # Construir valor con info útil
        valor = caption[:500] if caption else f"Publicación tipo {media_type}"
        if permalink:
            valor += f"\n[Link: {permalink}]"

        # Estado activo solo si está aprobada
        estado_activo = estado_aprobacion == 'activo'

        # Insertar nueva publicación
        supabase.table("base_cuentas").insert({
            "Nombre marca": page_name,
            "Estado": estado_activo,
            "ID marca": str(instagram_id),
            "categoria": "publicacion",
            "clave": str(post_id),
            "valor": valor,
            "prioridad": 2,  # Prioridad 2 para que se incluya en "si_relevante"
            "creado_en": timestamp,
            "fecha_caducidad": (datetime.now() + timedelta(days=30)).isoformat(),
            "estado_aprobacion": estado_aprobacion
        }).execute()

        print(f"[SUPABASE] ✅ Publicación guardada ({estado_aprobacion}): {post_id} ({media_type})")
        return True

    except Exception as e:
        print(f"[SUPABASE] ❌ Error guardando publicación: {e}")
        return False


def get_prompt_from_supabase(instagram_id):
    """Obtiene el prompt activo de una marca"""
    if not supabase:
        return None
    try:
        response = supabase.table("base_cuentas")\
            .select("valor")\
            .eq("ID marca", str(instagram_id))\
            .eq("categoria", "prompt")\
            .eq("Estado", True)\
            .order("creado_en", desc=True)\
            .limit(1)\
            .execute()

        if response.data:
            return response.data[0].get("valor")
        return None
    except Exception as e:
        print(f"[SUPABASE] Error obteniendo prompt: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE SUPABASE - LOGS Y LOCKS
# ═══════════════════════════════════════════════════════════════════════════════

def acquire_comment_lock(comment_id, instagram_id, platform="instagram"):
    """Intenta adquirir un lock para procesar un comentario (evita duplicados)"""
    if not supabase:
        return True  # Sin Supabase, permitir procesamiento
    try:
        # Verificar si ya existe
        existing = supabase.table("comment_locks")\
            .select("comment_id")\
            .eq("comment_id", comment_id)\
            .execute()

        if existing.data:
            print(f"[LOCK] Ya existe lock para: {comment_id}")
            return False

        # Crear lock
        supabase.table("comment_locks").insert({
            "comment_id": comment_id,
            "instagram_id": str(instagram_id),
            "platform": platform,
            "created_at": datetime.now().isoformat()
        }).execute()

        print(f"[LOCK] ✅ Lock adquirido: {comment_id}")
        return True

    except Exception as e:
        if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
            print(f"[LOCK] Duplicado detectado: {comment_id}")
            return False
        print(f"[LOCK] Error: {e}")
        return True  # En caso de error, permitir procesamiento


def save_comment_log(instagram_id, nombre_marca, post_description, comment_text, respuestas, platform="instagram", comment_id=None, sender_id=None, media_id=None, respuesta_enviada=False, dm_enviado=False):
    """Guarda log de comentario procesado con todos los campos disponibles"""
    if not supabase:
        return
    try:
        supabase.table("logs_comentarios").insert({
            "id_marca": str(instagram_id),
            "nombre_marca": nombre_marca,
            "texto_publicacion": post_description[:1000] if post_description else "",
            "comentario_original": comment_text[:1000] if comment_text else "",
            "es_inapropiado": respuestas.get("es_inapropiado", False),
            "razon_inapropiado": respuestas.get("razon_inapropiado"),
            "respuesta_comentario": respuestas.get("respuesta_comentario"),
            "mensaje_inbox": respuestas.get("mensaje_inbox"),
            "plataforma": platform,
            "comment_id": comment_id,
            "sender_id": str(sender_id) if sender_id else None,
            "media_id": str(media_id) if media_id else None,
            "respuesta_enviada": respuesta_enviada,
            "dm_enviado": dm_enviado
        }).execute()
        print(f"[SUPABASE] ✅ Log guardado: {comment_id}")
    except Exception as e:
        print(f"[SUPABASE] Error guardando log: {e}")


def cleanup_old_locks():
    """Limpia locks antiguos (más de 24 horas)"""
    if not supabase:
        return 0
    try:
        limite = (datetime.now() - timedelta(hours=24)).isoformat()
        result = supabase.table("comment_locks").delete().lt("created_at", limite).execute()
        eliminados = len(result.data) if result.data else 0
        if eliminados > 0:
            print(f"[CLEANUP] Locks eliminados: {eliminados}")
        return eliminados
    except Exception as e:
        print(f"[CLEANUP] Error: {e}")
        return 0


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE GOOGLE SHEETS (FALLBACK)
# ═══════════════════════════════════════════════════════════════════════════════

def get_user_accounts_sheets(user_id):
    """Obtiene cuentas desde Google Sheets (fallback)"""
    if not sheet:
        return []
    try:
        response = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range='user_instagram_accounts!A:E'
        ).execute()
        values = response.get('values', [])
        accounts = []
        for row in values[1:]:
            if len(row) >= 5 and row[0] == str(user_id):
                accounts.append({
                    'user_id': row[0],
                    'page_id': row[1],
                    'page_name': row[2],
                    'instagram_id': row[3]
                })
        return accounts
    except Exception as e:
        print(f"[SHEETS] Error: {e}")
        return []


def get_prompt_from_sheets(user_id):
    """Obtiene prompt desde Google Sheets (fallback)"""
    if not sheet:
        return None
    try:
        response = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range='prompts'
        ).execute()
        rows = response.get('values', [])

        for row in rows[1:]:
            if len(row) >= 4 and row[0] == str(user_id) and row[3].lower() == 'true':
                return row[2]
        return None
    except Exception as e:
        print(f"[SHEETS] Error: {e}")
        return None


def save_to_sheets_user_accounts(user_id, page_id, page_name, instagram_id, page_access_token):
    """Guarda cuenta en Google Sheets (fallback)"""
    if not sheet:
        return
    try:
        values = [[user_id, page_id, page_name, instagram_id, page_access_token]]
        body = {'values': values}
        sheet.values().append(
            spreadsheetId=SPREADSHEET_ID,
            range='user_instagram_accounts',
            valueInputOption='RAW',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()
        print(f"[SHEETS] ✅ Cuenta guardada: {page_name}")
    except Exception as e:
        print(f"[SHEETS] Error guardando cuenta: {e}")


def save_comment_to_sheets(sender_name, sender_id, message, post_id, comment_id, platform, user_id_owner, reply_message, inbox_message):
    """Guarda comentario en Google Sheets (fallback)"""
    if not sheet:
        return
    try:
        current_datetime = datetime.now()
        date = current_datetime.strftime("%Y-%m-%d")
        time_str = current_datetime.strftime("%H:%M:%S")

        values = [[user_id_owner, platform, sender_name, sender_id, message, post_id, comment_id, reply_message, inbox_message, date, time_str]]
        body = {'values': values}

        sheet.values().append(
            spreadsheetId=SPREADSHEET_ID,
            range='COMENTARIOS INSTAGRAM Y FACEBOOK',
            valueInputOption='RAW',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()
    except Exception as e:
        print(f"[SHEETS] Error guardando comentario: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE META API
# ═══════════════════════════════════════════════════════════════════════════════

GRAPH_API_URL = "https://graph.facebook.com/v18.0"


def get_long_lived_token(short_token):
    """Intercambia token corto por uno de larga duración"""
    url = f"{GRAPH_API_URL}/oauth/access_token"
    params = {
        'grant_type': 'fb_exchange_token',
        'client_id': APP_ID,
        'client_secret': APP_SECRET,
        'fb_exchange_token': short_token
    }
    response = requests.get(url, params=params)
    data = response.json()
    return data.get('access_token')


def subscribe_page_to_webhooks(page_id, page_token):
    """Suscribe una página a webhooks de Facebook"""
    url = f"{GRAPH_API_URL}/{page_id}/subscribed_apps"

    subscribed_fields = ['feed', 'messages', 'messaging_postbacks', 'messaging_optins']

    params = {
        'subscribed_fields': ','.join(subscribed_fields),
        'access_token': page_token
    }

    print(f"[META] Suscribiendo página {page_id} a webhooks...")

    try:
        response = requests.post(url, params=params)
        data = response.json()

        if data.get('success'):
            print(f"[META] ✅ Página {page_id} suscrita exitosamente")
            return {"success": True}
        else:
            print(f"[META] ❌ Error suscribiendo: {data}")
            return {"success": False, "error": data}
    except Exception as e:
        print(f"[META] ❌ Excepción: {e}")
        return {"success": False, "error": str(e)}


def get_post_description(media_id, token):
    """Obtiene la descripción/caption de un post"""
    if not media_id:
        return ''

    url = f"{GRAPH_API_URL}/{media_id}"
    params = {'fields': 'caption,message', 'access_token': token}

    try:
        response = requests.get(url, params=params)
        data = response.json()
        if 'error' in data:
            return ''
        return data.get('caption') or data.get('message', '')
    except Exception as e:
        print(f"[META] Error obteniendo descripción: {e}")
        return ''


def get_post_details(post_id, token):
    """Obtiene detalles completos de un post para guardar en base_cuentas"""
    if not post_id:
        return None

    url = f"{GRAPH_API_URL}/{post_id}"
    params = {
        'fields': 'id,caption,message,media_type,media_url,permalink,timestamp,attachments',
        'access_token': token
    }

    try:
        response = requests.get(url, params=params)
        data = response.json()

        if 'error' in data:
            print(f"[META] Error obteniendo detalles del post: {data['error']}")
            return None

        return {
            'post_id': data.get('id'),
            'caption': data.get('caption') or data.get('message', ''),
            'media_type': data.get('media_type', 'unknown'),
            'media_url': data.get('media_url'),
            'permalink': data.get('permalink'),
            'timestamp': data.get('timestamp', datetime.now().isoformat())
        }
    except Exception as e:
        print(f"[META] Error obteniendo detalles del post: {e}")
        return None


def reply_to_instagram_comment(comment_id, message, token):
    """Responde a un comentario de Instagram"""
    url = f"{GRAPH_API_URL}/{comment_id}/replies"
    params = {'message': message, 'access_token': token}
    response = requests.post(url, params=params)
    data = response.json()

    if 'id' in data:
        anti_loop.mark_bot_reply(data['id'])
        print(f"[META] ✅ Respuesta IG enviada: {data['id']}")
    else:
        print(f"[META] ❌ Error respuesta IG: {data}")

    return data


def reply_to_facebook_comment(comment_id, message, token):
    """Responde a un comentario de Facebook"""
    url = f"{GRAPH_API_URL}/{comment_id}/comments"
    params = {'message': message, 'access_token': token}
    response = requests.post(url, params=params)
    data = response.json()

    if 'id' in data:
        anti_loop.mark_bot_reply(data['id'])
        print(f"[META] ✅ Respuesta FB enviada: {data['id']}")
    else:
        print(f"[META] ❌ Error respuesta FB: {data}")

    return data


def send_direct_message(recipient_id, message, token):
    """Envía un mensaje directo"""
    url = f"{GRAPH_API_URL}/me/messages"
    payload = {
        'recipient': {'id': recipient_id},
        'message': {'text': message},
        'messaging_type': 'RESPONSE',
        'access_token': token
    }

    response = requests.post(url, json=payload)
    data = response.json()

    if 'message_id' in data:
        print(f"[META] ✅ DM enviado: {data['message_id']}")
    elif 'error' in data:
        print(f"[META] ❌ Error DM: {data['error'].get('message', 'Unknown')}")

    return data


def hide_comment(comment_id, token):
    """Oculta un comentario"""
    url = f"{GRAPH_API_URL}/{comment_id}"
    params = {'is_hidden': True, 'access_token': token}
    response = requests.post(url, params=params)
    return response.json()


# ═══════════════════════════════════════════════════════════════════════════════
# FUNCIONES DE OPENAI
# ═══════════════════════════════════════════════════════════════════════════════

def is_unwanted_message(text):
    """Verifica si un mensaje es indeseado (muy corto, solo emoji, etc.)"""
    if not text:
        return True
    text_lower = text.lower().strip()
    unwanted = ['👍', '👎', '❤️', '😂', '🔥', 'ok', 'jaja', 'jeje', 'xd', '...', '😍', '🙌', '👏', '💪', '🎉']
    if text_lower in unwanted or len(text_lower) < 3:
        return True
    return False


def generate_responses(instagram_id, post_description, comment_text):
    """Genera respuestas usando OpenAI con sistema de prioridades"""
    if not openai_client:
        return fallback_response()

    datos = get_brand_data(instagram_id)
    if not datos:
        return fallback_response()

    nombre_marca = datos.get("nombre_marca", "la marca")
    prompt_sistema = build_system_prompt(datos)
    prompt_usuario = build_user_prompt(post_description, comment_text)

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": prompt_usuario}
            ],
            temperature=0.7,
            max_tokens=500
        )
        respuesta_raw = response.choices[0].message.content
        respuesta_json = parse_openai_response(respuesta_raw)

        print(f"[OPENAI] ✅ Respuesta generada para {nombre_marca}")
        save_comment_log(instagram_id, nombre_marca, post_description, comment_text, respuesta_json)

        return respuesta_json
    except Exception as e:
        print(f"[OPENAI] ❌ Error: {e}")
        return fallback_response()


def build_system_prompt(datos):
    """Construye el prompt del sistema con prioridades"""
    hoy = datetime.now().strftime('%Y-%m-%d')
    nombre_marca = datos.get("nombre_marca", "la marca")

    prompt = f"""Eres un asistente de atención al cliente para "{nombre_marca}".
Respondes comentarios en redes sociales de forma cálida, cercana y profesional.

FECHA: {hoy}

═══════════════════════════════════════════════════════════════
INFORMACIÓN OBLIGATORIA (siempre usar):
═══════════════════════════════════════════════════════════════
"""
    for dato in datos.get("siempre_incluir", []):
        prompt += f"• {dato['clave']}: {dato['valor']}\n"
    if not datos.get("siempre_incluir"):
        prompt += "• (Sin información obligatoria)\n"

    prompt += """
═══════════════════════════════════════════════════════════════
INFORMACIÓN RELEVANTE (usar si aplica):
═══════════════════════════════════════════════════════════════
"""
    for dato in datos.get("si_relevante", [])[:10]:  # Limitar a 10
        prompt += f"• [{dato['categoria']}] {dato['clave']}: {dato['valor'][:200]}\n"

    if datos.get("promociones_activas"):
        prompt += "\n🎉 PROMOCIONES ACTIVAS:\n"
        for promo in datos["promociones_activas"][:5]:
            prompt += f"• {promo['clave']}: {promo['valor']}\n"

    if datos.get("publicaciones_recientes"):
        prompt += "\n📱 PUBLICACIONES RECIENTES:\n"
        for pub in datos["publicaciones_recientes"][:3]:
            prompt += f"• {pub['valor'][:150]}...\n"

    prompt += """
═══════════════════════════════════════════════════════════════
REGLAS:
═══════════════════════════════════════════════════════════════
1. Si es GROSERO/AGRESIVO: es_inapropiado=true
2. Si preguntan PRECIOS no disponibles: invitar a consultar por inbox
3. MÁXIMO 100 tokens por respuesta
4. Genera DOS respuestas diferentes:
   a) respuesta_comentario: Respuesta PÚBLICA
   b) mensaje_inbox: Mensaje PRIVADO (NO decir "te escribiremos")
"""
    return prompt


def build_user_prompt(post_description, comment_text):
    """Construye el prompt del usuario"""
    return f"""
PUBLICACIÓN: "{post_description[:300] if post_description else '(sin descripción)'}"
COMENTARIO: "{comment_text}"

Responde en JSON (sin markdown):
{{"es_inapropiado": true/false, "razon_inapropiado": "razón o null", "respuesta_comentario": "respuesta pública", "mensaje_inbox": "mensaje privado"}}
"""


def parse_openai_response(respuesta_raw):
    """Parsea la respuesta de OpenAI"""
    try:
        respuesta_limpia = respuesta_raw.strip()
        if respuesta_limpia.startswith("```"):
            respuesta_limpia = respuesta_limpia.split("```")[1]
            if respuesta_limpia.startswith("json"):
                respuesta_limpia = respuesta_limpia[4:]
            respuesta_limpia = respuesta_limpia.strip()
        return json.loads(respuesta_limpia)
    except:
        return {
            "es_inapropiado": False,
            "razon_inapropiado": None,
            "respuesta_comentario": respuesta_raw[:200] if respuesta_raw else "¡Gracias por tu comentario!",
            "mensaje_inbox": "¡Hola! ¿En qué podemos ayudarte? 😊"
        }


def fallback_response():
    """Respuesta de fallback cuando no hay datos o falla OpenAI"""
    return {
        "es_inapropiado": False,
        "razon_inapropiado": None,
        "respuesta_comentario": "¡Gracias por tu comentario! Te escribiremos por interno para ayudarte. 😊",
        "mensaje_inbox": "¡Hola! Cuéntame, ¿en qué te podemos ayudar?"
    }


def generate_dm_response(instagram_id, user_message, user_id):
    """Genera respuesta para DM con historial de conversación"""
    if not openai_client:
        return "¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte?"

    datos = get_brand_data(instagram_id)
    if not datos:
        return "¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte?"

    history = conversation_history.get_history(user_id)
    nombre_marca = datos.get("nombre_marca", "la marca")

    system_prompt = f"""Eres atención al cliente de "{nombre_marca}" respondiendo DMs.
Sé breve, amable y conversacional. Máximo 100 tokens."""

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-5:]:  # Últimos 5 mensajes
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=200
        )
        respuesta = response.choices[0].message.content

        conversation_history.add_message(user_id, "user", user_message)
        conversation_history.add_message(user_id, "assistant", respuesta)

        return respuesta
    except Exception as e:
        print(f"[OPENAI] Error DM: {e}")
        return "¡Gracias por tu mensaje! Te responderemos pronto. 😊"


# ═══════════════════════════════════════════════════════════════════════════════
# PROCESADORES DE EVENTOS
# ═══════════════════════════════════════════════════════════════════════════════

def process_instagram_comment(comment_id, media_id, instagram_id, text, sender_id, token):
    """Procesa un comentario de Instagram"""
    print(f"\n[IG_COMMENT] ═══════════════════════════════════════")
    print(f"[IG_COMMENT] Comment: {comment_id}")
    print(f"[IG_COMMENT] Sender: {sender_id}")
    print(f"[IG_COMMENT] Texto: {text[:80]}...")

    # Verificaciones anti-bucle
    if anti_loop.is_own_account(sender_id):
        print(f"[IG_COMMENT] ⚠️ Cuenta propia, ignorando")
        return None

    if is_unwanted_message(text):
        print(f"[IG_COMMENT] ⚠️ Mensaje indeseado, ignorando")
        return None

    # Obtener cuenta
    account = get_account_by_instagram_id(instagram_id)
    if not account:
        print(f"[IG_COMMENT] ❌ Cuenta no encontrada")
        return None

    page_name = account.get('page_name', 'Marca')

    # Obtener descripción del post
    post_description = get_post_description(media_id, token)

    # Generar respuestas
    respuestas = generate_responses(instagram_id, post_description, text)

    respuesta_publica = respuestas.get("respuesta_comentario", "")
    mensaje_inbox = respuestas.get("mensaje_inbox", "")
    es_inapropiado = respuestas.get("es_inapropiado", False)

    # Ocultar si es inapropiado
    if es_inapropiado:
        print(f"[IG_COMMENT] Ocultando comentario inapropiado...")
        hide_comment(comment_id, token)

    # Enviar respuesta pública
    respuesta_enviada = False
    if respuesta_publica:
        reply_result = reply_to_instagram_comment(comment_id, respuesta_publica, token)
        if 'id' in reply_result:
            respuesta_enviada = True

    # Enviar DM
    dm_enviado = False
    if mensaje_inbox:
        dm_result = send_direct_message(sender_id, mensaje_inbox, token)
        if 'message_id' in dm_result:
            dm_enviado = True

    # Guardar log en Supabase
    save_comment_log(
        instagram_id=instagram_id,
        nombre_marca=page_name,
        post_description=post_description,
        comment_text=text,
        respuestas=respuestas,
        platform="Instagram",
        comment_id=comment_id,
        sender_id=sender_id,
        media_id=media_id,
        respuesta_enviada=respuesta_enviada,
        dm_enviado=dm_enviado
    )

    # Guardar en Sheets (fallback)
    save_comment_to_sheets(
        sender_name="Usuario",
        sender_id=sender_id,
        message=text,
        post_id=media_id or "",
        comment_id=comment_id,
        platform="Instagram",
        user_id_owner=instagram_id,
        reply_message=respuesta_publica,
        inbox_message=mensaje_inbox
    )

    print(f"[IG_COMMENT] ✅ Procesado (respuesta={respuesta_enviada}, dm={dm_enviado})")
    return respuestas


def process_facebook_comment(comment_id, post_id, page_id, text, sender_id, sender_name, token):
    """Procesa un comentario de Facebook"""
    print(f"\n[FB_COMMENT] ═══════════════════════════════════════")
    print(f"[FB_COMMENT] Comment: {comment_id}")
    print(f"[FB_COMMENT] Sender: {sender_name} ({sender_id})")
    print(f"[FB_COMMENT] Texto: {text[:80]}...")

    # Verificaciones anti-bucle
    if anti_loop.is_own_account(sender_id):
        print(f"[FB_COMMENT] ⚠️ Cuenta propia, ignorando")
        return None

    if is_unwanted_message(text):
        print(f"[FB_COMMENT] ⚠️ Mensaje indeseado, ignorando")
        return None

    # Obtener cuenta
    account = get_account_by_page_id(page_id)
    if not account:
        print(f"[FB_COMMENT] ❌ Cuenta no encontrada")
        return None

    page_name = account.get('page_name', 'Marca')
    instagram_id = account.get('instagram_id') or page_id

    # Verificar que no es la propia página
    if sender_name == page_name:
        print(f"[FB_COMMENT] ⚠️ Comentario de la propia página, ignorando")
        return None

    # Obtener descripción del post
    post_description = get_post_description(post_id, token)

    # Generar respuestas
    respuestas = generate_responses(instagram_id, post_description, text)

    respuesta_publica = respuestas.get("respuesta_comentario", "")
    mensaje_inbox = respuestas.get("mensaje_inbox", "")
    es_inapropiado = respuestas.get("es_inapropiado", False)

    # Ocultar si es inapropiado
    if es_inapropiado:
        hide_comment(comment_id, token)

    # Enviar respuesta pública
    respuesta_enviada = False
    if respuesta_publica:
        reply_result = reply_to_facebook_comment(comment_id, respuesta_publica, token)
        if 'id' in reply_result:
            respuesta_enviada = True

    # Enviar DM
    dm_enviado = False
    if mensaje_inbox:
        dm_result = send_direct_message(sender_id, mensaje_inbox, token)
        if 'message_id' in dm_result:
            dm_enviado = True

    # Guardar log en Supabase
    save_comment_log(
        instagram_id=instagram_id,
        nombre_marca=page_name,
        post_description=post_description,
        comment_text=text,
        respuestas=respuestas,
        platform="Facebook",
        comment_id=comment_id,
        sender_id=sender_id,
        media_id=post_id,
        respuesta_enviada=respuesta_enviada,
        dm_enviado=dm_enviado
    )

    # Guardar en Sheets (fallback)
    save_comment_to_sheets(
        sender_name=sender_name,
        sender_id=sender_id,
        message=text,
        post_id=post_id or "",
        comment_id=comment_id,
        platform="Facebook",
        user_id_owner=instagram_id,
        reply_message=respuesta_publica,
        inbox_message=mensaje_inbox
    )

    print(f"[FB_COMMENT] ✅ Procesado (respuesta={respuesta_enviada}, dm={dm_enviado})")
    return respuestas


def process_new_post(post_id, page_id, item_type, value, token):
    """
    Procesa una nueva publicación:
    1. Busca admin de la marca
    2. Si hay admin con teléfono: guarda como 'pendiente' + crea tarea + envía WhatsApp
    3. Si no hay admin: guarda como 'activo' (comportamiento anterior)

    item_type puede ser: status, photo, video, share
    """
    print(f"\n[NEW_POST] ═══════════════════════════════════════")
    print(f"[NEW_POST] Post ID: {post_id}")
    print(f"[NEW_POST] Page ID: {page_id}")
    print(f"[NEW_POST] Tipo: {item_type}")

    # Obtener cuenta
    account = get_account_by_page_id(page_id)
    if not account:
        print(f"[NEW_POST] ❌ Cuenta no encontrada para page_id: {page_id}")
        return False

    page_name = account.get('page_name', 'Marca')
    instagram_id = account.get('instagram_id') or page_id

    # Obtener detalles del post
    post_details = get_post_details(post_id, token)

    if not post_details:
        # Si no podemos obtener detalles, crear datos básicos
        post_details = {
            'post_id': post_id,
            'caption': value.get('message', '') or value.get('story', ''),
            'media_type': item_type,
            'permalink': value.get('link', ''),
            'timestamp': datetime.now().isoformat()
        }

    # ══════════════════════════════════════════════════════════
    # NUEVO FLUJO: Aprobación de reglas
    # ══════════════════════════════════════════════════════════

    # 1. Buscar admin de la marca
    admin_info = get_admin_phone_by_marca(instagram_id)

    if not admin_info:
        # Si no hay admin con teléfono, guardar como activo (comportamiento anterior)
        print(f"[NEW_POST] ⚠️ No hay admin con teléfono, guardando como ACTIVO")
        saved = save_post_to_base_cuentas(instagram_id, page_name, post_details, 'activo')
        if saved:
            print(f"[NEW_POST] ✅ Publicación guardada (activa)")
        return saved

    # 2. Guardar publicación como PENDIENTE
    saved = save_post_to_base_cuentas(instagram_id, page_name, post_details, 'pendiente')

    if not saved:
        print(f"[NEW_POST] ⚠️ Publicación no guardada (ya existía o error)")
        return False

    print(f"[NEW_POST] ✅ Publicación guardada como PENDIENTE")

    # 3. Crear tarea de aprobación
    tarea = create_approval_task(instagram_id, page_name, post_details, admin_info)

    if not tarea:
        print(f"[NEW_POST] ⚠️ Error creando tarea, regla queda pendiente sin notificación")
        return True  # La regla se guardó, aunque sin tarea

    # 4. Enviar WhatsApp al admin
    whatsapp_sent = send_whatsapp_approval_request(
        admin_info,
        post_details,
        page_name,
        tarea['id']
    )

    if whatsapp_sent:
        print(f"[NEW_POST] ✅ Flujo completo: pendiente + tarea #{tarea['id']} + WhatsApp enviado")
    else:
        print(f"[NEW_POST] ⚠️ Regla pendiente + tarea creada (WhatsApp falló)")

    return True


def process_messenger_message(sender_id, page_id, message_text, token):
    """Procesa un mensaje de Messenger"""
    print(f"\n[MESSENGER] De: {sender_id} | Texto: {message_text[:50]}...")

    if anti_loop.is_own_account(sender_id):
        return None

    if is_unwanted_message(message_text):
        return None

    account = get_account_by_page_id(page_id)
    if not account:
        print(f"[MESSENGER] ❌ Cuenta no encontrada")
        return None

    instagram_id = account.get('instagram_id') or page_id

    respuesta = generate_dm_response(instagram_id, message_text, sender_id)
    if respuesta:
        send_direct_message(sender_id, respuesta, token)

    return respuesta


# ═══════════════════════════════════════════════════════════════════════════════
# RUTAS - WEBHOOK
# ═══════════════════════════════════════════════════════════════════════════════

@comentarios_bp.route('/webhook', methods=['GET', 'POST'])
def webhook():
    """Endpoint principal de webhook para Meta"""

    if request.method == 'GET':
        # Verificación del webhook
        verify_token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')
        mode = request.args.get('hub.mode')

        if mode == 'subscribe' and verify_token == VERIFY_TOKEN:
            print("[WEBHOOK] ✅ Verificación exitosa")
            return challenge, 200
        else:
            print(f"[WEBHOOK] ❌ Verificación fallida. Token recibido: {verify_token}")
            return 'Forbidden', 403

    elif request.method == 'POST':
        data = request.get_json()

        if not data:
            return 'OK', 200

        print(f"\n{'='*70}")
        print(f"[WEBHOOK] EVENTO RECIBIDO")
        print(f"{'='*70}")
        print(f"[WEBHOOK] Object: {data.get('object')}")

        try:
            for entry in data.get('entry', []):
                entry_id = entry.get('id')
                print(f"[WEBHOOK] Entry ID: {entry_id}")

                # Buscar cuenta y token
                account = get_account_by_page_id(entry_id) or get_account_by_instagram_id(entry_id)
                if not account:
                    print(f"[WEBHOOK] ⚠️ Cuenta no encontrada para: {entry_id}")
                    continue

                token = account.get('page_access_token')
                if not token:
                    print(f"[WEBHOOK] ⚠️ Token no encontrado")
                    continue

                # ═══════════════════════════════════════════════════════════════
                # PROCESAR CHANGES (Instagram comments, Facebook feed)
                # ═══════════════════════════════════════════════════════════════
                for change in entry.get('changes', []):
                    field = change.get('field')
                    value = change.get('value', {})

                    print(f"[WEBHOOK] Field: {field}")

                    # ─────────────────────────────────────────────────────────────
                    # INSTAGRAM COMMENTS
                    # ─────────────────────────────────────────────────────────────
                    if field == 'comments':
                        comment_id = value.get('id')
                        text = value.get('text', '')
                        sender_id = value.get('from', {}).get('id')
                        media_id = value.get('media', {}).get('id') if isinstance(value.get('media'), dict) else value.get('media_id')

                        if not all([comment_id, text, sender_id]):
                            print(f"[WEBHOOK] ⚠️ Datos incompletos para comentario IG")
                            continue

                        # Adquirir lock
                        if not acquire_comment_lock(comment_id, entry_id, "instagram"):
                            continue

                        # Verificar duplicado local
                        if anti_loop.is_comment_duplicate(comment_id):
                            continue
                        anti_loop.mark_comment_processed(comment_id)

                        process_instagram_comment(comment_id, media_id, entry_id, text, sender_id, token)

                    # ─────────────────────────────────────────────────────────────
                    # FACEBOOK FEED (comments + posts)
                    # ─────────────────────────────────────────────────────────────
                    elif field == 'feed':
                        item_type = value.get('item')
                        verb = value.get('verb', 'add')

                        print(f"[WEBHOOK] Feed item: {item_type}, verb: {verb}")

                        # ─────────────────────────────────────────────────────────
                        # COMENTARIOS DE FACEBOOK
                        # ─────────────────────────────────────────────────────────
                        if item_type == 'comment' and verb == 'add':
                            comment_id = value.get('comment_id')
                            post_id = value.get('post_id')
                            message = value.get('message', '')
                            sender_info = value.get('from', {})
                            sender_id = sender_info.get('id')
                            sender_name = sender_info.get('name', '')

                            if not all([comment_id, message, sender_id]):
                                print(f"[WEBHOOK] ⚠️ Datos incompletos para comentario FB")
                                continue

                            # Adquirir lock
                            if not acquire_comment_lock(comment_id, entry_id, "facebook"):
                                continue

                            # Verificar duplicado local
                            if anti_loop.is_comment_duplicate(comment_id):
                                continue
                            anti_loop.mark_comment_processed(comment_id)

                            process_facebook_comment(comment_id, post_id, entry_id, message, sender_id, sender_name, token)

                        # ─────────────────────────────────────────────────────────
                        # NUEVAS PUBLICACIONES
                        # ─────────────────────────────────────────────────────────
                        elif item_type in ['status', 'photo', 'video', 'share'] and verb == 'add':
                            post_id = value.get('post_id')

                            if post_id:
                                process_new_post(post_id, entry_id, item_type, value, token)

                        # ─────────────────────────────────────────────────────────
                        # OTROS EVENTOS DE FEED
                        # ─────────────────────────────────────────────────────────
                        elif item_type == 'reaction':
                            print(f"[WEBHOOK] Reacción recibida (ignorando)")
                        else:
                            print(f"[WEBHOOK] Feed item no manejado: {item_type}")

                # ═══════════════════════════════════════════════════════════════
                # PROCESAR MESSAGING (Messenger DMs)
                # ═══════════════════════════════════════════════════════════════
                for messaging in entry.get('messaging', []):
                    if 'message' in messaging:
                        sender_id = messaging.get('sender', {}).get('id')
                        message_text = messaging.get('message', {}).get('text', '')
                        page_id = messaging.get('recipient', {}).get('id')

                        if sender_id and message_text:
                            process_messenger_message(sender_id, page_id, message_text, token)

        except Exception as e:
            print(f"[WEBHOOK] ❌ Error procesando: {e}")
            import traceback
            traceback.print_exc()

        return 'OK', 200


# ═══════════════════════════════════════════════════════════════════════════════
# RUTAS - AUTENTICACIÓN
# ═══════════════════════════════════════════════════════════════════════════════

@comentarios_bp.route('/')
def index():
    """Página de inicio"""
    if 'username' in session:
        return redirect(url_for('comentarios.dashboard'))
    return render_template('home_inicial.html')


@comentarios_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Login de usuarios"""
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        # Intentar con Supabase primero
        user = login_usuario_supabase(username, password)

        if user:
            session['logged_in'] = True
            session['username'] = user.get('nombre') or username
            session['user_id'] = str(user['id'])
            session['id_marca'] = user.get('id_marca')
            session['nombre_marca'] = user.get('nombre_marca')
            return redirect(url_for('comentarios.dashboard'))
        else:
            # Fallback a Google Sheets
            users = get_users_from_sheet()
            sheet_user = users.get(username)
            if sheet_user and password == sheet_user['password']:
                session['logged_in'] = True
                session['username'] = username
                session['user_id'] = sheet_user['id']
                return redirect(url_for('comentarios.dashboard'))
            else:
                return render_template('login.html', error='Usuario o contraseña incorrectos.')

    return render_template('login.html')


@comentarios_bp.route('/logout')
def logout():
    """Cerrar sesión"""
    session.clear()
    return redirect(url_for('comentarios.index'))


# ═══════════════════════════════════════════════════════════════════════════════
# RUTAS - DASHBOARD Y VISTAS
# ═══════════════════════════════════════════════════════════════════════════════

@comentarios_bp.route('/dashboard')
def dashboard():
    """Dashboard principal"""
    if not session.get('logged_in'):
        flash('Debes iniciar sesión primero.', 'warning')
        return redirect(url_for('comentarios.login'))

    user_id = session.get('user_id')
    id_marca = session.get('id_marca')

    # Intentar Supabase primero
    accounts = get_user_accounts_supabase(user_id, id_marca)

    # Fallback a Sheets
    if not accounts:
        accounts = get_user_accounts_sheets(user_id)

    return render_template(
        'dashboard.html',
        username=session.get('username'),
        nombre_marca=session.get('nombre_marca', ''),
        accounts=accounts
    )


@comentarios_bp.route('/comentarios_prompts', methods=['GET', 'POST'])
def comentarios_prompts():
    """Gestión de prompts"""
    if not session.get('logged_in'):
        return redirect(url_for('comentarios.login'))

    user_id = session.get('user_id')
    success_message = None

    if request.method == 'POST':
        new_prompt = request.form.get('prompt')
        if new_prompt:
            # Obtener cuenta del usuario
            accounts = get_user_accounts_supabase(user_id, session.get('id_marca'))
            if accounts and accounts[0].get('instagram_id'):
                instagram_id = accounts[0]['instagram_id']
                page_name = accounts[0].get('page_name', 'Marca')

                # Desactivar prompts anteriores
                if supabase:
                    supabase.table("base_cuentas")\
                        .update({"Estado": False})\
                        .eq("ID marca", str(instagram_id))\
                        .eq("categoria", "prompt")\
                        .execute()

                    # Crear nuevo prompt
                    supabase.table("base_cuentas").insert({
                        "Nombre marca": page_name,
                        "Estado": True,
                        "ID marca": str(instagram_id),
                        "categoria": "prompt",
                        "clave": "prompt_principal",
                        "valor": new_prompt,
                        "prioridad": 1,
                        "creado_en": datetime.now().isoformat()
                    }).execute()

                    success_message = "¡Prompt actualizado con éxito!"

    # Obtener prompts
    prompts = []
    accounts = get_user_accounts_supabase(user_id, session.get('id_marca'))
    if accounts and supabase:
        for acc in accounts:
            if acc.get('instagram_id'):
                response = supabase.table("base_cuentas")\
                    .select("*")\
                    .eq("ID marca", str(acc['instagram_id']))\
                    .eq("categoria", "prompt")\
                    .order("creado_en", desc=True)\
                    .execute()

                for row in response.data:
                    prompts.append([
                        row.get('ID marca'),
                        row.get('creado_en', '')[:10] if row.get('creado_en') else '',
                        row.get('valor', ''),
                        'TRUE' if row.get('Estado') else 'FALSE'
                    ])

    return render_template('prompts.html', prompts=prompts, success_message=success_message)


@comentarios_bp.route('/registro_comentarios')
def registro_comentarios():
    """Registro de comentarios"""
    if not session.get('logged_in'):
        return redirect(url_for('comentarios.login'))

    user_id = session.get('user_id')

    # Obtener comentarios de logs_comentarios (Supabase)
    comments = []
    accounts = get_user_accounts_supabase(user_id, session.get('id_marca'))

    if accounts and supabase:
        for acc in accounts:
            instagram_id = acc.get('instagram_id')
            if instagram_id:
                try:
                    fecha_limite = (datetime.now() - timedelta(days=30)).isoformat()
                    response = supabase.table("logs_comentarios")\
                        .select("*")\
                        .eq("id_marca", str(instagram_id))\
                        .gte("creado_en", fecha_limite)\
                        .order("creado_en", desc=True)\
                        .execute()

                    for row in response.data:
                        fecha = datetime.fromisoformat(row['creado_en'].replace('Z', '+00:00')) if row.get('creado_en') else datetime.now()
                        comments.append({
                            'platform': row.get('plataforma', 'Instagram'),
                            'name': row.get('nombre_marca', ''),
                            'message': row.get('comentario_original', ''),
                            'post_id': row.get('texto_publicacion', '')[:30] if row.get('texto_publicacion') else '',
                            'Reply_Message': row.get('respuesta_comentario', ''),
                            'date': fecha
                        })
                except Exception as e:
                    print(f"[REGISTRO] Error obteniendo comentarios: {e}")

    # Preparar datos para gráfico
    comment_dates = [c['date'].strftime('%Y-%m-%d') for c in comments if isinstance(c.get('date'), datetime)]
    comment_count_by_date = Counter(comment_dates)

    today = datetime.now().date()
    dates_last_30_days = [(today - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(30)]
    sorted_counts = [comment_count_by_date.get(date, 0) for date in dates_last_30_days]

    return render_template(
        'registro_comentarios.html',
        comments=comments,
        chart_data={
            'labels': dates_last_30_days[::-1],
            'values': sorted_counts[::-1]
        }
    )


@comentarios_bp.route('/reportes')
def reportes():
    """Reportes y estadísticas"""
    if not session.get('logged_in'):
        return redirect(url_for('comentarios.login'))

    user_id = session.get('user_id')

    # Obtener todos los comentarios
    comments = []
    accounts = get_user_accounts_supabase(user_id, session.get('id_marca'))

    if accounts and supabase:
        for acc in accounts:
            instagram_id = acc.get('instagram_id')
            if instagram_id:
                try:
                    response = supabase.table("logs_comentarios")\
                        .select("creado_en, texto_publicacion")\
                        .eq("id_marca", str(instagram_id))\
                        .execute()

                    for row in response.data:
                        fecha = datetime.fromisoformat(row['creado_en'].replace('Z', '+00:00')) if row.get('creado_en') else datetime.now()
                        comments.append({
                            'post_id': row.get('texto_publicacion', '')[:30] if row.get('texto_publicacion') else str(row.get('id', '')),
                            'date': fecha
                        })
                except Exception as e:
                    print(f"[REPORTES] Error: {e}")

    # Comentarios por publicación
    comentarios_por_publicacion = defaultdict(int)
    for c in comments:
        post_id = c.get('post_id', 'Sin ID')
        comentarios_por_publicacion[post_id] += 1

    publicaciones_data = [{"post_id": pid, "total": total} for pid, total in comentarios_por_publicacion.items()]
    publicaciones_data.sort(key=lambda x: x['total'], reverse=True)

    # Comentarios por hora
    comentarios_por_hora = defaultdict(int)
    for c in comments:
        if isinstance(c.get('date'), datetime):
            comentarios_por_hora[c['date'].hour] += 1

    horas_labels = [f"{h:02d}:00" for h in range(24)]
    horas_data = [comentarios_por_hora[h] for h in range(24)]

    # Comentarios por mes
    year_actual = datetime.now().year
    comentarios_por_mes = defaultdict(int)
    for c in comments:
        if isinstance(c.get('date'), datetime) and c['date'].year == year_actual:
            comentarios_por_mes[c['date'].month] += 1

    meses_labels = [calendar.month_name[m][:3] for m in range(1, 13)]
    meses_data = [comentarios_por_mes[m] for m in range(1, 13)]

    return render_template(
        'reportes.html',
        datetime=datetime,
        publicaciones_data=publicaciones_data[:20],  # Limitar a 20
        horas_labels=horas_labels,
        horas_data=horas_data,
        meses_labels=meses_labels,
        meses_data=meses_data
    )


# ═══════════════════════════════════════════════════════════════════════════════
# RUTAS - CONEXIÓN FACEBOOK/INSTAGRAM
# ═══════════════════════════════════════════════════════════════════════════════

@comentarios_bp.route('/connect_facebook')
def connect_facebook():
    """Iniciar OAuth de Facebook"""
    if not session.get('logged_in'):
        return redirect(url_for('comentarios.login'))

    scopes = [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        'pages_read_user_content',
        'pages_manage_metadata',
        'pages_manage_engagement',
        'pages_messaging',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_manage_comments',
        'instagram_manage_messages',
    ]

    state = session.get('user_id', 'unknown')

    fb_login_url = (
        f"https://www.facebook.com/v18.0/dialog/oauth?"
        f"client_id={APP_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope={','.join(scopes)}"
        f"&state={state}"
    )

    return redirect(fb_login_url)


@comentarios_bp.route('/connect_instagram')
def connect_instagram():
    """Redirige a connect_facebook (mismo flujo)"""
    return redirect(url_for('comentarios.connect_facebook'))


@comentarios_bp.route('/facebook_callback')
def facebook_callback():
    """Callback de OAuth de Facebook"""
    code = request.args.get('code')
    error = request.args.get('error')

    if error:
        return render_template('error.html', error=f"Error de Facebook: {error}")

    if not code:
        return render_template('error.html', error="No se recibió código de autorización")

    if not session.get('logged_in'):
        return redirect(url_for('comentarios.login'))

    try:
        # Obtener token
        token_url = f"{GRAPH_API_URL}/oauth/access_token"
        params = {
            'client_id': APP_ID,
            'client_secret': APP_SECRET,
            'redirect_uri': REDIRECT_URI,
            'code': code
        }
        response = requests.get(token_url, params=params)
        data = response.json()

        short_token = data.get('access_token')
        if not short_token:
            return render_template('error.html', error=f"Error obteniendo token: {data}")

        # Token de larga duración
        long_token = get_long_lived_token(short_token) or short_token

        # Obtener páginas
        pages_url = f"{GRAPH_API_URL}/me/accounts"
        pages_params = {'fields': 'id,name,access_token,instagram_business_account', 'access_token': long_token}
        pages_response = requests.get(pages_url, params=pages_params)
        pages_data = pages_response.json()

        if 'error' in pages_data:
            return render_template('error.html', error=f"Error obteniendo páginas: {pages_data}")

        user_id = session.get('user_id')
        connected_count = 0

        for page in pages_data.get('data', []):
            page_id = page.get('id')
            page_name = page.get('name')
            page_token = page.get('access_token')

            # Token de larga duración para la página
            page_long_token = get_long_lived_token(page_token) or page_token

            print(f"\n[OAUTH] Procesando: {page_name} ({page_id})")

            # Suscribir a webhooks
            subscribe_page_to_webhooks(page_id, page_long_token)

            # Obtener cuenta de Instagram
            instagram_account = page.get('instagram_business_account')
            instagram_id = None
            instagram_name = ""

            if isinstance(instagram_account, dict):
                instagram_id = instagram_account.get('id')
            elif isinstance(instagram_account, str):
                instagram_id = instagram_account

            if instagram_id:
                # Obtener nombre de Instagram
                ig_info_url = f"{GRAPH_API_URL}/{instagram_id}"
                ig_info_params = {'fields': 'username', 'access_token': page_long_token}
                ig_info_response = requests.get(ig_info_url, params=ig_info_params)
                ig_info_data = ig_info_response.json()
                instagram_name = ig_info_data.get('username', '')

                print(f"[OAUTH] Instagram: {instagram_name} ({instagram_id})")

            # Guardar en Supabase
            save_account_to_supabase(user_id, page_id, page_name, instagram_id, page_long_token, instagram_name)

            # Guardar en Sheets (fallback)
            save_to_sheets_user_accounts(user_id, page_id, page_name, instagram_id or '', page_long_token)

            # Añadir a anti-loop
            if instagram_id:
                anti_loop.add_own_account(instagram_id)
            anti_loop.add_own_account(page_id)

            connected_count += 1

        flash(f'Se conectaron {connected_count} cuenta(s) exitosamente.', 'success')
        return redirect(url_for('comentarios.dashboard'))

    except Exception as e:
        print(f"[OAUTH] Error: {e}")
        import traceback
        traceback.print_exc()
        return render_template('error.html', error=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# RUTAS - DIAGNÓSTICO
# ═══════════════════════════════════════════════════════════════════════════════

@comentarios_bp.route('/diagnostico')
def diagnostico():
    """Diagnóstico general del sistema"""
    accounts = []
    if supabase:
        try:
            response = supabase.table("cuentas_instagram").select("page_name, instagram_id, page_id").eq("activo", True).execute()
            accounts = response.data
        except:
            pass

    return jsonify({
        "status": "running",
        "version": "5.0-unificado",
        "total_cuentas": len(accounts),
        "cuentas": [{"page_name": a.get("page_name"), "instagram_id": a.get("instagram_id")} for a in accounts],
        "anti_loop_ids": len(anti_loop.own_account_ids),
        "verify_token_ok": bool(VERIFY_TOKEN),
        "openai_ok": bool(OPENAI_API_KEY),
        "supabase_ok": bool(supabase),
        "sheets_ok": bool(sheet)
    })


@comentarios_bp.route('/diagnostico_antibucle')
def diagnostico_antibucle():
    """Diagnóstico del sistema anti-bucle"""
    return jsonify({
        "cuentas_propias": list(anti_loop.own_account_ids),
        "total_cuentas": len(anti_loop.own_account_ids),
        "comentarios_procesados": len(anti_loop.processed_comments),
        "respuestas_bot": len(anti_loop.bot_sent_replies)
    })


@comentarios_bp.route('/test_webhook', methods=['POST'])
def test_webhook():
    """Endpoint para probar webhooks manualmente"""
    data = request.get_json()
    print(f"\n[TEST_WEBHOOK] Datos recibidos:")
    print(json.dumps(data, indent=2))
    return jsonify({"status": "received", "data": data})


# ═══════════════════════════════════════════════════════════════════════════════
# RUTAS - PÁGINAS ESTÁTICAS
# ═══════════════════════════════════════════════════════════════════════════════

@comentarios_bp.route('/terminos-y-condiciones')
def terminos_y_condiciones():
    return render_template('terminos_y_condiciones.html')


@comentarios_bp.route('/deletion_status')
def deletion_status():
    request_id = request.args.get('request_id')
    return render_template('deletion_status.html', request_id=request_id)


# ═══════════════════════════════════════════════════════════════════════════════
# INICIALIZACIÓN
# ═══════════════════════════════════════════════════════════════════════════════

def init_comentarios():
    """Inicializa el módulo de comentarios"""
    print("\n" + "="*70)
    print("🚀 INICIANDO BP_COMENTARIOS v5.0")
    print("="*70)

    # Verificar configuración
    print(f"[CONFIG] VERIFY_TOKEN: {'✅' if VERIFY_TOKEN else '❌'}")
    print(f"[CONFIG] APP_ID: {'✅' if APP_ID else '❌'}")
    print(f"[CONFIG] APP_SECRET: {'✅' if APP_SECRET else '❌'}")
    print(f"[CONFIG] OPENAI: {'✅' if OPENAI_API_KEY else '❌'}")
    print(f"[CONFIG] SUPABASE: {'✅' if supabase else '❌'}")
    print(f"[CONFIG] SHEETS: {'✅' if sheet else '❌'}")

    # Cargar IDs de cuentas propias
    anti_loop.load_own_account_ids()

    # Limpiar locks viejos
    cleanup_old_locks()

    print("="*70)
    print("✅ BP_COMENTARIOS inicializado")
    print(f"   Webhook: /comentarios/webhook")
    print(f"   Dashboard: /comentarios/dashboard")
    print("="*70 + "\n")

# Ejecutar inicialización
init_comentarios()