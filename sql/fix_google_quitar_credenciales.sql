-- ============================================
-- FIX: Quitar columnas de credenciales de google_conexiones
-- Las credenciales OAuth son globales de CreceTec (env vars)
-- El cliente NO necesita ingresar Client ID/Secret
-- Fecha: 2026-03-10
-- ============================================

ALTER TABLE google_conexiones DROP COLUMN IF EXISTS google_client_id;
ALTER TABLE google_conexiones DROP COLUMN IF EXISTS google_client_secret;
