-- Unit di bawah Subdirektorat tetap memiliki pilihan jabatan operasional.
INSERT INTO jabatan_unit_kerja (id_jabatan,id_unit,sumber,is_active)
SELECT j.id_jabatan,u.id_unit,'nomenklatur-refined',true
FROM unit_kerja u CROSS JOIN jabatan j
WHERE u.is_active=true
  AND u.id_unit_induk IS NOT NULL
  AND u.id_satker IN (SELECT id_satker FROM satker WHERE tipe_satker='DIREKTORAT')
  AND j.id_jabatan BETWEEN 4 AND 16
ON CONFLICT (id_jabatan,id_unit) DO UPDATE SET sumber=EXCLUDED.sumber,is_active=true;
