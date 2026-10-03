-- Migration 048: mengisi Satker SSDM POLRI pada staging yang masih kosong.
-- Hanya baris staging tanpa kode_satker yang disentuh; tidak mempromosikan data.
BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM satker WHERE kode_satker = 'SSDM' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Satker SSDM aktif tidak ditemukan atau tidak tunggal';
  END IF;
END $$;

WITH updated AS (
  UPDATE staging_pegawai
  SET kode_satker = 'SSDM'
  WHERE NULLIF(BTRIM(kode_satker), '') IS NULL
  RETURNING nip, nik, nama
)
INSERT INTO audit_log (id_user, action, resource, resource_id, metadata)
SELECT NULL, 'UPDATE', 'staging_pegawai', COALESCE(nip, nik, nama, 'tanpa-identitas'),
       jsonb_build_object(
         'reason', 'ASSIGN_STAGING_SATKER',
         'kode_satker', 'SSDM',
         'source', 'migration_048'
       )
FROM updated;

WITH duplicate_nips AS (
  SELECT regexp_replace(BTRIM(nip), '[^0-9]', '', 'g') AS nip_norm
  FROM staging_pegawai
  WHERE NULLIF(BTRIM(nip), '') IS NOT NULL
  GROUP BY regexp_replace(BTRIM(nip), '[^0-9]', '', 'g')
  HAVING COUNT(*) > 1
), assessed AS (
  SELECT st.ctid,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN NULLIF(BTRIM(st.nip), '') IS NULL THEN 'NIP kosong'
           WHEN BTRIM(st.nip) !~ '^[0-9]{18}$' THEN 'NIP bukan 18 digit angka' END,
      CASE WHEN NULLIF(BTRIM(st.nik), '') IS NULL THEN 'NIK kosong'
           WHEN BTRIM(st.nik) !~ '^[0-9]{16}$' THEN 'NIK bukan 16 digit angka' END,
      CASE WHEN NULLIF(BTRIM(st.nama), '') IS NULL THEN 'Nama kosong' END,
      CASE WHEN NULLIF(BTRIM(st.tanggal_lahir), '') IS NULL THEN 'Tanggal lahir kosong'
           WHEN BTRIM(st.tanggal_lahir) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'Tanggal lahir format salah' END,
      CASE WHEN NULLIF(BTRIM(st.tanggal_masuk), '') IS NULL THEN 'Tanggal masuk kosong'
           WHEN BTRIM(st.tanggal_masuk) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'Tanggal masuk format salah' END,
      CASE WHEN NULLIF(BTRIM(st.kode_satker), '') IS NULL THEN 'Satker kosong'
           WHEN NOT EXISTS (SELECT 1 FROM satker s WHERE s.kode_satker=BTRIM(st.kode_satker) AND s.is_active)
             THEN 'Satker tidak ada di master' END,
      CASE WHEN NULLIF(BTRIM(st.kode_unit), '') IS NULL THEN 'Kode unit kosong'
           WHEN NOT EXISTS (SELECT 1 FROM unit_kerja u WHERE u.id_unit::text=BTRIM(st.kode_unit) AND u.is_active)
             THEN 'Kode unit tidak ada di master' END,
      CASE WHEN NULLIF(BTRIM(st.golongan), '') IS NULL THEN 'Golongan kosong'
           WHEN NOT EXISTS (SELECT 1 FROM golongan g WHERE g.kode_golongan=BTRIM(st.golongan))
             THEN 'Golongan tidak ada di master' END,
      CASE WHEN d.nip_norm IS NOT NULL THEN 'NIP duplikat di staging' END
    ], NULL) AS masalah
  FROM staging_pegawai st
  LEFT JOIN duplicate_nips d
    ON d.nip_norm=regexp_replace(BTRIM(st.nip), '[^0-9]', '', 'g')
), updated AS (
  UPDATE staging_pegawai st
  SET masalah=to_jsonb(a.masalah),
      status_validasi=CASE WHEN cardinality(a.masalah)=0 THEN 'VALID' ELSE 'TINDAK_LANJUT' END
  FROM assessed a
  WHERE st.ctid=a.ctid
  RETURNING st.status_validasi
)
INSERT INTO audit_log (id_user, action, resource, resource_id, metadata)
SELECT NULL, 'UPDATE', 'staging_pegawai', 'validation',
       jsonb_build_object(
         'reason', 'REVALIDATE_STAGING_AFTER_SATKER',
         'total', COUNT(*),
         'valid', COUNT(*) FILTER (WHERE status_validasi='VALID'),
         'tindak_lanjut', COUNT(*) FILTER (WHERE status_validasi='TINDAK_LANJUT'),
         'source', 'migration_048'
       )
FROM updated;

COMMIT;
