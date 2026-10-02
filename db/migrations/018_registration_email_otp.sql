-- Verifikasi email untuk pendaftaran publik.
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS otp_last_sent_at TIMESTAMPTZ;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS email_otp_hash CHAR(64);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_registration_email_verification
  ON registration_requests (id_registration, status, email_verified_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (email) WHERE email IS NOT NULL;
