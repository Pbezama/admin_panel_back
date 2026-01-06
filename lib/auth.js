import { SignJWT, jwtVerify } from 'jose'

// Función para obtener el secret (se llama en cada uso para evitar problemas de hot-reload)
function getSecret() {
  const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_in_production'
  return new TextEncoder().encode(JWT_SECRET)
}

// Crear token JWT
export async function crearToken(usuario) {
  try {
    const secret = getSecret()
    const token = await new SignJWT({
      id: usuario.id,
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      id_marca: usuario.id_marca,
      nombre_marca: usuario.nombre_marca,
      es_super_admin: usuario.es_super_admin
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret)

    return { success: true, token }
  } catch (error) {
    console.error('Error al crear token:', error)
    return { success: false, error: 'Error al crear token' }
  }
}

// Verificar token JWT
export async function verificarToken(token) {
  try {
    const secret = getSecret()
    const { payload } = await jwtVerify(token, secret)
    return {
      success: true,
      usuario: {
        id: payload.id,
        usuario: payload.usuario,
        nombre: payload.nombre,
        id_marca: payload.id_marca,
        nombre_marca: payload.nombre_marca,
        es_super_admin: payload.es_super_admin
      }
    }
  } catch (error) {
    console.error('Error al verificar token:', error)
    return { success: false, error: 'Token inválido o expirado' }
  }
}

// Extraer token del header Authorization
export function extraerToken(request) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    return null
  }

  // Formato: "Bearer <token>"
  const parts = authHeader.split(' ')

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

// Middleware helper para verificar autenticación
export async function verificarAutenticacion(request) {
  const token = extraerToken(request)

  if (!token) {
    return {
      autenticado: false,
      error: 'No se proporcionó token de autenticación'
    }
  }

  const resultado = await verificarToken(token)

  if (!resultado.success) {
    return {
      autenticado: false,
      error: resultado.error
    }
  }

  return {
    autenticado: true,
    usuario: resultado.usuario
  }
}
