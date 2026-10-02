-- Role operator Polres mengikuti Satker personel yang sedang dikelola.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','editor','viewer','admin_ssdm','operator_polda','operator_satker','operator_polres'));
ALTER TABLE registration_requests DROP CONSTRAINT IF EXISTS registration_requests_requested_role_check;
ALTER TABLE registration_requests ADD CONSTRAINT registration_requests_requested_role_check CHECK (requested_role IN ('admin','editor','viewer','admin_ssdm','operator_polda','operator_satker','operator_polres'));
ALTER TABLE registration_requests DROP CONSTRAINT IF EXISTS registration_requests_approved_role_check;
ALTER TABLE registration_requests ADD CONSTRAINT registration_requests_approved_role_check CHECK (approved_role IS NULL OR approved_role IN ('admin','editor','viewer','admin_ssdm','operator_polda','operator_satker','operator_polres'));
