-- Migration 008: struktur Unit Organisasi/Satfung bergantung pada Satker.
-- Polda/Polres mengikuti Perpol 6/2025 dan Perpol 7/2025 jo. Perpol 2/2021.
BEGIN;

ALTER TABLE unit_kerja ADD COLUMN IF NOT EXISTS kode_unit VARCHAR(80);
ALTER TABLE unit_kerja ADD COLUMN IF NOT EXISTS id_satker INTEGER REFERENCES satker (id_satker) ON DELETE CASCADE;
ALTER TABLE unit_kerja ADD COLUMN IF NOT EXISTS tipe_unit VARCHAR(30) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE unit_kerja ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_kerja_satker_kode ON unit_kerja (id_satker, kode_unit);

WITH template(kode, nama, tipe, urutan) AS (
  VALUES
    ('BAGRENMIN','Bagian Perencanaan dan Administrasi','PEMBANTU',10),
    ('BAGBINOPSNAL','Bagian Pembinaan Operasional','PELAKSANA',20),
    ('BAGWASSIDIK','Bagian Pengawasan Penyidikan','PENGAWAS',30),
    ('SIIDENT','Seksi Identifikasi','PELAKSANA',40),
    ('SUBDIT','Subdirektorat','PELAKSANA',50),
    ('UNIT','Unit','PELAKSANA',60)
), target AS (
  SELECT id_satker FROM satker WHERE tipe_satker='DIREKTORAT'
), rows_to_add AS (
  SELECT t.id_satker, x.kode, x.nama, x.tipe, x.urutan
  FROM target t CROSS JOIN template x
)
INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0) + ROW_NUMBER() OVER (ORDER BY id_satker, urutan), kode, nama, id_satker, tipe, TRUE
FROM rows_to_add
ON CONFLICT (id_satker, kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

WITH template(kode, nama, tipe, urutan) AS (
  VALUES
    ('SIWAS','Seksi Pengawasan','PENGAWAS',10),('SIPROPAM','Seksi Profesi dan Pengamanan','PENGAWAS',20),
    ('BAGOPS','Bagian Operasi','PEMBANTU',30),('BAGREN','Bagian Perencanaan','PEMBANTU',40),('BAGSDM','Bagian Sumber Daya Manusia','PEMBANTU',50),('BAGLOG','Bagian Logistik','PEMBANTU',60),
    ('SIHUMAS','Seksi Hubungan Masyarakat','PEMBANTU',70),('SIKUM','Seksi Hukum','PEMBANTU',80),('SITIK','Seksi Teknologi Informasi Komunikasi','PEMBANTU',90),('SIUM','Seksi Umum','PEMBANTU',100),
    ('SPKT','Sentra Pelayanan Kepolisian Terpadu','PELAKSANA',110),('SATINTELKAM','Satuan Intelijen Keamanan','PELAKSANA',120),('SATRESKRIM','Satuan Reserse Kriminal','PELAKSANA',130),('SATRESPPA_PPO','Satuan Reserse PPA dan PPO','PELAKSANA',140),('SATRESNARKOBA','Satuan Reserse Narkotika','PELAKSANA',150),('SATBINMAS','Satuan Pembinaan Masyarakat','PELAKSANA',160),('SATSAMAPTA','Satuan Samapta','PELAKSANA',170),('SATLANTAS','Satuan Lalu Lintas','PELAKSANA',180),('SATPAMOBVIT','Satuan Pengamanan Objek Vital','PELAKSANA',190),('SATPOLAIRUD','Satuan Kepolisian Perairan dan Udara','PELAKSANA',200),('SATTAHTI','Satuan Perawatan Tahanan dan Barang Bukti','PELAKSANA',210),
    ('SIKEU','Seksi Keuangan','PENDUKUNG',220),('SIDOKKES','Seksi Kedokteran dan Kesehatan','PENDUKUNG',230),('POLSEK','Kepolisian Sektor','KEWILAYAHAN',240)
), target AS (
  SELECT id_satker FROM satker WHERE tipe_satker='SATKER'
), rows_to_add AS (
  SELECT t.id_satker, x.kode, x.nama, x.tipe, x.urutan
  FROM target t CROSS JOIN template x
)
INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0) + ROW_NUMBER() OVER (ORDER BY id_satker, urutan), kode, nama, id_satker, tipe, TRUE
FROM rows_to_add
ON CONFLICT (id_satker, kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

WITH target AS (
  SELECT id_satker, nama_satker FROM satker WHERE tipe_satker='SATKER_MABES'
), rows_to_add AS (
  SELECT id_satker, 'SATKER_UTAMA' AS kode_unit, 'Unit Organisasi ' || nama_satker AS nama_unit, 'SATKER' AS tipe_unit
  FROM target
)
INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0) + ROW_NUMBER() OVER (ORDER BY id_satker), kode_unit, nama_unit, id_satker, tipe_unit, TRUE
FROM rows_to_add
ON CONFLICT (id_satker, kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

INSERT INTO fungsi (kode_fungsi, nama_fungsi, is_active)
SELECT 'SATFUNG_' || kode_unit, MIN(nama_unit), TRUE
FROM unit_kerja WHERE id_satker IS NOT NULL AND kode_unit IS NOT NULL
GROUP BY kode_unit
ON CONFLICT (kode_fungsi) DO UPDATE SET nama_fungsi=EXCLUDED.nama_fungsi, is_active=TRUE;

INSERT INTO satker_fungsi (id_satker, id_fungsi, is_active)
SELECT u.id_satker, f.id_fungsi, TRUE
FROM unit_kerja u JOIN fungsi f ON f.kode_fungsi='SATFUNG_' || u.kode_unit
WHERE u.id_satker IS NOT NULL AND u.kode_unit IS NOT NULL
ON CONFLICT (id_satker, id_fungsi) DO UPDATE SET is_active=TRUE, updated_at=NOW();

COMMIT;
