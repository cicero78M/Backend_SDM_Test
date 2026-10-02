-- Memisahkan mapping jabatan Direktorat Samapta dari mapping generik
-- Direktorat lain. Mapping lama tetap aman untuk data historis, tetapi tidak
-- lagi muncul sebagai pilihan baru karena dinonaktifkan pada scope ini.

UPDATE jabatan_unit_kerja ju
SET is_active = FALSE
FROM unit_kerja u
JOIN satker s ON s.id_satker = u.id_satker
WHERE ju.id_unit = u.id_unit
  AND s.tipe_satker = 'DIREKTORAT'
  AND s.kode_satker LIKE '%_DITSAMAPTA'
  AND ju.is_active = TRUE
  AND ju.sumber <> 'legacy-assignment';

WITH jobs AS (
  SELECT id_jabatan, nama_jabatan
  FROM jabatan
  WHERE nama_jabatan IN (
    'Kepala Urusan Pembinaan Operasional (Kaurbinopsnal)',
    'Kepala Urusan Administrasi (Kaurmintu)',
    'Kepala Unit Turjawali (Kanit Turjawali)',
    'Kepala Unit Dalmas (Kanit Dalmas)',
    'Bintara Satuan Samapta',
    'Pengadministrasi Umum'
  )
), rules AS (
  -- Administrasi dan perencanaan internal Direktorat Samapta.
  SELECT j.id_jabatan, u.id_unit
  FROM unit_kerja u CROSS JOIN jobs j
  WHERE u.is_active
    AND u.kode_unit = 'BAGRENMIN'
    AND j.nama_jabatan IN ('Kepala Urusan Administrasi (Kaurmintu)', 'Pengadministrasi Umum')
  UNION ALL
  SELECT j.id_jabatan, u.id_unit
  FROM unit_kerja u CROSS JOIN jobs j
  WHERE u.is_active
    AND u.kode_unit = 'BAGBINOPSNAL'
    AND j.nama_jabatan IN ('Kepala Urusan Pembinaan Operasional (Kaurbinopsnal)', 'Pengadministrasi Umum')
  UNION ALL
  -- Unit operasional Gasum.
  SELECT j.id_jabatan, u.id_unit
  FROM unit_kerja u CROSS JOIN jobs j
  WHERE u.is_active
    AND u.kode_unit IN ('SUBDIT_GASUM', 'SUBDIT_GASUM_UNIT')
    AND j.nama_jabatan IN (
      'Kepala Unit Turjawali (Kanit Turjawali)',
      'Kepala Urusan Pembinaan Operasional (Kaurbinopsnal)',
      'Kepala Urusan Administrasi (Kaurmintu)',
      'Bintara Satuan Samapta'
    )
  UNION ALL
  -- Unit operasional Dalmas.
  SELECT j.id_jabatan, u.id_unit
  FROM unit_kerja u CROSS JOIN jobs j
  WHERE u.is_active
    AND u.kode_unit IN ('SUBDIT_DALMAS', 'SUBDIT_DALMAS_UNIT')
    AND j.nama_jabatan IN (
      'Kepala Unit Dalmas (Kanit Dalmas)',
      'Kepala Urusan Pembinaan Operasional (Kaurbinopsnal)',
      'Kepala Urusan Administrasi (Kaurmintu)',
      'Bintara Satuan Samapta'
    )
  UNION ALL
  -- Unit pendukung yang nomenklaturnya masih ada pada master lama.
  SELECT j.id_jabatan, u.id_unit
  FROM unit_kerja u CROSS JOIN jobs j
  WHERE u.is_active
    AND u.kode_unit IN ('BAGWASSIDIK', 'SIIDENT')
    AND j.nama_jabatan IN ('Bintara Satuan Samapta', 'Pengadministrasi Umum')
), scoped AS (
  SELECT r.id_jabatan, r.id_unit
  FROM rules r
  JOIN unit_kerja u ON u.id_unit = r.id_unit
  JOIN satker s ON s.id_satker = u.id_satker
  WHERE s.tipe_satker = 'DIREKTORAT'
    AND s.kode_satker LIKE '%_DITSAMAPTA'
)
INSERT INTO jabatan_unit_kerja (id_jabatan, id_unit, sumber, is_active)
SELECT id_jabatan, id_unit, 'nomenklatur-samapta-direktorat', TRUE
FROM scoped
ON CONFLICT (id_jabatan, id_unit) DO UPDATE
SET sumber = EXCLUDED.sumber, is_active = TRUE;

