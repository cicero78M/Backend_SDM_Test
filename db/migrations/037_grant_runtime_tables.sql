-- Migration 037: melengkapi hak minimum role aplikasi untuk tabel runtime.
-- Tidak mengubah schema atau perilaku endpoint; hanya menyelaraskan privilege.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_personel') THEN
        GRANT SELECT ON TABLE jabatan_unit_kerja TO user_personel;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE registration_requests TO user_personel;
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE password_reset_tokens TO user_personel;
    END IF;
END $$;

COMMIT;
