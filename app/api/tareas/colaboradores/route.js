import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerUsuariosAsignables } from '@/lib/supabase'

// GET /api/tareas/colaboradores - Obtener lista de usuarios asignables
// Super admin: todos los usuarios activos de todas las marcas
// Admin: todos los usuarios activos de su marca (admins + colaboradores)
export async function GET(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    // Solo admins pueden ver la lista
    if (auth.usuario.tipo_usuario === 'colaborador') {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para ver colaboradores' },
        { status: 403 }
      )
    }

    const esSuperAdmin = auth.usuario.es_super_admin === true
    const resultado = await obtenerUsuariosAsignables(auth.usuario.id_marca, esSuperAdmin)
    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en GET /api/tareas/colaboradores:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
