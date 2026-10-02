-- Menghapus false-positive token fungsi, misalnya POLITIK yang terbaca
-- sebagai TIK pada rule mapping Direktorat.
UPDATE jabatan_unit_kerja ju
SET is_active = FALSE
FROM unit_kerja u
JOIN satker s ON s.id_satker = u.id_satker
WHERE ju.id_unit = u.id_unit
  AND s.tipe_satker = 'DIREKTORAT'
  AND s.kode_satker NOT LIKE '%_DITSAMAPTA'
  AND ju.sumber = 'nomenklatur-direktorat-refined'
  AND ju.id_jabatan IN (7,8,13)
  AND (u.kode_unit || ' ' || u.nama_unit) !~* '(^|[^A-Z])(TIK|TEKNOLOGI|INFORMASI|KOMPUTER|SIBER|CYBER|SANDI|DATA|MULTIMEDIA|KOMUNIKASI)([^A-Z]|$)';

