-- Riwayat jabatan memakai unsur/unit organisasi, bukan fungsi legacy.
ALTER TABLE riwayat_jabatan
  ADD COLUMN IF NOT EXISTS id_unit INTEGER REFERENCES unit_kerja (id_unit);

CREATE INDEX IF NOT EXISTS ix_riwayat_jabatan_unit
  ON riwayat_jabatan (id_unit);
