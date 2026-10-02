-- Migration 034: izinkan backend approval mengelola Grant scope user.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_personel') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_scope TO user_personel';
    END IF;
END $$;
