-- Migration 040: membedakan status histori jabatan aktif dan yang telah selesai.
BEGIN;

INSERT INTO status_jabatan (kode_status, nama_status, is_active)
VALUES ('MIGRASI_NONAKTIF', 'Tidak aktif / selesai menjabat', TRUE)
ON CONFLICT (kode_status) DO UPDATE
SET nama_status=EXCLUDED.nama_status, is_active=TRUE;

INSERT INTO status_jabatan (kode_status, nama_status, is_active)
VALUES ('MIGRASI_AKTIF', 'Aktif menjabat', TRUE)
ON CONFLICT (kode_status) DO UPDATE
SET nama_status=EXCLUDED.nama_status, is_active=TRUE;

GRANT SELECT ON status_jabatan TO user_personel;

COMMIT;
