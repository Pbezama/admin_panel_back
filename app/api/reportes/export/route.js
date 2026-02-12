import { NextResponse } from 'next/server'
import { verificarAutenticacion, esAdmin } from '@/lib/auth'
import { queryReporte, exportarCSV, exportarExcel, exportarPDF, TIPOS_REPORTE } from '@/lib/reportes'

/**
 * POST /api/reportes/export
 * Exporta datos en formato CSV, Excel o PDF
 * Body: { tipo, filtros, formato: 'csv'|'excel'|'pdf' }
 */
export async function POST(request) {
  try {
    const auth = await verificarAutenticacion(request)
    if (!auth.autenticado) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { tipo, filtros = {}, formato } = body

    if (!tipo || !formato) {
      return NextResponse.json(
        { success: false, error: 'Tipo y formato son requeridos' },
        { status: 400 }
      )
    }

    const config = TIPOS_REPORTE[tipo]
    if (!config) {
      return NextResponse.json({ success: false, error: 'Tipo no valido' }, { status: 400 })
    }

    if (config.adminOnly && !esAdmin(auth.usuario)) {
      return NextResponse.json({ success: false, error: 'Permisos insuficientes' }, { status: 403 })
    }

    if (!['csv', 'excel', 'pdf'].includes(formato)) {
      return NextResponse.json({ success: false, error: 'Formato no valido (csv, excel, pdf)' }, { status: 400 })
    }

    const idMarca = auth.usuario.id_marca
    const nombreMarca = auth.usuario.nombre_marca || 'Marca'

    // Query all data (no limit for export)
    const exportFiltros = { ...filtros, limite: 10000 }
    const resultado = await queryReporte(tipo, exportFiltros, idMarca)

    if (!resultado.success) {
      return NextResponse.json(resultado, { status: 500 })
    }

    const { data, columnas } = resultado
    const fechaStr = new Date().toISOString().split('T')[0]
    const nombreArchivo = `reporte_${tipo}_${fechaStr}`

    switch (formato) {
      case 'csv': {
        const csv = exportarCSV(data, columnas)
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${nombreArchivo}.csv"`
          }
        })
      }

      case 'excel': {
        const buffer = exportarExcel(data, columnas, config.label)
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${nombreArchivo}.xlsx"`
          }
        })
      }

      case 'pdf': {
        const buffer = await exportarPDF(data, columnas, `Reporte: ${config.label}`, nombreMarca)
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${nombreArchivo}.pdf"`
          }
        })
      }
    }
  } catch (error) {
    console.error('Error en POST /api/reportes/export:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}
