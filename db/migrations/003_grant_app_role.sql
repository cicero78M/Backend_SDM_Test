-- Migration 003: privilege minimum untuk role aplikasi staging.
-- Role dibuat/diatur administrator PostgreSQL; migration hanya memberi akses jika role ada.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_personel') THEN
        EXECUTE 'GRANT CONNECT ON DATABASE ' || quote_ident(current_database()) || ' TO user_personel';
        EXECUTE 'GRANT USAGE ON SCHEMA public TO user_personel';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pegawai, riwayat_jabatan, audit_log TO user_personel';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE users TO user_personel';
        EXECUTE 'GRANT SELECT ON TABLE unit_kerja, jabatan, golongan, satker, fungsi, level_jabatan, status_jabatan TO user_personel';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_scope TO user_personel';
        EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO user_personel';
    END IF;
END $$;
