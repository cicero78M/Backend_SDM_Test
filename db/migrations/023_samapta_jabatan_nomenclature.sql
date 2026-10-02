-- Nomenklatur operasional Unit Satuan Samapta pada Satker Polres.
WITH new_jobs(nama_jabatan, jenis_jabatan) AS (
  VALUES
    ('Kepala Satuan Samapta (Kasat Samapta)', 'STRUKTURAL'),
    ('Kepala Urusan Pembinaan Operasional (Kaurbinopsnal)', 'STRUKTURAL'),
    ('Kepala Urusan Administrasi (Kaurmintu)', 'STRUKTURAL'),
    ('Kepala Unit Turjawali (Kanit Turjawali)', 'STRUKTURAL'),
    ('Kepala Unit Dalmas (Kanit Dalmas)', 'STRUKTURAL'),
    ('Bintara Satuan Samapta', 'PELAKSANA')
), numbered AS (
  SELECT (SELECT COALESCE(MAX(id_jabatan), 0) FROM jabatan) + ROW_NUMBER() OVER (ORDER BY nama_jabatan) AS id_jabatan,
         nama_jabatan, jenis_jabatan
  FROM new_jobs
)
INSERT INTO jabatan (id_jabatan, nama_jabatan, jenis_jabatan)
SELECT n.id_jabatan, n.nama_jabatan, n.jenis_jabatan
FROM numbered n
WHERE NOT EXISTS (SELECT 1 FROM jabatan j WHERE j.nama_jabatan=n.nama_jabatan);

INSERT INTO jabatan_unit_kerja (id_jabatan, id_unit, sumber)
SELECT j.id_jabatan, u.id_unit, 'nomenklatur-samapta'
FROM jabatan j CROSS JOIN unit_kerja u
WHERE u.kode_unit='SATSAMAPTA'
  AND u.is_active=true
  AND j.nama_jabatan IN (
    'Kepala Satuan Samapta (Kasat Samapta)',
    'Kepala Urusan Pembinaan Operasional (Kaurbinopsnal)',
    'Kepala Urusan Administrasi (Kaurmintu)',
    'Kepala Unit Turjawali (Kanit Turjawali)',
    'Kepala Unit Dalmas (Kanit Dalmas)',
    'Bintara Satuan Samapta'
  )
ON CONFLICT (id_jabatan, id_unit) DO UPDATE
SET is_active=true, sumber=EXCLUDED.sumber;
