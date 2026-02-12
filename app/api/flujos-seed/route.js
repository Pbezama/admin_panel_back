/**
 * API: /api/flujos-seed
 * POST - Insertar flujo de ejemplo para testing
 *
 * Uso: POST /api/flujos-seed con body { id_marca: 123 }
 * Crea un flujo de ejemplo "Captar Lead y Agendar" listo para probar por WhatsApp.
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { crearFlujo } from '@/lib/supabase'

const FLUJO_EJEMPLO = {
  nombre: 'Bienvenida y Captura de Lead',
  descripcion: 'Flujo de ejemplo: saluda, captura nombre, email, tipo de reunion y crea tarea.',
  trigger_tipo: 'keyword',
  trigger_valor: 'agendar|cita|reunion|quiero agendar',
  canales: ['whatsapp'],
  estado: 'activo',
  variables_schema: {
    nombre_cliente: { tipo: 'texto', descripcion: 'Nombre del lead' },
    email_cliente: { tipo: 'email', descripcion: 'Email del lead' },
    tipo_reunion: { tipo: 'opcion', descripcion: 'Tipo de reunion preferida' }
  },
  nodos: [
    {
      id: 'node_inicio',
      tipo: 'inicio',
      posicion: { x: 250, y: 0 },
      datos: { trigger_tipo: 'keyword', trigger_valor: 'agendar|cita|reunion' }
    },
    {
      id: 'node_bienvenida',
      tipo: 'mensaje',
      posicion: { x: 250, y: 100 },
      datos: {
        texto: 'Hola! Me alegra que quieras agendar una reunion con nosotros. Primero necesito algunos datos. Como te llamas?',
        tipo_mensaje: 'texto'
      }
    },
    {
      id: 'node_pedir_nombre',
      tipo: 'pregunta',
      posicion: { x: 250, y: 200 },
      datos: {
        texto: '',
        tipo_respuesta: 'texto_libre',
        variable_destino: 'nombre_cliente',
        validacion: { requerido: true, min_largo: 2, mensaje_error: 'Por favor ingresa tu nombre (al menos 2 caracteres)' }
      }
    },
    {
      id: 'node_pedir_email',
      tipo: 'mensaje',
      posicion: { x: 250, y: 300 },
      datos: {
        texto: 'Perfecto {{nombre_cliente}}! Ahora necesito tu email para enviarte la confirmacion.',
        tipo_mensaje: 'texto'
      }
    },
    {
      id: 'node_capturar_email',
      tipo: 'pregunta',
      posicion: { x: 250, y: 400 },
      datos: {
        texto: '',
        tipo_respuesta: 'email',
        variable_destino: 'email_cliente',
        validacion: { requerido: true, mensaje_error: 'Eso no parece un email valido. Por favor ingresa un email como ejemplo@correo.com' }
      }
    },
    {
      id: 'node_tipo_reunion',
      tipo: 'mensaje',
      posicion: { x: 250, y: 500 },
      datos: {
        texto: 'Excelente! Que tipo de reunion prefieres?',
        tipo_mensaje: 'botones',
        botones: [
          { id: 'btn_presencial', texto: 'Presencial' },
          { id: 'btn_videollamada', texto: 'Videollamada' },
          { id: 'btn_telefonica', texto: 'Telefonica' }
        ]
      }
    },
    {
      id: 'node_guardar_presencial',
      tipo: 'guardar_variable',
      posicion: { x: 100, y: 600 },
      datos: { variable: 'tipo_reunion', valor: 'presencial', tipo_valor: 'literal' }
    },
    {
      id: 'node_guardar_video',
      tipo: 'guardar_variable',
      posicion: { x: 250, y: 600 },
      datos: { variable: 'tipo_reunion', valor: 'videollamada', tipo_valor: 'literal' }
    },
    {
      id: 'node_guardar_telefonica',
      tipo: 'guardar_variable',
      posicion: { x: 400, y: 600 },
      datos: { variable: 'tipo_reunion', valor: 'telefonica', tipo_valor: 'literal' }
    },
    {
      id: 'node_guardar_bd',
      tipo: 'guardar_bd',
      posicion: { x: 250, y: 700 },
      datos: {
        tabla: 'base_cuentas',
        campos: {
          categoria: 'lead',
          clave: '{{nombre_cliente}}',
          valor: 'Email: {{email_cliente}} | Reunion: {{tipo_reunion}} | Canal: {{canal}}',
          prioridad: 2
        }
      }
    },
    {
      id: 'node_crear_tarea',
      tipo: 'crear_tarea',
      posicion: { x: 250, y: 800 },
      datos: {
        titulo: 'Agendar reunion con {{nombre_cliente}}',
        descripcion: 'Lead captado por flujo WhatsApp.\nNombre: {{nombre_cliente}}\nEmail: {{email_cliente}}\nTipo: {{tipo_reunion}}\nTelefono: {{identificador_usuario}}',
        tipo: 'responder_cliente',
        prioridad: 'alta',
        asignar_a: 'auto'
      }
    },
    {
      id: 'node_despedida',
      tipo: 'fin',
      posicion: { x: 250, y: 900 },
      datos: {
        mensaje_despedida: 'Listo {{nombre_cliente}}! Un ejecutivo te contactara pronto para coordinar tu {{tipo_reunion}}. Revisa tu email {{email_cliente}} para la confirmacion. Gracias!',
        accion: 'cerrar'
      }
    }
  ],
  edges: [
    { id: 'e1', origen: 'node_inicio', destino: 'node_bienvenida', condicion: null },
    { id: 'e2', origen: 'node_bienvenida', destino: 'node_pedir_nombre', condicion: null },
    { id: 'e3', origen: 'node_pedir_nombre', destino: 'node_pedir_email', condicion: null },
    { id: 'e4', origen: 'node_pedir_email', destino: 'node_capturar_email', condicion: null },
    { id: 'e5', origen: 'node_capturar_email', destino: 'node_tipo_reunion', condicion: null },
    // Botones del tipo de reunion
    { id: 'e6a', origen: 'node_tipo_reunion', destino: 'node_guardar_presencial', condicion: { tipo: 'boton', valor: 'btn_presencial' } },
    { id: 'e6b', origen: 'node_tipo_reunion', destino: 'node_guardar_video', condicion: { tipo: 'boton', valor: 'btn_videollamada' } },
    { id: 'e6c', origen: 'node_tipo_reunion', destino: 'node_guardar_telefonica', condicion: { tipo: 'boton', valor: 'btn_telefonica' } },
    // Convergencia: todos van a guardar en BD
    { id: 'e7a', origen: 'node_guardar_presencial', destino: 'node_guardar_bd', condicion: null },
    { id: 'e7b', origen: 'node_guardar_video', destino: 'node_guardar_bd', condicion: null },
    { id: 'e7c', origen: 'node_guardar_telefonica', destino: 'node_guardar_bd', condicion: null },
    // Guardar BD → Crear tarea → Fin
    { id: 'e8', origen: 'node_guardar_bd', destino: 'node_crear_tarea', condicion: null },
    { id: 'e9', origen: 'node_crear_tarea', destino: 'node_despedida', condicion: null }
  ]
}

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const idMarca = body.id_marca || request.headers.get('x-marca-id') || auth.usuario.id_marca

    const resultado = await crearFlujo({
      ...FLUJO_EJEMPLO,
      id_marca: idMarca,
      creado_por: auth.usuario.id
    })

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      flujo: resultado.data,
      mensaje: 'Flujo de ejemplo creado. Envia "agendar" por WhatsApp para probarlo.'
    }, { status: 201 })
  } catch (error) {
    console.error('Error POST /api/flujos-seed:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
