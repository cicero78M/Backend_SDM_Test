-- Seed demo lokal/non-produksi. Jalankan hanya pada database demo:
-- psql "$DATABASE_URL" -f db/seed/demo_merit_system.sql
-- Password demo: Demo-Admin-2026! / Demo-Operator-2026!
BEGIN;

INSERT INTO satker (kode_satker, nama_satker, tipe_satker, is_active)
VALUES ('DEMO-POLDA', 'Demo Polda', 'POLDA', TRUE)
ON CONFLICT (kode_satker) DO UPDATE SET is_active = TRUE;

INSERT INTO satker (kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active)
SELECT 'DEMO-SATKER', 'Demo Satker', 'SATKER', id_satker, TRUE
FROM satker WHERE kode_satker = 'DEMO-POLDA'
ON CONFLICT (kode_satker) DO UPDATE SET is_active = TRUE;

INSERT INTO users (username, password_hash, role, is_active)
VALUES
  ('demo_admin_ssdm', '$2a$12$VFbnCwQSE1CAbHVFRbXroehPcFEHnejZSZxAMExfKyiQY9uKzlQUq', 'admin_ssdm', TRUE),
  ('demo_operator_polda', '$2a$12$yKQ0CVxu9O8AhrSAV7Ftr.B.GrDHp5VrTTbOxESQP3.bAqLjpJ48S', 'operator_polda', TRUE),
  ('demo_operator_satker', '$2a$12$yKQ0CVxu9O8AhrSAV7Ftr.B.GrDHp5VrTTbOxESQP3.bAqLjpJ48S', 'operator_satker', TRUE)
ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE;

INSERT INTO user_scope (id_user, id_satker)
SELECT u.id_user, s.id_satker FROM users u CROSS JOIN satker s
WHERE u.username = 'demo_operator_polda' AND s.kode_satker = 'DEMO-POLDA'
ON CONFLICT DO NOTHING;
INSERT INTO user_scope (id_user, id_satker)
SELECT u.id_user, s.id_satker FROM users u CROSS JOIN satker s
WHERE u.username = 'demo_operator_satker' AND s.kode_satker = 'DEMO-SATKER'
ON CONFLICT DO NOTHING;

-- Data minimal agar smoke test operator benar-benar menguji pembatasan scope.
INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active)
SELECT 990001, 'DEMO-POLDA-UNIT', 'Unit Demo Polda', id_satker, 'PELAKSANA', TRUE
FROM satker WHERE kode_satker = 'DEMO-POLDA'
ON CONFLICT (id_unit) DO UPDATE SET kode_unit=EXCLUDED.kode_unit, nama_unit=EXCLUDED.nama_unit, id_satker=EXCLUDED.id_satker, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

INSERT INTO unit_kerja (id_unit, kode_unit, nama_unit, id_satker, tipe_unit, is_active)
SELECT 990002, 'DEMO-SATKER-UNIT', 'Unit Demo Satker', id_satker, 'PELAKSANA', TRUE
FROM satker WHERE kode_satker = 'DEMO-SATKER'
ON CONFLICT (id_unit) DO UPDATE SET kode_unit=EXCLUDED.kode_unit, nama_unit=EXCLUDED.nama_unit, id_satker=EXCLUDED.id_satker, tipe_unit=EXCLUDED.tipe_unit, is_active=TRUE;

INSERT INTO pegawai (nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, pangkat, id_satker)
SELECT '900000000001', 'POLRI', 'NRP', '9000000000010001', 'Personel Demo Polda', 'L', '1990-01-01', '2012-01-01', 990001,
       (SELECT MIN(id_jabatan) FROM jabatan), 'Bripka', id_satker
FROM satker WHERE kode_satker = 'DEMO-POLDA'
ON CONFLICT (nip) DO UPDATE SET nama=EXCLUDED.nama, id_unit=EXCLUDED.id_unit, id_satker=EXCLUDED.id_satker, pangkat=EXCLUDED.pangkat;

INSERT INTO pegawai (nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, pangkat, id_satker)
SELECT '900000000002', 'POLRI', 'NRP', '9000000000020002', 'Personel Demo Satker', 'P', '1991-02-02', '2013-02-02', 990002,
       (SELECT MIN(id_jabatan) FROM jabatan), 'Briptu', id_satker
FROM satker WHERE kode_satker = 'DEMO-SATKER'
ON CONFLICT (nip) DO UPDATE SET nama=EXCLUDED.nama, id_unit=EXCLUDED.id_unit, id_satker=EXCLUDED.id_satker, pangkat=EXCLUDED.pangkat;

COMMIT;
