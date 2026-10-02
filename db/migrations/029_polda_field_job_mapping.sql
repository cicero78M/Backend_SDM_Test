-- Mapping jabatan untuk Unit Kerja Satker bidang baru di bawah Polda.
WITH eligible AS (
  SELECT u.id_unit,u.kode_unit,u.nama_unit,u.tipe_unit
  FROM unit_kerja u JOIN satker s ON s.id_satker=u.id_satker
  WHERE u.is_active AND s.kode_satker ~ '_(ROOPS|RORENA|ROSDM|ROLOG|BIDPROPAM|BIDKUM|BIDHUMAS|BIDDOKKES|BIDLABFOR|BIDTIK|SPN|RSBHAYANGKARA)$'
), rules AS (
  SELECT 12::integer AS id_jabatan,e.id_unit FROM eligible e
  UNION ALL SELECT 13,e.id_unit FROM eligible e WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(TIK|INFORMASI|KOMPUTER|TEKNOLOGI|SISTEM|MULTIMEDIA)'
  UNION ALL SELECT j.id_jabatan,e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (4,5,6,11,14) WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(SDM|KEPEGAWAIAN|PERSONEL|MUTASI|DATA|SUMBER DAYA)'
  UNION ALL SELECT j.id_jabatan,e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (7,8) WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(TIK|INFORMASI|KOMPUTER|TEKNOLOGI|SISTEM|MULTIMEDIA)'
  UNION ALL SELECT j.id_jabatan,e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (9,10) WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(ARSIP|UMUM|KEPEGAWAIAN|SEKRETARIAT|ADMIN|DOKUMEN)'
  UNION ALL SELECT j.id_jabatan,e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (15,16) WHERE (e.kode_unit || ' ' || e.nama_unit) ~* '(KEU|KEUANGAN|ANGGARAN|BENDAHARA|LOGISTIK|BEKALAN)'
  UNION ALL SELECT 3,e.id_unit FROM eligible e WHERE e.tipe_unit='BIDANG'
  UNION ALL SELECT j.id_jabatan,e.id_unit FROM eligible e JOIN jabatan j ON j.id_jabatan IN (1,2) WHERE e.tipe_unit IN ('BAGIAN','BIRO','SEKRETARIAT')
)
INSERT INTO jabatan_unit_kerja (id_jabatan,id_unit,sumber,is_active)
SELECT DISTINCT id_jabatan,id_unit,'nomenklatur-refined',true FROM rules
ON CONFLICT (id_jabatan,id_unit) DO UPDATE SET sumber=EXCLUDED.sumber,is_active=true;
