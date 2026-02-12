/**
 * Ejecutor: Nodo Agendar Cita
 * Crea un evento en Google Calendar usando los tokens de la marca.
 * Auto-ejecutable: no espera input del usuario.
 */

import { interpolarVariables } from '../flowEngine'
import { obtenerTokenGoogleCalendar, guardarTokenGoogleCalendar, guardarCita } from '@/lib/supabase'
import { crearEventoCalendar, refreshGoogleToken } from '@/lib/google'

/**
 * @param {object} nodo - Nodo actual
 * @param {object} contexto - { conversacion, canal, mensaje, adapter }
 * @returns {object} { continuar: true, variablesActualizadas }
 */
export async function ejecutarAgendarCita(nodo, contexto) {
  const { conversacion, adapter } = contexto
  const datos = nodo.datos || {}
  const vars = conversacion.variables || {}

  const titulo = interpolarVariables(datos.titulo || 'Cita agendada', vars)
  const descripcion = interpolarVariables(datos.descripcion || '', vars)
  const duracion = datos.duracion_minutos || 30

  // Leer fecha y hora de las variables del flujo
  const fechaCita = vars.fecha_cita
  const horaCita = vars.hora_cita

  if (!fechaCita || !horaCita) {
    console.log('   📅 Agendar cita: falta fecha_cita u hora_cita en variables')
    return {
      continuar: true,
      variablesActualizadas: { cita_confirmada: false, cita_error: 'Falta fecha u hora' }
    }
  }

  try {
    // Obtener tokens de Google Calendar para esta marca
    const tokenResult = await obtenerTokenGoogleCalendar(conversacion.id_marca)
    if (!tokenResult.success || !tokenResult.data) {
      console.log('   📅 Agendar cita: Google Calendar no conectado para esta marca')
      return {
        continuar: true,
        variablesActualizadas: { cita_confirmada: false, cita_error: 'Calendar no conectado' }
      }
    }

    let token = tokenResult.data
    let accessToken = token.access_token

    // Refrescar token si esta expirado
    if (token.token_expires_at && new Date(token.token_expires_at) < new Date()) {
      console.log('   📅 Refrescando token de Google Calendar...')
      const refreshed = await refreshGoogleToken(token.refresh_token)
      accessToken = refreshed.access_token

      await guardarTokenGoogleCalendar({
        id_marca: conversacion.id_marca,
        access_token: refreshed.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: new Date(Date.now() + (refreshed.expires_in * 1000)).toISOString()
      })
    }

    // Construir fechas del evento
    const fechaInicio = new Date(`${fechaCita}T${horaCita}:00`)
    const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000)

    const attendees = []
    if (vars.email_cliente) {
      attendees.push({ email: vars.email_cliente })
    }

    // Crear evento en Google Calendar
    const evento = await crearEventoCalendar(accessToken, token.calendar_id || 'primary', {
      titulo,
      descripcion: `${descripcion}\nCanal: ${conversacion.canal}\nTelefono: ${vars.identificador_usuario || conversacion.identificador_usuario || ''}`,
      fechaInicio: fechaInicio.toISOString(),
      fechaFin: fechaFin.toISOString(),
      attendees
    })

    // Guardar cita en BD
    await guardarCita({
      id_marca: conversacion.id_marca,
      conversacion_id: conversacion.id,
      google_event_id: evento.id,
      titulo,
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
      nombre_cliente: vars.nombre_cliente || null,
      email_cliente: vars.email_cliente || null,
      telefono_cliente: vars.telefono_cliente || conversacion.identificador_usuario || null,
      canal_origen: conversacion.canal,
      metadata: { htmlLink: evento.htmlLink }
    })

    console.log(`   📅 Cita creada en Google Calendar: ${evento.id}`)

    return {
      continuar: true,
      variablesActualizadas: {
        cita_confirmada: true,
        cita_id: evento.id,
        link_cita: evento.htmlLink || '',
        fecha_cita_formateada: fechaInicio.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
        hora_cita_formateada: fechaInicio.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
      }
    }
  } catch (error) {
    console.error('   📅 Error al agendar cita:', error.message)
    return {
      continuar: true,
      variablesActualizadas: { cita_confirmada: false, cita_error: error.message }
    }
  }
}
