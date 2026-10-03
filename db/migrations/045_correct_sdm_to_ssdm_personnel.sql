-- Migration 045: koreksi typo Satker SDM menjadi SSDM POLRI.
-- Memindahkan hanya personel yang sebelumnya ditempatkan oleh migration 044.
BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM satker WHERE kode_satker = 'MABES_POLRI' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Satker induk MABES_POLRI aktif tidak ditemukan atau tidak tunggal';
  END IF;
  IF (SELECT COUNT(*) FROM satker WHERE kode_satker = 'SSDM' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Satker SSDM aktif tidak ditemukan atau tidak tunggal';
  END IF;
END $$;

WITH source_satker AS (
  SELECT id_satker FROM satker WHERE kode_satker = 'SDM' AND is_active
), target_satker AS (
  SELECT id_satker FROM satker WHERE kode_satker = 'SSDM' AND is_active
), updated AS (
  UPDATE pegawai p
  SET id_satker = target_satker.id_satker
  FROM source_satker, target_satker
  WHERE p.id_satker = source_satker.id_satker
  RETURNING p.id_pegawai
)
INSERT INTO audit_log (id_user, action, resource, resource_id, metadata)
SELECT NULL, 'UPDATE', 'personel', id_pegawai::text,
       jsonb_build_object(
         'reason', 'CORRECT_SATKER_TYPO',
         'from_kode_satker', 'SDM',
         'to_kode_satker', 'SSDM',
         'source', 'migration_045'
       )
FROM updated;

-- SDM dibuat khusus oleh migration 044 dan tidak lagi boleh tampil sebagai opsi aktif.
UPDATE satker
SET is_active = FALSE
WHERE kode_satker = 'SDM'
  AND NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.id_satker = satker.id_satker)
  AND NOT EXISTS (SELECT 1 FROM unit_kerja u WHERE u.id_satker = satker.id_satker)
  AND NOT EXISTS (SELECT 1 FROM user_scope us WHERE us.id_satker = satker.id_satker);

COMMIT;
