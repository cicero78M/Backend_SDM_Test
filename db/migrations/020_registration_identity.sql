-- Simpan jenis identitas dan pilihan pangkat/golongan pada registrasi.
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS jenis_personel VARCHAR(10);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS id_golongan INTEGER REFERENCES golongan (id_golongan);
CREATE INDEX IF NOT EXISTS ix_registration_requests_identity ON registration_requests (jenis_personel, nip);
