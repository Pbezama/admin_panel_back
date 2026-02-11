import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerEstadoUsuario, buscarMarcaPorNombre } from '@/lib/supabase'

// URL de Facebook OAuth para conexión
const PYTHONANYWHERE_CONNECT_URL = 'https://www.facebook.com/v17.0/dialog/oauth?client_id=1321111752593392&redirect_uri=https%3A%2F%2Fmrkt21-pbezama.pythonanywhere.com%2Fcomentarios%2Ffacebook_callback&scope=public_profile%2Cpages_show_list%2Cbusiness_management%2Cpages_read_engagement%2Cpages_read_user_content%2Cpages_manage_engagement%2Cpages_manage_metadata%2Cpages_messaging%2Cpages_manage_posts%2Cinstagram_basic%2Cinstagram_manage_comments%2Cinstagram_manage_messages&state=5'

/**
 * GET /api/onboarding/status
 * Obtiene el estado de onboarding y límites del usuario
 * También busca si ya existe una conexión en base_cuentas por nombre de marca
 *
 * Headers:
 * - Authorization: Bearer <token>
 *
 * Response:
 * {
 *   success: true,
 *   onboarding_completado: boolean,
 *   requiere_onboarding: boolean,
 *   tiene_facebook: boolean,
 *   plan: string,
 *   uso: { comentarios_usados, datos_usados, tareas_usadas },
 *   // Nuevos campos para conexión via PythonAnywhere
 *   conexion_encontrada: boolean,
 *   id_marca_encontrada: string | null,
 *   nombre_marca_encontrada: string | null,
 *   requiere_conexion: boolean,
 *   pythonanywhere_url: string
 * }
 */
export async function GET(request) {
  try {
    // Verificar autenticación
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const usuario = auth.usuario

    // Obtener estado completo
    const estado = await obtenerEstadoUsuario(usuario.id, usuario.id_marca)

    if (!estado.success) {
      return NextResponse.json(
        { success: false, error: estado.error || 'Error al obtener estado' },
        { status: 500 }
      )
    }

    // Si el onboarding ya está completado, devolver el estado normal
    if (estado.onboarding_completado) {
      return NextResponse.json({
        success: true,
        onboarding_completado: true,
        requiere_onboarding: false,
        tiene_facebook: estado.tiene_facebook,
        cuentas_facebook: estado.cuentas_facebook,
        plan: estado.plan,
        uso: estado.uso,
        conexion_encontrada: true,
        requiere_conexion: false
      })
    }

    // Si no está completado, buscar por nombre de marca en base_cuentas
    const busqueda = await buscarMarcaPorNombre(usuario.nombre_marca)

    return NextResponse.json({
      success: true,
      onboarding_completado: false,
      requiere_onboarding: true,
      tiene_facebook: estado.tiene_facebook,
      cuentas_facebook: estado.cuentas_facebook,
      plan: estado.plan,
      uso: estado.uso,
      // Datos de conexión via PythonAnywhere
      conexion_encontrada: busqueda.exists,
      id_marca_encontrada: busqueda.id_marca || null,
      nombre_marca_encontrada: busqueda.nombre || null,
      requiere_conexion: !busqueda.exists,
      pythonanywhere_url: PYTHONANYWHERE_CONNECT_URL,
      nombre_marca_usuario: usuario.nombre_marca
    })

  } catch (error) {
    console.error('Error en GET /api/onboarding/status:', error)
    return NextResponse.json(
      { success: false, error: 'Error al verificar estado de onboarding' },
      { status: 500 }
    )
  }
}
