/**
 * API: /api/google/documentos/leer
 * POST - Leer contenido de un Google Doc o PDF desde Drive
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { obtenerTokenValido, leerGoogleDoc, leerPdfDrive, registrarOperacionGoogle } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idMarca = request.headers.get('x-marca-id') || auth.usuario.id_marca
    const { archivo_id } = await request.json()

    if (!archivo_id) {
      return NextResponse.json({ error: 'archivo_id es requerido' }, { status: 400 })
    }

    const { data: archivo } = await supabase
      .from('google_archivos')
      .select('id, google_file_id, id_conexion, tipo_archivo, nombre_archivo')
      .eq('id', archivo_id)
      .eq('id_marca', idMarca)
      .limit(1)
      .single()

    if (!archivo) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    if (archivo.tipo_archivo !== 'doc' && archivo.tipo_archivo !== 'pdf') {
      return NextResponse.json({ error: 'Este endpoint es para Google Docs y PDFs. Para Sheets use /api/google/sheets/leer' }, { status: 400 })
    }

    const inicio = Date.now()
    const { access_token } = await obtenerTokenValido(archivo.id_conexion)

    let contenido = ''

    if (archivo.tipo_archivo === 'doc') {
      contenido = await leerGoogleDoc(access_token, archivo.google_file_id)
    } else if (archivo.tipo_archivo === 'pdf') {
      // Descargar PDF y extraer texto
      const pdfBuffer = await leerPdfDrive(access_token, archivo.google_file_id)
      try {
        const pdfParse = (await import('pdf-parse')).default
        const pdfData = await pdfParse(Buffer.from(pdfBuffer))
        contenido = pdfData.text
      } catch (e) {
        contenido = '[No se pudo extraer texto del PDF. El archivo puede estar protegido o ser un PDF de imagen.]'
      }
    }

    await supabase.from('google_archivos').update({
      ultimo_acceso: new Date().toISOString()
    }).eq('id', archivo.id)

    await registrarOperacionGoogle({
      idMarca, idConexion: archivo.id_conexion, idArchivo: archivo.id,
      operacion: 'leer_documento', origen: 'manual',
      datosRequest: { tipo: archivo.tipo_archivo },
      exito: true, duracionMs: Date.now() - inicio
    })

    return NextResponse.json({
      success: true,
      nombre: archivo.nombre_archivo,
      tipo: archivo.tipo_archivo,
      contenido,
      caracteres: contenido.length
    })
  } catch (error) {
    console.error('Error POST /api/google/documentos/leer:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
