import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { agregarDato, obtenerUsoMarca, incrementarUso, verificarOnboarding } from '@/lib/supabase'
import { puedeRealizarAccion, getMensajeLimite, LIMITES } from '@/lib/limites'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      )
    }

    const { dato } = await request.json()

    if (!dato) {
      return NextResponse.json(
        { success: false, error: 'Dato es requerido' },
        { status: 400 }
      )
    }

    const idMarca = dato['ID marca'] || auth.usuario.id_marca

    // Verificar límites del plan
    const [onboardingResult, usoResult] = await Promise.all([
      verificarOnboarding(auth.usuario.id),
      obtenerUsoMarca(idMarca)
    ])

    const plan = onboardingResult.plan || 'gratuito'
    const datosUsados = usoResult.data?.datos_usados || 0

    // Verificar si puede agregar más datos
    if (!puedeRealizarAccion(plan, 'datos', datosUsados)) {
      const limite = LIMITES[plan]?.datos || 5
      return NextResponse.json(
        {
          success: false,
          error: getMensajeLimite('datos', limite),
          limite_excedido: true,
          tipo: 'datos',
          usado: datosUsados,
          limite: limite
        },
        { status: 403 }
      )
    }

    // Asegurar que tenga ID de marca
    const datoConMarca = {
      ...dato,
      'ID marca': idMarca,
      'Nombre marca': dato['Nombre marca'] || auth.usuario.nombre_marca
    }

    const resultado = await agregarDato(datoConMarca)

    // Si se agregó exitosamente, incrementar contador de uso
    if (resultado.success) {
      await incrementarUso(idMarca, 'datos_usados')
    }

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('Error en /api/data/add:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
