-- Fixture demonstrasi Merit System untuk database aktif yang telah diizinkan administrator.
-- Hanya menyentuh record berkode/nip DEMO-* dan dapat dijalankan ulang.
-- Jalankan dengan hak administrator PostgreSQL, bukan role runtime aplikasi.
BEGIN;

INSERT INTO level_jabatan (kode_level, nama_level, urutan) VALUES
  ('DEMO_LEVEL_1', 'Level Pelaksana', 1),
  ('DEMO_LEVEL_2', 'Level Pengawas', 2),
  ('DEMO_LEVEL_3', 'Level Administrator', 3)
ON CONFLICT (kode_level) DO UPDATE SET nama_level = EXCLUDED.nama_level, urutan = EXCLUDED.urutan, is_active = TRUE;

INSERT INTO status_jabatan (kode_status, nama_status) VALUES
  ('DEMO_NONAKTIF', 'Selesai/Purna Tugas'),
  ('DEMO_AKTIF', 'Aktif Menjabat')
ON CONFLICT (kode_status) DO UPDATE SET nama_status = EXCLUDED.nama_status, is_active = TRUE;

INSERT INTO fungsi (kode_fungsi, nama_fungsi) VALUES
  ('DEMO_BINOPSNAL', 'Pembinaan Operasional'),
  ('DEMO_SDM', 'Sumber Daya Manusia'),
  ('DEMO_RENMIN', 'Perencanaan dan Administrasi')
ON CONFLICT (kode_fungsi) DO UPDATE SET nama_fungsi = EXCLUDED.nama_fungsi, is_active = TRUE;

INSERT INTO satker_fungsi (id_satker, id_fungsi)
SELECT s.id_satker, f.id_fungsi
FROM satker s CROSS JOIN fungsi f
WHERE s.kode_satker IN ('DEMO-POLDA', 'DEMO-SATKER')
  AND f.kode_fungsi IN ('DEMO_BINOPSNAL', 'DEMO_SDM', 'DEMO_RENMIN')
ON CONFLICT (id_satker, id_fungsi) DO UPDATE SET is_active = TRUE, updated_at = NOW();

INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active) VALUES
  (990003, 'DEMO-POLDA-UNIT-2', 'Bagian Pembinaan Demo Polda', (SELECT id_satker FROM satker WHERE kode_satker='DEMO-POLDA'), 'BAGIAN', TRUE),
  (990004, 'DEMO-POLDA-UNIT-3', 'Bagian SDM Demo Polda', (SELECT id_satker FROM satker WHERE kode_satker='DEMO-POLDA'), 'BAGIAN', TRUE),
  (990005, 'DEMO-SATKER-UNIT-2', 'Unit Operasional Demo Satker', (SELECT id_satker FROM satker WHERE kode_satker='DEMO-SATKER'), 'UNIT', TRUE),
  (990006, 'DEMO-SATKER-UNIT-3', 'Unit SDM Demo Satker', (SELECT id_satker FROM satker WHERE kode_satker='DEMO-SATKER'), 'UNIT', TRUE)
ON CONFLICT (id_unit) DO UPDATE SET kode_unit=EXCLUDED.kode_unit, nama_unit=EXCLUDED.nama_unit, id_satker=EXCLUDED.id_satker, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

INSERT INTO pegawai (nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, pangkat, id_satker, status_pegawai)
VALUES
  ('900000000001','POLRI','NRP','9000000000010001','Personel Demo Polda','L','Jakarta','1990-01-01','2012-01-01',990001,1,'Bripka',(SELECT id_satker FROM satker WHERE kode_satker='DEMO-POLDA'),'AKTIF'),
  ('900000000002','POLRI','NRP','9000000000020002','Personel Demo Satker','P','Bandung','1991-02-02','2013-02-02',990002,2,'Briptu',(SELECT id_satker FROM satker WHERE kode_satker='DEMO-SATKER'),'AKTIF'),
  ('900000000003','POLRI','NRP','9000000000030003','Analis Karier Demo Polda','P','Semarang','1988-03-03','2010-03-03',990003,4,'Aipda',(SELECT id_satker FROM satker WHERE kode_satker='DEMO-POLDA'),'AKTIF'),
  ('900000000004','POLRI','NRP','9000000000040004','Pengawas Operasional Demo Polda','L','Surabaya','1986-04-04','2008-04-04',990004,3,'Aiptu',(SELECT id_satker FROM satker WHERE kode_satker='DEMO-POLDA'),'AKTIF'),
  ('900000000005','POLRI','NRP','9000000000050005','Pengelola SDM Demo Satker','P','Yogyakarta','1992-05-05','2014-05-05',990005,11,'Brigpol',(SELECT id_satker FROM satker WHERE kode_satker='DEMO-SATKER'),'AKTIF'),
  ('900000000006','ASN','NIP','9000000000060006','Analis ASN Demo Satker','L','Malang','1989-06-06','2011-06-06',990006,5,NULL,(SELECT id_satker FROM satker WHERE kode_satker='DEMO-SATKER'),'AKTIF')
