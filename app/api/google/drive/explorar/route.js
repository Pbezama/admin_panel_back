/**
 * API: /api/google/drive/explorar
 * POST - Explorar archivos del Drive del usuario (Sheets, Docs, PDFs, carpetas)
 */

import { NextResponse } from 'next/server'
import { verificarAutenticacion } from '@/lib/auth'
import { obtenerTokenValido, listarArchivosDrive } from '@/lib/google'

export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { conexion_id, query, folder_id, page_token, page_size } = await request.json()

    if (!conexion_id) {
      return NextResponse.json({ error: 'conexion_id es requerido' }, { status: 400 })
    }

    const { access_token } = await obtenerTokenValido(conexion_id)
    const resultado = await listarArchivosDrive(access_token, {
      query,
      folderId: folder_id,
      pageToken: page_token,
      pageSize: page_size || 20
    })

    // Mapear mimeType a tipo legible
    const archivos = (resultado.files || []).map(f => ({
      google_file_id: f.id,
      nombre: f.name,
      mime_type: f.mimeType,
      tipo: f.mimeType === 'application/vnd.google-apps.spreadsheet' ? 'sheet'
        : f.mimeType === 'application/vnd.google-apps.document' ? 'doc'
        : f.mimeType === 'application/pdf' ? 'pdf'
        : f.mimeType === 'application/vnd.google-apps.folder' ? 'folder'
        : 'otro',
      modificado: f.modifiedTime,
      url: f.webViewLink,
      icono: f.iconLink
    }))

    return NextResponse.json({
      success: true,
      archivos,
      next_page_token: resultado.nextPageToken || null
    })
  } catch (error) {
    console.error('Error POST /api/google/drive/explorar:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
