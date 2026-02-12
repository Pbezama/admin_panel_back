/**
 * Ejecutor: Nodo Guardar en BD
 * Escribe datos en base_cuentas u otra tabla.
 * Auto-ejecutable.
 */

import { interpolarVariables } from '../flowEngine'
import { supabase } from '@/lib/supabase'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true }
 */
export async function ejecutarGuardarBd(nodo, contexto) {
  const { conversacion } = contexto
  const datos = nodo.datos || {}
  const tabla = datos.tabla || 'base_cuentas'
  const campos = datos.campos || {}

  // Interpolar variables en cada campo
  const camposInterpolados = {}
  for (const [clave, valor] of Object.entries(campos)) {
    camposInterpolados[clave] = typeof valor === 'string'
      ? interpolarVariables(valor, conversacion.variables)
      : valor
  }

  try {
    if (tabla === 'base_cuentas') {
      // Usar formato de base_cuentas
      const { error } = await supabase
        .from('base_cuentas')
        .insert({
          'ID marca': conversacion.id_marca,
          'Categoría': camposInterpolados.categoria || 'lead',
          clave: camposInterpolados.clave || 'dato_flujo',
          valor: camposInterpolados.valor || '',
          prioridad: camposInterpolados.prioridad || 3,
          Estado: true,
          creado_en: new Date().toISOString()
        })

      if (error) throw error
    } else {
      // Tabla generica
      const { error } = await supabase
        .from(tabla)
        .insert({
          ...camposInterpolados,
          id_marca: conversacion.id_marca
        })

      if (error) throw error
    }

    console.log(`   💾 Dato guardado en ${tabla}`)
    return { continuar: true }
  } catch (error) {
    console.error(`Error guardando en ${tabla}:`, error)
    return { continuar: true }
  }
}