ON CONFLICT (nip) DO UPDATE SET jenis_personel=EXCLUDED.jenis_personel, jenis_identitas=EXCLUDED.jenis_identitas, nik=EXCLUDED.nik, nama=EXCLUDED.nama, jenis_kelamin=EXCLUDED.jenis_kelamin, tempat_lahir=EXCLUDED.tempat_lahir, tanggal_lahir=EXCLUDED.tanggal_lahir, tanggal_masuk=EXCLUDED.tanggal_masuk, id_unit=EXCLUDED.id_unit, id_jabatan=EXCLUDED.id_jabatan, pangkat=EXCLUDED.pangkat, id_satker=EXCLUDED.id_satker, status_pegawai=EXCLUDED.status_pegawai;

DELETE FROM riwayat_jabatan r
USING pegawai p
WHERE p.id_pegawai = r.id_pegawai AND p.nip LIKE '90000000000%';

INSERT INTO riwayat_jabatan (id_pegawai,id_jabatan,id_satker,id_fungsi,id_level_jabatan,id_status_jabatan,tanggal_mulai,tanggal_selesai,keterangan,created_by)
SELECT p.id_pegawai, j.id_jabatan, s.id_satker, f.id_fungsi, l.id_level_jabatan, st.id_status_jabatan, x.mulai::date, x.selesai::date, x.keterangan, u.id_user
FROM (VALUES
  ('900000000001',1,'DEMO_BINOPSNAL','DEMO_LEVEL_1','DEMO_NONAKTIF','2012-01-01','2016-12-31','Penugasan awal pada fungsi operasional'),
  ('900000000001',2,'DEMO_SDM','DEMO_LEVEL_2','DEMO_NONAKTIF','2017-01-01','2021-12-31','Peralihan ke fungsi pembinaan SDM'),
  ('900000000001',3,'DEMO_RENMIN','DEMO_LEVEL_3','DEMO_AKTIF','2022-01-01',NULL,'Jabatan aktif untuk simulasi profil karier'),
  ('900000000002',1,'DEMO_BINOPSNAL','DEMO_LEVEL_1','DEMO_NONAKTIF','2013-02-02','2017-02-01','Penugasan awal'),
  ('900000000002',2,'DEMO_SDM','DEMO_LEVEL_2','DEMO_NONAKTIF','2017-02-02','2021-02-01','Pengalaman fungsi SDM'),
  ('900000000002',3,'DEMO_RENMIN','DEMO_LEVEL_3','DEMO_AKTIF','2021-02-02',NULL,'Jabatan aktif pada Satker demo'),
  ('900000000003',4,'DEMO_BINOPSNAL','DEMO_LEVEL_1','DEMO_NONAKTIF','2010-03-03','2015-03-02','Penugasan analis awal'),
  ('900000000003',5,'DEMO_SDM','DEMO_LEVEL_2','DEMO_NONAKTIF','2015-03-03','2020-03-02','Pengembangan kompetensi analis'),
  ('900000000003',6,'DEMO_RENMIN','DEMO_LEVEL_3','DEMO_AKTIF','2020-03-03',NULL,'Jabatan aktif'),
  ('900000000004',3,'DEMO_BINOPSNAL','DEMO_LEVEL_2','DEMO_NONAKTIF','2008-04-04','2014-04-03','Riwayat pengawas operasional'),
  ('900000000004',1,'DEMO_RENMIN','DEMO_LEVEL_3','DEMO_AKTIF','2014-04-04',NULL,'Jabatan aktif'),
  ('900000000005',11,'DEMO_SDM','DEMO_LEVEL_1','DEMO_NONAKTIF','2014-05-05','2019-05-04','Pengelolaan administrasi personel'),
  ('900000000005',2,'DEMO_SDM','DEMO_LEVEL_2','DEMO_AKTIF','2019-05-05',NULL,'Jabatan aktif'),
  ('900000000006',5,'DEMO_RENMIN','DEMO_LEVEL_1','DEMO_NONAKTIF','2011-06-06','2018-06-05','Penugasan analis ASN'),
  ('900000000006',4,'DEMO_SDM','DEMO_LEVEL_2','DEMO_AKTIF','2018-06-06',NULL,'Jabatan aktif ASN')
) AS x(nip,jabatan,kode_fungsi,kode_level,kode_status,mulai,selesai,keterangan)
JOIN pegawai p ON p.nip=x.nip
JOIN satker s ON s.id_satker=p.id_satker
JOIN jabatan j ON j.id_jabatan=x.jabatan
JOIN fungsi f ON f.kode_fungsi=x.kode_fungsi
JOIN level_jabatan l ON l.kode_level=x.kode_level
JOIN status_jabatan st ON st.kode_status=x.kode_status
LEFT JOIN users u ON u.username='demo_admin_ssdm';

