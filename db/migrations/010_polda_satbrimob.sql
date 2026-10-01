-- Migration 010: Satbrimob pada setiap Polda dan struktur internalnya.
-- Sumber: Perpol No. 6 Tahun 2025, Pasal 20, Pasal 36-37, Lampiran XXV.
-- Catatan: klasifikasi tipe Polda belum disimpan sebagai atribut pada master
-- satker; node Yon D mengikuti model Tipe A/A Khusus yang telah dipakai
-- migration Polda sebelumnya. Tipe B dapat dirapikan kemudian tanpa mengubah
-- parent Satbrimob.
BEGIN;

ALTER TABLE satker DROP CONSTRAINT IF EXISTS satker_tipe_satker_check;
ALTER TABLE satker ADD CONSTRAINT satker_tipe_satker_check
  CHECK (tipe_satker IN ('SSDM', 'POLDA', 'SATKER', 'DIREKTORAT', 'SATKER_MABES', 'SATBRIMOB'));

INSERT INTO satker (kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active)
SELECT p.kode_satker || '_SATBRIMOB', 'SATBRIMOB ' || p.nama_satker,
       'SATBRIMOB', p.id_satker, TRUE
FROM satker p
WHERE p.tipe_satker = 'POLDA'
ON CONFLICT (kode_satker) DO UPDATE SET
  nama_satker = EXCLUDED.nama_satker,
  tipe_satker = EXCLUDED.tipe_satker,
  id_satker_induk = EXCLUDED.id_satker_induk,
  is_active = TRUE;

WITH template(kode, nama, tipe, urutan) AS (VALUES
  ('BAGRENMIN', 'Subbagian Perencanaan dan Administrasi', 'PEMBANTU', 10),
  ('BAGOPS', 'Bagian Operasi', 'PELAKSANA', 20),
  ('SILOG', 'Seksi Logistik', 'PENDUKUNG', 30),
  ('SIPROVOS', 'Seksi Provos', 'PENGAWAS', 40),
  ('SITIK', 'Seksi Teknologi Informasi dan Komunikasi', 'PENDUKUNG', 50),
  ('SIYANMA', 'Seksi Pelayanan Markas', 'PELAYANAN', 60),
  ('SIKESJAS', 'Seksi Kesehatan dan Jasmani', 'PENDUKUNG', 70),
  ('SIINTEL', 'Seksi Intelijen', 'PELAKSANA', 80),
  ('DENGEGANA', 'Detasemen Gegana', 'PELAKSANA', 90),
  ('YON_A', 'Batalyon A', 'PELAKSANA', 100),
  ('YON_B', 'Batalyon B', 'PELAKSANA', 110),
  ('YON_C', 'Batalyon C', 'PELAKSANA', 120),
  ('YON_D', 'Batalyon D', 'PELAKSANA', 130)
), targets AS (SELECT id_satker FROM satker WHERE tipe_satker='SATBRIMOB')
INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja), 0) + ROW_NUMBER() OVER (ORDER BY t.id_satker, x.urutan),
       x.kode, x.nama, t.id_satker, x.tipe, TRUE
FROM targets t CROSS JOIN template x
ON CONFLICT (id_satker, kode_unit) DO UPDATE SET
  nama_unit=EXCLUDED.nama_unit, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

