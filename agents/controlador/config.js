/**
 * Configuración del Agente Controlador
 *
 * Responsable de:
 * - Agregar / modificar / desactivar datos de marca
 * - Consultar información estructurada
 * - Pedir confirmación antes de cambios
 * - Consultar comentarios
 */

export const config = {
  id: 'controlador',
  name: 'Controlador',
  description: 'Gestiona datos de marca en la base de datos',
  icon: '◈',
  color: '#3b82f6',  // Azul
  temperature: 0.7,
  canDelegateTo: ['chatia'],
  enabled: true,
  capabilities: [
    'Agregar datos a la marca',
    'Modificar datos existentes',
    'Desactivar registros',
    'Consultar comentarios',
    'Mostrar información en tablas',
    'Pedir confirmación antes de cambios'
  ]
}
