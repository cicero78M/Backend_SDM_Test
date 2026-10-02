-- Mempersempit mapping jabatan pada seluruh Direktorat non-Samapta.
-- Migrasi 026 membuka 13 jabatan generik pada semua child Unit. Di sini
-- mapping itu ditutup dan dibentuk ulang berdasarkan nomenklatur/fungsi unit.

UPDATE jabatan_unit_kerja ju
SET is_active = FALSE
FROM unit_kerja u
JOIN satker s ON s.id_satker = u.id_satker
WHERE ju.id_unit = u.id_unit
  AND s.tipe_satker = 'DIREKTORAT'
  AND s.kode_satker NOT LIKE '%_DITSAMAPTA'
  AND ju.is_active = TRUE
  AND ju.sumber <> 'legacy-assignment';

WITH scoped AS (
  SELECT u.id_unit, u.kode_unit, u.nama_unit, u.tipe_unit,
         (u.kode_unit || ' ' || u.nama_unit) AS fungsi_unit
  FROM unit_kerja u
  JOIN satker s ON s.id_satker = u.id_satker
  WHERE u.is_active
    AND s.tipe_satker = 'DIREKTORAT'
    AND s.kode_satker NOT LIKE '%_DITSAMAPTA'
), rules AS (
  -- Setiap unit daun memiliki minimal satu unsur pelaksana yang umum.
  SELECT 12::integer AS id_jabatan, id_unit
  FROM scoped s
  WHERE NOT EXISTS (SELECT 1 FROM unit_kerja child WHERE child.id_unit_induk=s.id_unit AND child.is_active)
  UNION ALL
  -- Fungsi SDM/kepegawaian.
  SELECT j.id_jabatan, s.id_unit
  FROM scoped s CROSS JOIN jabatan j
  WHERE s.fungsi_unit ~* '(SDM|PERSONEL|KEPEGAWAIAN|PEGAWAI|BINKAR|PEMBINAAN KARIER)'
    AND j.id_jabatan IN (4,5,6,11,14)
  UNION ALL
  -- Fungsi TIK, data, komunikasi, dan sistem informasi.
  SELECT j.id_jabatan, s.id_unit
  FROM scoped s CROSS JOIN jabatan j
  WHERE s.fungsi_unit ~* '(TIK|TEKNOLOGI|INFORMASI|KOMPUTER|SIBER|CYBER|SANDI|DATA|MULTIMEDIA|KOMUNIKASI)'
    AND j.id_jabatan IN (7,8,13)
  UNION ALL
  -- Fungsi arsip, tata usaha, administrasi, dan dokumentasi.
  SELECT j.id_jabatan, s.id_unit
  FROM scoped s CROSS JOIN jabatan j
  WHERE s.fungsi_unit ~* '(ARSIP|ADMIN|TAUD|RENMIN|SEKRETARIAT|DOKUMEN|TATA USAHA)'
    AND j.id_jabatan IN (9,10,11)
  UNION ALL
  -- Fungsi keuangan dan logistik.
  SELECT j.id_jabatan, s.id_unit
  FROM scoped s CROSS JOIN jabatan j
  WHERE s.fungsi_unit ~* '(KEU|KEUANGAN|ANGGARAN|BENDAHARA|LOGISTIK|BEKALAN|SARPRAS)'
    AND j.id_jabatan IN (15,16)
  UNION ALL
  -- Jabatan struktural hanya pada tipe Unit yang bersesuaian.
  SELECT 1, id_unit FROM scoped WHERE tipe_unit IN ('BAGIAN','BIRO','SEKRETARIAT')
  UNION ALL
  SELECT 2, id_unit FROM scoped WHERE tipe_unit IN ('SUBBAGIAN','SUBSEKSI')
  UNION ALL
  SELECT 3, id_unit FROM scoped WHERE tipe_unit = 'BIDANG'
)
INSERT INTO jabatan_unit_kerja (id_jabatan, id_unit, sumber, is_active)
SELECT DISTINCT id_jabatan, id_unit, 'nomenklatur-direktorat-refined', TRUE
FROM rules
ON CONFLICT (id_jabatan, id_unit) DO UPDATE
SET sumber = EXCLUDED.sumber, is_active = TRUE;

