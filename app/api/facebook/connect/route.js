import { NextResponse } from 'next/server'
import { buildOAuthUrl, encodeState } from '@/lib/facebook'

/**
 * GET /api/facebook/connect
 * Inicia el flujo OAuth con Facebook
 *
 * Query params:
 * - user_id: ID del usuario de Crecetec
 * - marca_id: ID de la marca
 * - callback_url: URL del frontend para postMessage
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const marcaId = searchParams.get('marca_id')
    const callbackUrl = searchParams.get('callback_url')

    // Validar parámetros requeridos
    if (!userId || !marcaId) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos (user_id, marca_id)' },
        { status: 400 }
      )
    }

    // Verificar que las variables de entorno estén configuradas
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      console.error('Facebook App credentials not configured')
      return NextResponse.json(
        { error: 'Configuración de Facebook no disponible' },
        { status: 500 }
      )
    }

    // Codificar el state con la información del usuario
    const state = encodeState(
      parseInt(userId),
      parseInt(marcaId),
      callbackUrl || process.env.FRONTEND_URL || 'http://localhost:3002'
    )

    // Construir URL de OAuth
    const oauthUrl = buildOAuthUrl(state)

    // Redirigir a Facebook
    return NextResponse.redirect(oauthUrl)
  } catch (error) {
    console.error('Error en /api/facebook/connect:', error)
    return NextResponse.json(
      { error: 'Error al iniciar conexión con Facebook' },
      { status: 500 }
    )
  }
}
