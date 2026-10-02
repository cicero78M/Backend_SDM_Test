-- Mempersempit mapping generik agar selector mengikuti fungsi Unit Kerja.
UPDATE jabatan_unit_kerja SET is_active=false
WHERE sumber IN ('nomenklatur', 'nomenklatur-samapta');

WITH eligible AS (
  SELECT u.id_unit, u.kode_unit, u.nama_unit, u.tipe_unit
  FROM unit_kerja u WHERE u.is_active=true
), rules AS (
  SELECT 12::integer AS id_jabatan, e.id_unit FROM eligible e
  UNION ALL
  SELECT 13, e.id_unit FROM eligible e WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(TIK|INFORMASI|KOMPUTER|TEKNOLOGI|SISTEM)'
  UNION ALL
  SELECT j.id_jabatan, e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (4,5,6,11,14)
    WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(SDM|KEPEGAWAIAN|PERSONEL|MUTASI|PENGEMBANGAN|DATA)'
  UNION ALL
  SELECT j.id_jabatan, e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (7,8)
    WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(TIK|INFORMASI|KOMPUTER|TEKNOLOGI|SISTEM)'
  UNION ALL
  SELECT j.id_jabatan, e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (9,10)
    WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(ARSIP|UMUM|KEPEGAWAIAN|SEKRETARIAT|ADMIN)'
  UNION ALL
  SELECT j.id_jabatan, e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (15,16)
    WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(KEU|KEUANGAN|ANGGARAN|BENDAHARA|LOGISTIK)'
  UNION ALL
  SELECT j.id_jabatan, e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (1,2)
    WHERE e.tipe_unit IN ('BAGIAN','BIRO','SEKRETARIAT')
  UNION ALL
  SELECT 3, e.id_unit FROM eligible e WHERE e.tipe_unit='BIDANG'
  UNION ALL
  SELECT j.id_jabatan, e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan BETWEEN 17 AND 22
    WHERE e.kode_unit='SATSAMAPTA'
)
INSERT INTO jabatan_unit_kerja (id_jabatan,id_unit,sumber,is_active)
SELECT DISTINCT id_jabatan,id_unit,'nomenklatur-refined',true FROM rules
ON CONFLICT (id_jabatan,id_unit) DO UPDATE SET sumber=EXCLUDED.sumber,is_active=true;

-- Data lama tetap dapat diedit tanpa mengubah jabatan historisnya, tetapi tidak
-- ditawarkan pada selector baru karena sumbernya ditandai legacy-assignment.
INSERT INTO jabatan_unit_kerja (id_jabatan,id_unit,sumber,is_active)
SELECT DISTINCT p.id_jabatan,p.id_unit,'legacy-assignment',true
FROM pegawai p
WHERE NOT EXISTS (
  SELECT 1 FROM jabatan_unit_kerja ju
  WHERE ju.id_jabatan=p.id_jabatan AND ju.id_unit=p.id_unit
    AND ju.sumber='nomenklatur-refined' AND ju.is_active=true
)
ON CONFLICT (id_jabatan,id_unit) DO UPDATE SET sumber='legacy-assignment',is_active=true;
