-- Migration 005: direktorat resmi pada struktur Polda.
-- Sumber: Perpol No. 6 Tahun 2025, Lampiran I struktur Polda Tipe A.
BEGIN;

ALTER TABLE satker DROP CONSTRAINT IF EXISTS satker_tipe_satker_check;
ALTER TABLE satker ADD CONSTRAINT satker_tipe_satker_check
    CHECK (tipe_satker IN ('SSDM', 'POLDA', 'SATKER', 'DIREKTORAT'));

WITH direktorat(urutan, kode, nama) AS (
    VALUES
      (1, 'DITINTELKAM', 'DIREKTORAT INTELIJEN KEAMANAN'),
      (2, 'DITRESKRIMUM', 'DIREKTORAT RESERSE KRIMINAL UMUM'),
      (3, 'DITRESPPA_PPO', 'DIREKTORAT RESERSE PELINDUNGAN PEREMPUAN DAN ANAK DAN PEMBERANTASAN PERDAGANGAN ORANG'),
      (4, 'DITRESKRIMSUS', 'DIREKTORAT RESERSE KRIMINAL KHUSUS'),
      (5, 'DITRESSIBER', 'DIREKTORAT RESERSE SIBER'),
      (6, 'DITRESNARKOBA', 'DIREKTORAT RESERSE NARKOBA'),
      (7, 'DITBINMAS', 'DIREKTORAT PEMBINAAN MASYARAKAT'),
      (8, 'DITSAMAPTA', 'DIREKTORAT SAMAPTA'),
      (9, 'DITLANTAS', 'DIREKTORAT LALU LINTAS'),
      (10, 'DITPAMOBVIT', 'DIREKTORAT PENGAMANAN OBJEK VITAL'),
      (11, 'DITPOLAIRUD', 'DIREKTORAT KEPOLISIAN PERAIRAN DAN UDARA'),
      (12, 'DITTAHTI', 'DIREKTORAT PERAWATAN TAHANAN DAN BARANG BUKTI')
)
INSERT INTO satker (kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active)
SELECT p.kode_satker || '_' || d.kode, d.nama, 'DIREKTORAT', p.id_satker, TRUE
FROM satker p CROSS JOIN direktorat d
WHERE p.tipe_satker = 'POLDA'
ON CONFLICT (kode_satker) DO UPDATE SET
    nama_satker = EXCLUDED.nama_satker,
    tipe_satker = EXCLUDED.tipe_satker,
    id_satker_induk = EXCLUDED.id_satker_induk,
    is_active = TRUE;

COMMIT;
