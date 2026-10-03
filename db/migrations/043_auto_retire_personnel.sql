-- Migration 043: otomatis menandai personel yang sudah melewati batas usia pensiun.
-- Idempoten dan mencatat perubahan sebagai aksi sistem pada audit log.
WITH retired AS (
  UPDATE pegawai
  SET status_pegawai = 'PENSIUN'
  WHERE tanggal_lahir IS NOT NULL
    AND tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun, 58)) <= CURRENT_DATE
    AND UPPER(TRIM(COALESCE(status_pegawai, ''))) <> 'PENSIUN'
  RETURNING id_pegawai, tanggal_lahir, batas_usia_pensiun
)
INSERT INTO audit_log (id_user, action, resource, resource_id, metadata)
SELECT NULL, 'UPDATE', 'personel', id_pegawai::text,
       jsonb_build_object(
         'reason', 'AUTO_PENSIUN',
         'tanggal_lahir', tanggal_lahir,
         'batas_usia_pensiun', COALESCE(batas_usia_pensiun, 58),
         'source', 'migration_043'
       )
FROM retired;
