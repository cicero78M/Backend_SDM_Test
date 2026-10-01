-- Mendukung personel Polri (NRP) dan ASN (NIP) tanpa memutus data lama.
ALTER TABLE pegawai ALTER COLUMN nip TYPE VARCHAR(20) USING btrim(nip);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS jenis_personel VARCHAR(20);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS jenis_identitas VARCHAR(5);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS pangkat VARCHAR(80);

-- Data lama berbentuk 18 digit dipertahankan sebagai ASN/NIP berdasarkan format
-- identitas; data baru memakai POLRI/NRP sebagai default aplikasi.
UPDATE pegawai SET jenis_personel = CASE WHEN length(btrim(nip)) = 18 THEN 'ASN' ELSE 'POLRI' END
WHERE jenis_personel IS NULL;
UPDATE pegawai SET jenis_identitas = CASE WHEN length(btrim(nip)) = 18 THEN 'NIP' ELSE 'NRP' END
WHERE jenis_identitas IS NULL;
ALTER TABLE pegawai ALTER COLUMN jenis_personel SET DEFAULT 'POLRI';
ALTER TABLE pegawai ALTER COLUMN jenis_identitas SET DEFAULT 'NRP';
ALTER TABLE pegawai ALTER COLUMN jenis_personel SET NOT NULL;
ALTER TABLE pegawai ALTER COLUMN jenis_identitas SET NOT NULL;
ALTER TABLE pegawai DROP CONSTRAINT IF EXISTS pegawai_nip_format_check;
ALTER TABLE pegawai ADD CONSTRAINT pegawai_nip_format_check CHECK (nip ~ '^[0-9]{8,18}$');
ALTER TABLE pegawai DROP CONSTRAINT IF EXISTS pegawai_jenis_personel_check;
ALTER TABLE pegawai ADD CONSTRAINT pegawai_jenis_personel_check CHECK (jenis_personel IN ('POLRI','ASN','PPPK','HONORER','LAINNYA'));
ALTER TABLE pegawai DROP CONSTRAINT IF EXISTS pegawai_jenis_identitas_check;
ALTER TABLE pegawai ADD CONSTRAINT pegawai_jenis_identitas_check CHECK (jenis_identitas IN ('NRP','NIP'));
ALTER TABLE pegawai ALTER COLUMN id_golongan DROP NOT NULL;

-- Menjamin input personel baru mendapatkan ID otomatis pada database lama
-- yang sebelumnya dibuat tanpa default sequence.
CREATE SEQUENCE IF NOT EXISTS pegawai_id_pegawai_seq;
SELECT setval('pegawai_id_pegawai_seq', COALESCE((SELECT MAX(id_pegawai) FROM pegawai), 1), true);
ALTER TABLE pegawai ALTER COLUMN id_pegawai SET DEFAULT nextval('pegawai_id_pegawai_seq');
-- Ownership sequence dibiarkan mengikuti administrator database yang menerapkan
-- migrasi; default nextval di atas sudah cukup untuk integritas ID.