WITH template(kode, nama, tipe, parent_code, urutan) AS (VALUES
  ('URREN', 'Urusan Perencanaan', 'PELAKSANA', 'BAGRENMIN', 10),
  ('URMINTU', 'Urusan Administrasi dan Tata Usaha', 'PEMBANTU', 'BAGRENMIN', 20),
  ('URKEU', 'Urusan Keuangan', 'PENDUKUNG', 'BAGRENMIN', 30),
  ('SUBBAGMINOPS', 'Subbagian Administrasi Operasi', 'PELAKSANA', 'BAGOPS', 10),
  ('SUBBAGBINLATOPS', 'Subbagian Pembinaan Latihan Operasi', 'PELAKSANA', 'BAGOPS', 20),
  ('SUBBAGDALOPS', 'Subbagian Pengendalian Operasi', 'PELAKSANA', 'BAGOPS', 30),
  ('SUBSIPALANG', 'Subseksi Peralatan dan Angkutan', 'PENDUKUNG', 'SILOG', 10),
  ('SUBSIBEKUM', 'Subseksi Perbekalan Umum', 'PENDUKUNG', 'SILOG', 20),
  ('SUBSIHARTIB', 'Subseksi Pemeliharaan Ketertiban', 'PENGAWAS', 'SIPROVOS', 10),
  ('SUBSIRIKSA', 'Subseksi Pemeriksaan', 'PENGAWAS', 'SIPROVOS', 20),
  ('SUBSIYANKOM', 'Subseksi Pelayanan Komunikasi', 'PENDUKUNG', 'SITIK', 10),
  ('SUBSISISKOM', 'Subseksi Sistem Komunikasi', 'PENDUKUNG', 'SITIK', 20),
  ('SUBSIYANUM', 'Subseksi Pelayanan Umum', 'PELAYANAN', 'SIYANMA', 10),
  ('SUBSIPROTOKOL', 'Subseksi Protokol', 'PELAYANAN', 'SIYANMA', 20),
  ('SUBSIDUKKESLAP', 'Subseksi Dukungan Kesehatan Lapangan', 'PENDUKUNG', 'SIKESJAS', 10),
  ('SUBSIBINJAS', 'Subseksi Pembinaan Jasmani', 'PENDUKUNG', 'SIKESJAS', 20),
  ('KLINIK', 'Klinik', 'PENDUKUNG', 'SIKESJAS', 30),
  ('SUBSIPRODOK', 'Subseksi Produk dan Dokumentasi', 'PELAKSANA', 'SIINTEL', 10),
  ('SUBSIOPSNAL', 'Subseksi Operasional', 'PELAKSANA', 'SIINTEL', 20),
  ('SUBSIANALIS', 'Subseksi Analis', 'PELAKSANA', 'SIINTEL', 30)
), targets AS (SELECT id_satker FROM satker WHERE tipe_satker='SATBRIMOB')
INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, id_unit_induk, is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja), 0) + ROW_NUMBER() OVER (ORDER BY t.id_satker, x.urutan),
       x.kode, x.nama, t.id_satker, x.tipe, p.id_unit, TRUE
FROM targets t CROSS JOIN template x
JOIN unit_kerja p ON p.id_satker=t.id_satker AND p.kode_unit=x.parent_code
ON CONFLICT (id_satker, kode_unit) DO UPDATE SET
  nama_unit=EXCLUDED.nama_unit, tipe_unit=EXCLUDED.tipe_unit,
  id_unit_induk=EXCLUDED.id_unit_induk, is_active=TRUE;

INSERT INTO fungsi (kode_fungsi, nama_fungsi, is_active)
SELECT 'SATFUNG_' || kode_unit, MIN(nama_unit), TRUE
FROM unit_kerja WHERE id_satker IN (SELECT id_satker FROM satker WHERE tipe_satker='SATBRIMOB')
GROUP BY kode_unit
ON CONFLICT (kode_fungsi) DO UPDATE SET nama_fungsi=EXCLUDED.nama_fungsi, is_active=TRUE;

INSERT INTO satker_fungsi (id_satker, id_fungsi, is_active)
SELECT u.id_satker, f.id_fungsi, TRUE
FROM unit_kerja u JOIN fungsi f ON f.kode_fungsi='SATFUNG_' || u.kode_unit
WHERE u.tipe_unit IS NOT NULL AND u.id_satker IN (SELECT id_satker FROM satker WHERE tipe_satker='SATBRIMOB')
ON CONFLICT (id_satker, id_fungsi) DO UPDATE SET is_active=TRUE, updated_at=NOW();

COMMIT;