INSERT INTO merit_period (kode_period, nama_period, tanggal_mulai, tanggal_selesai, status)
VALUES ('DEMO-2026', 'Penilaian Merit Demo 2026', '2026-01-01', '2026-12-31', 'AKTIF')
ON CONFLICT (kode_period) DO UPDATE SET nama_period=EXCLUDED.nama_period, tanggal_mulai=EXCLUDED.tanggal_mulai, tanggal_selesai=EXCLUDED.tanggal_selesai, status=EXCLUDED.status;

INSERT INTO merit_indicator (kode_indicator, nama_indicator, deskripsi, bobot) VALUES
  ('DEMO_KINERJA', 'Kinerja dan kontribusi', 'Capaian tugas dan kualitas output yang dapat diverifikasi.', 35),
  ('DEMO_KOMPETENSI', 'Kompetensi dan kualifikasi', 'Pendidikan, pelatihan, sertifikasi, dan kompetensi relevan.', 25),
  ('DEMO_INTEGRITAS', 'Integritas dan disiplin', 'Kepatuhan dan rekam perilaku kedinasan.', 20),
  ('DEMO_PENGALAMAN', 'Pengalaman dan rekam karier', 'Masa penugasan dan kompleksitas perjalanan karier.', 20)
ON CONFLICT (kode_indicator) DO UPDATE SET nama_indicator=EXCLUDED.nama_indicator, deskripsi=EXCLUDED.deskripsi, bobot=EXCLUDED.bobot, is_active=TRUE;

DELETE FROM merit_assessment a USING pegawai p
WHERE p.id_pegawai=a.id_pegawai AND p.nip LIKE '90000000000%';

INSERT INTO merit_assessment (id_pegawai,id_period,id_indicator,nilai_raw,bukti,status,assessed_by)
SELECT p.id_pegawai, per.id_period, i.id_indicator, x.nilai, x.bukti, 'DIVERIFIKASI', u.id_user
FROM (VALUES
  ('900000000001','DEMO_KINERJA',88,'Target operasional demo tercapai'),('900000000001','DEMO_KOMPETENSI',82,'Diklat manajemen operasional'),('900000000001','DEMO_INTEGRITAS',95,'Tidak ada catatan disiplin pada fixture'),('900000000001','DEMO_PENGALAMAN',90,'Tiga tahapan jabatan tercatat'),
  ('900000000002','DEMO_KINERJA',84,'Capaian tugas Satker demo'),('900000000002','DEMO_KOMPETENSI',80,'Pelatihan teknis demo'),('900000000002','DEMO_INTEGRITAS',92,'Rekam disiplin baik'),('900000000002','DEMO_PENGALAMAN',86,'Tiga tahapan jabatan tercatat'),
  ('900000000003','DEMO_KINERJA',91,'Kinerja analisis dan pelaporan'),('900000000003','DEMO_KOMPETENSI',94,'Kualifikasi analis relevan'),('900000000003','DEMO_INTEGRITAS',96,'Rekam integritas baik'),('900000000003','DEMO_PENGALAMAN',88,'Lintasan karier analis'),
  ('900000000004','DEMO_KINERJA',79,'Kinerja fungsi operasional'),('900000000004','DEMO_KOMPETENSI',76,'Kompetensi jabatan'),('900000000004','DEMO_INTEGRITAS',90,'Rekam disiplin baik'),('900000000004','DEMO_PENGALAMAN',93,'Masa dinas dan pengalaman panjang'),
  ('900000000005','DEMO_KINERJA',86,'Pengelolaan data SDM'),('900000000005','DEMO_KOMPETENSI',83,'Kompetensi administrasi'),('900000000005','DEMO_INTEGRITAS',94,'Rekam integritas baik'),('900000000005','DEMO_PENGALAMAN',81,'Dua tahapan jabatan'),
  ('900000000006','DEMO_KINERJA',87,'Analisis ASN demo'),('900000000006','DEMO_KOMPETENSI',89,'Kualifikasi ASN relevan'),('900000000006','DEMO_INTEGRITAS',93,'Rekam disiplin baik'),('900000000006','DEMO_PENGALAMAN',85,'Dua tahapan jabatan')
) AS x(nip,kode_indicator,nilai,bukti)
JOIN pegawai p ON p.nip=x.nip
JOIN merit_period per ON per.kode_period='DEMO-2026'
JOIN merit_indicator i ON i.kode_indicator=x.kode_indicator
LEFT JOIN users u ON u.username='demo_admin_ssdm';

COMMIT;
