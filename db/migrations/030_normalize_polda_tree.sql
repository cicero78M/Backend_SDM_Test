-- Menormalkan tree organisasi tingkat Polda.
-- Bentuk kanonis:
-- Polda -> Satker Direktorat/Bidang/RO/fungsi -> sub-satker/unit induk -> Unit Kerja daun.
-- Migrasi ini idempoten dan tidak mengubah data personel yang sudah ada.

-- Pastikan Satker inti yang dibuat oleh migrasi sebelumnya selalu kembali ke
-- parent Polda berdasarkan prefix kode, bukan tersambung ke Polda lain.
UPDATE satker child
SET id_satker_induk = parent.id_satker,
    is_active = TRUE
FROM satker parent
WHERE parent.tipe_satker = 'POLDA'
  AND child.is_active = TRUE
  AND child.id_satker <> parent.id_satker
  AND child.kode_satker LIKE parent.kode_satker || '_%'
  AND child.kode_satker ~ '_(ROOPS|RORENA|ROSDM|ROLOG|BIDPROPAM|BIDKUM|BIDHUMAS|BIDDOKKES|BIDLABFOR|BIDTIK|SPN|RSBHAYANGKARA)$';

-- Unit parent tidak boleh sekaligus menjadi pilihan unit terkecil. Unit
-- generik lama langsung di bawah kategori SUBDIT dinonaktifkan; unit child
-- bernama tetap menjadi daun yang dipilih untuk personel.
UPDATE unit_kerja child
SET is_active = FALSE
FROM unit_kerja parent
JOIN satker s ON s.id_satker = parent.id_satker
WHERE child.id_unit_induk = parent.id_unit
  AND parent.kode_unit = 'SUBDIT'
  AND child.kode_unit = 'UNIT'
  AND s.tipe_satker = 'DIREKTORAT';

-- Jangan menampilkan placeholder jika Satker sudah memiliki unit riil.
UPDATE unit_kerja placeholder
SET is_active = FALSE
WHERE COALESCE(placeholder.is_placeholder, FALSE) = TRUE
  AND EXISTS (
    SELECT 1
    FROM unit_kerja real_unit
    WHERE real_unit.id_satker = placeholder.id_satker
      AND real_unit.is_active = TRUE
      AND COALESCE(real_unit.is_placeholder, FALSE) = FALSE
  );

