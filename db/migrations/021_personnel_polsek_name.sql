-- Menyimpan nama manual Polsek pada data personel ketika unit kerja berkode POLSEK.
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS nama_polsek VARCHAR(100);
