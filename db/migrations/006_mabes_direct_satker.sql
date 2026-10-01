-- Migration 006: Satker Mabes non-kewilayahan sebagai anak langsung Mabes.
-- Sumber: portal resmi E-PPID Satker Polri.
BEGIN;

ALTER TABLE satker DROP CONSTRAINT IF EXISTS satker_tipe_satker_check;
ALTER TABLE satker ADD CONSTRAINT satker_tipe_satker_check
    CHECK (tipe_satker IN ('SSDM', 'POLDA', 'SATKER', 'DIREKTORAT', 'SATKER_MABES'));

WITH mabes_satker(kode, nama) AS (
    VALUES
      ('BARESKRIM', 'BARESKRIM POLRI'),
      ('BAINTELKAM', 'BAINTELKAM POLRI'),
      ('BAHARKAM', 'BAHARKAM POLRI'),
      ('ITWASUM', 'ITWASUM POLRI'),
      ('SSDM', 'SSDM POLRI'),
      ('SOPS', 'SOPS POLRI'),
      ('SLOG', 'SLOG POLRI'),
      ('DIVHUMAS', 'DIVHUMAS POLRI'),
      ('DIVPROPAM', 'DIVPROPAM POLRI'),
      ('DIVKUM', 'DIVKUM POLRI'),
      ('DIVTIK', 'DIVTIK POLRI'),
      ('DIVHUBINTER', 'DIVHUBINTER POLRI'),
      ('BRIMOB', 'KORPS BRIMOB POLRI'),
      ('KORLANTAS', 'KORLANTAS POLRI'),
      ('DENSUS88', 'DENSUS 88 AT POLRI'),
      ('LEMDIKLAT', 'LEMDIKLAT POLRI'),
      ('PUSDOKKES', 'PUSDOKKES POLRI'),
      ('PUSKEU', 'PUSKEU POLRI'),
      ('PUSINAFIS', 'PUSINAFIS POLRI'),
      ('PUSLABFOR', 'PUSLABFOR POLRI')
)
INSERT INTO satker (kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active)
SELECT m.kode, m.nama, 'SATKER_MABES', root.id_satker, TRUE
FROM mabes_satker m
JOIN satker root ON root.kode_satker = 'MABES_POLRI'
ON CONFLICT (kode_satker) DO UPDATE SET
    nama_satker = EXCLUDED.nama_satker,
    tipe_satker = EXCLUDED.tipe_satker,
    id_satker_induk = EXCLUDED.id_satker_induk,
    is_active = TRUE;

COMMIT;
