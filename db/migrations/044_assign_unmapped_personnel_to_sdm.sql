-- Migration 044: menempatkan personel tanpa Satker ke Satker SDM di bawah MABES POLRI.
-- Idempoten: tidak mengubah personel yang sudah memiliki Satker.
BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM satker WHERE kode_satker = 'MABES_POLRI' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Satker induk MABES_POLRI aktif tidak ditemukan atau tidak tunggal';
  END IF;
END $$;

INSERT INTO satker (kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active)
SELECT 'SDM', 'SDM', 'SATKER_MABES', id_satker, TRUE
FROM satker
WHERE kode_satker = 'MABES_POLRI' AND is_active
ON CONFLICT (kode_satker) DO UPDATE
SET nama_satker = EXCLUDED.nama_satker,
    tipe_satker = EXCLUDED.tipe_satker,
    id_satker_induk = EXCLUDED.id_satker_induk,
    is_active = TRUE,
    updated_at = NOW();

WITH target AS (
  SELECT id_satker
  FROM satker
  WHERE kode_satker = 'SDM' AND is_active
), updated AS (
  UPDATE pegawai p
  SET id_satker = target.id_satker
  FROM target
  WHERE p.id_satker IS NULL
  RETURNING p.id_pegawai, p.id_satker
)
INSERT INTO audit_log (id_user, action, resource, resource_id, metadata)
SELECT NULL, 'UPDATE', 'personel', id_pegawai::text,
       jsonb_build_object(
         'reason', 'ASSIGN_UNMAPPED_SATKER',
         'kode_satker', 'SDM',
         'source', 'migration_044'
       )
FROM updated;

COMMIT;
