-- Migration 039: membentuk histori jabatan awal dari jabatan aktif pegawai.
-- Idempoten: tidak menambah baris bila histori aktif untuk personel sudah ada.
-- Perubahan berikutnya dicatat oleh endpoint UPDATE /personel.
BEGIN;

INSERT INTO status_jabatan (kode_status, nama_status, is_active)
VALUES ('MIGRASI_AKTIF', 'Aktif menjabat', TRUE)
ON CONFLICT (kode_status) DO NOTHING;

INSERT INTO riwayat_jabatan
  (id_pegawai, id_jabatan, id_satker, id_unit, id_status_jabatan, tanggal_mulai, keterangan)
SELECT p.id_pegawai, p.id_jabatan, COALESCE(p.id_satker, u.id_satker), p.id_unit, st.id_status_jabatan,
       COALESCE(p.tanggal_masuk, CURRENT_DATE),
       'Jabatan aktif awal dari data personel; dicatat oleh migrasi 039.'
FROM pegawai p
JOIN unit_kerja u ON u.id_unit=p.id_unit
JOIN status_jabatan st ON st.kode_status='MIGRASI_AKTIF'
WHERE p.id_jabatan IS NOT NULL
  AND COALESCE(p.id_satker, u.id_satker) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM riwayat_jabatan r
    WHERE r.id_pegawai=p.id_pegawai AND r.tanggal_selesai IS NULL
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON riwayat_jabatan TO user_personel;

COMMIT;
