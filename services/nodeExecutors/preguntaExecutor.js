/**
 * Ejecutor: Nodo Pregunta
 * Envia una pregunta al usuario y espera su respuesta.
 * Valida la respuesta segun el tipo esperado.
 */

import { interpolarVariables } from '../flowEngine'

const VALIDACIONES = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  telefono: (v) => /^[\d+\-\s()]{7,20}$/.test(v),
  numero: (v) => !isNaN(Number(v)),
  fecha: (v) => !isNaN(Date.parse(v))
}

/**
 * Ejecutar nodo pregunta - primera vez (enviar pregunta)
 */
export async function ejecutarPregunta(nodo, contexto) {
  const { adapter, conversacion } = contexto
  const datos = nodo.datos || {}
  const texto = interpolarVariables(datos.texto || '', conversacion.variables)

  // Si hay opciones multiples, enviar como botones
  if (datos.tipo_respuesta === 'opcion_multiple' && datos.opciones?.length > 0) {
    const botones = datos.opciones.map((op, i) => ({
      id: `opt_${i}`,
      texto: op
    }))
    await adapter.enviarBotones(texto, botones)
  } else {
    await adapter.enviarTexto(texto)
  }

  return { continuar: false, esperarInput: true }
}

/**
 * Procesar la respuesta del usuario a una pregunta
 * @returns {{ valido: boolean, valor: string, error?: string }}
 */
export function procesarRespuestaPregunta(nodo, mensaje) {
  const datos = nodo.datos || {}
  const tipo = datos.tipo_respuesta || 'texto_libre'
  const validacion = datos.validacion || {}
  const valor = mensaje.trim()

  // Validar requerido
  if (validacion.requerido && !valor) {
    return {
      valido: false,
      valor,
      error: validacion.mensaje_error || 'Este campo es requerido'
    }
  }

  // Validar largo minimo
  if (validacion.min_largo && valor.length < validacion.min_largo) {
    return {
      valido: false,
      valor,
      error: validacion.mensaje_error || `Debe tener al menos ${validacion.min_largo} caracteres`
    }
  }

  // Validar tipo especifico
  if (tipo !== 'texto_libre' && tipo !== 'opcion_multiple' && VALIDACIONES[tipo]) {
    if (!VALIDACIONES[tipo](valor)) {
      const mensajesError = {
        email: 'Por favor ingresa un email valido',
        telefono: 'Por favor ingresa un numero de telefono valido',
        numero: 'Por favor ingresa un numero valido',
        fecha: 'Por favor ingresa una fecha valida'
      }
      return {
        valido: false,
        valor,
        error: validacion.mensaje_error || mensajesError[tipo]
      }
    }
  }

  return { valido: true, valor }
}
