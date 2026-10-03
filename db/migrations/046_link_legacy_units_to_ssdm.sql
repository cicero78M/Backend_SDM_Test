-- Migration 046: mengaitkan unit legacy yang dipakai personel SSDM ke Satker SSDM POLRI.
-- Hanya unit tanpa Satker yang sedang dipakai personel pada SSDM yang disentuh.
BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM satker WHERE kode_satker = 'SSDM' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Satker SSDM aktif tidak ditemukan atau tidak tunggal';
  END IF;
END $$;

WITH target_satker AS (
  SELECT id_satker FROM satker WHERE kode_satker = 'SSDM' AND is_active
), target_units AS (
  SELECT DISTINCT u.id_unit
  FROM unit_kerja u
  JOIN pegawai p ON p.id_unit = u.id_unit
  WHERE u.id_satker IS NULL
    AND p.id_satker = (SELECT id_satker FROM target_satker)
), updated AS (
  UPDATE unit_kerja u
  SET id_satker = (SELECT id_satker FROM target_satker)
  FROM target_units t
  WHERE u.id_unit = t.id_unit
  RETURNING u.id_unit, u.nama_unit
)
INSERT INTO audit_log (id_user, action, resource, resource_id, metadata)
SELECT NULL, 'UPDATE', 'unit_kerja', id_unit::text,
       jsonb_build_object(
         'reason', 'ASSIGN_LEGACY_UNIT_TO_SSDM',
         'kode_satker', 'SSDM',
         'source', 'migration_046',
         'nama_unit', nama_unit
       )
FROM updated;

COMMIT;
