-- Simpan Satker registrasi sebagai foreign key agar approval dapat menetapkan scope.
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS id_satker INTEGER REFERENCES satker (id_satker);
CREATE INDEX IF NOT EXISTS ix_registration_requests_satker ON registration_requests (id_satker);
