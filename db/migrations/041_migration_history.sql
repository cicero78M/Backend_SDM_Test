-- Migration 041: menyimpan histori dan checksum migration yang diterapkan.
-- Runner membuat tabel ini lebih awal agar database lama dapat di-baseline
-- tanpa menjalankan ulang migration yang sudah pernah diterapkan.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id_migration BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT NOT NULL DEFAULT CURRENT_USER,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  applied_via TEXT NOT NULL DEFAULT 'runner' CHECK (applied_via IN ('runner', 'baseline'))
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON schema_migrations (applied_at DESC);
