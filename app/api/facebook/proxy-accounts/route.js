import { NextResponse } from 'next/server'
import { verificarToken } from '@/lib/auth'

/**
 * GET /api/facebook/proxy-accounts
 * Proxy para obtener cuentas desde PythonAnywhere (evita CORS)
 */
export async function GET(request) {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const tokenResult = await verificarToken(token)

    if (!tokenResult.valid) {
      return NextResponse.json(
        { success: false, error: 'Token inválido' },
        { status: 401 }
      )
    }

    const usuario = tokenResult.usuario

    // Obtener cuentas desde PythonAnywhere
    const pythonAnywhereUrl = `https://www.mrkt21.com/comentarios/accounts/API/?crecetec_user_id=${usuario.id}&crecetec_marca_id=${usuario.id_marca}`

    const response = await fetch(pythonAnywhereUrl)
    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error en proxy-accounts:', error)
    return NextResponse.json(
      { success: false, error: 'Error al obtener cuentas', accounts: [] },
      { status: 500 }
    )
  }
}
