-- Migración custom: extensiones e índices que drizzle-kit no puede expresar.

-- unaccent: búsqueda de catálogo insensible a acentos ("cafe" encuentra "café").
CREATE EXTENSION IF NOT EXISTS unaccent;

-- BRIN sobre analytics_events.created_at: índice mínimo (KB) ideal para una
-- tabla append-only ordenada por tiempo; acelera rollups y purga por rango.
CREATE INDEX IF NOT EXISTS "analytics_events_created_brin_idx"
  ON "analytics_events" USING brin ("created_at");
