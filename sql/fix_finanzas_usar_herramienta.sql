-- =====================================================
-- FIX: Forzar que Javier use buscarEstadoCuentaPorRut
-- en vez de dar URLs estáticas para consultas de deuda.
-- =====================================================

-- 1. Reemplazar seccion FINANZAS en consideraciones
--    Usamos regexp_replace para ser más flexibles con whitespace
UPDATE chat_academico_config
SET
  prompt_consideraciones = regexp_replace(
    prompt_consideraciones,
    '## FINANZAS Y PAGOS.*?(?=\n## |\Z)',
    '## FINANZAS Y PAGOS
- **Revisar estado de cuenta / cuanto debe**: SIEMPRE usa la herramienta buscarEstadoCuentaPorRut pidiendo el RUT del alumno. NO des links estaticos. La herramienta consulta el sistema PreUCV Pay en tiempo real y devuelve el monto exacto + link de pago personalizado.
- **Donde pagar**: El link de pago se genera automaticamente con la herramienta. Solo como alternativa de respaldo: https://www.preucv.cl/ o Pago Express: https://preucv.equipoweb.cl/pago-express
- **Problemas para pagar**: Si la herramienta falla o el cliente tiene problemas con el pago, derivar a ejecutiva de Cobranza (horario 9:00-19:00 L-V).
- **Comprobantes de pago**: Este canal NO esta habilitado, derivar a ejecutiva.
- Imagen Pago Express: https://imgur.com/a/pago-express-preucv-GyBE4IL
- IMPORTANTE: Aunque tengas datos del alumno por Google Sheets, NUNCA asumas que no tiene deuda. Solo buscarEstadoCuentaPorRut tiene la informacion real de montos. Google Sheets NO tiene datos financieros confiables.
',
    'ns'
  ),
  actualizado_en = NOW(),
  actualizado_por = 'fix_finanzas_herramienta'
WHERE id_marca = 17841402405921340;

-- 2. Verificar que se actualizo correctamente
SELECT
  CASE
    WHEN prompt_consideraciones LIKE '%SIEMPRE usa la herramienta buscarEstadoCuentaPorRut%'
    THEN '✅ FINANZAS actualizado correctamente'
    ELSE '❌ REPLACE no funciono - verificar manualmente'
  END AS resultado,
  SUBSTRING(prompt_consideraciones FROM '## FINANZAS Y PAGOS.*') AS seccion_finanzas
FROM chat_academico_config
WHERE id_marca = 17841402405921340;
