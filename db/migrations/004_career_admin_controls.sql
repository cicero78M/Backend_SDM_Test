-- Migration 004: mapping fungsi per Satker dan audit status akun.
-- Additive; tidak menghapus data yang sudah ada.
BEGIN;

CREATE TABLE IF NOT EXISTS satker_fungsi (
    id_satker INTEGER NOT NULL REFERENCES satker (id_satker) ON DELETE CASCADE,
    id_fungsi INTEGER NOT NULL REFERENCES fungsi (id_fungsi) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id_satker, id_fungsi)
);

CREATE INDEX IF NOT EXISTS ix_satker_fungsi_fungsi ON satker_fungsi (id_fungsi);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'user_personel') THEN
        GRANT SELECT ON TABLE satker_fungsi TO user_personel;
        GRANT USAGE, SELECT ON SEQUENCE audit_log_id_audit_seq TO user_personel;
    END IF;
END $$;

COMMIT;
