-- Membuat tabel unit kerja sebagai master organisasi.
CREATE TABLE IF NOT EXISTS unit_kerja (
    -- ID unik unit kerja.
    id_unit INTEGER PRIMARY KEY,
    -- Nama unit yang wajib diisi.
    nama_unit VARCHAR(100) NOT NULL,
    -- Relasi opsional ke unit induk untuk membentuk hierarki.
    id_unit_induk INTEGER REFERENCES unit_kerja (id_unit)
);

-- Membuat tabel referensi pangkat/golongan.
CREATE TABLE IF NOT EXISTS golongan (
    -- ID unik golongan.
    id_golongan INTEGER PRIMARY KEY,
    -- Kode golongan tidak boleh duplikat.
    kode_golongan VARCHAR(5) NOT NULL UNIQUE,
    -- Nama pangkat yang ditampilkan di API.
    nama_pangkat VARCHAR(50) NOT NULL
);

-- Membuat tabel referensi jabatan pegawai.
CREATE TABLE IF NOT EXISTS jabatan (
    -- ID unik jabatan.
    id_jabatan INTEGER PRIMARY KEY,
    -- Nama jabatan wajib diisi.
    nama_jabatan VARCHAR(100) NOT NULL,
    -- Jenis jabatan, misalnya struktural atau fungsional.
    jenis_jabatan VARCHAR(20) NOT NULL
);

-- Membuat tabel utama resource CRUD aplikasi.
CREATE TABLE IF NOT EXISTS pegawai (
    -- ID otomatis setiap pegawai.
    id_pegawai SERIAL PRIMARY KEY,
    -- Nomor identitas: NRP Polri atau NIP ASN.
    nip VARCHAR(20) NOT NULL UNIQUE CHECK (nip ~ '^[0-9]{8,18}$'),
    -- Kategori personel agar data Polri tidak dipaksa menjadi ASN.
    jenis_personel VARCHAR(20) NOT NULL DEFAULT 'POLRI' CHECK (jenis_personel IN ('POLRI','ASN','PPPK','HONORER','LAINNYA')),
    -- Jenis nomor identitas yang digunakan.
    jenis_identitas VARCHAR(5) NOT NULL DEFAULT 'NRP' CHECK (jenis_identitas IN ('NRP','NIP')),
    -- NIK 16 digit dan tidak boleh sama.
    nik CHAR(16) NOT NULL UNIQUE,
    -- Nama lengkap pegawai.
    nama VARCHAR(100) NOT NULL,
    -- Jenis kelamin dibatasi L atau P.
    jenis_kelamin CHAR(1) NOT NULL CHECK (jenis_kelamin IN ('L','P')),
    -- Tempat lahir bersifat opsional.
    tempat_lahir VARCHAR(50),
    -- Tanggal lahir pegawai.
    tanggal_lahir DATE NOT NULL,
    -- Tanggal mulai masuk kerja.
    tanggal_masuk DATE,
    -- Foreign key ke unit kerja.
    id_unit INTEGER NOT NULL REFERENCES unit_kerja (id_unit),
    -- Foreign key ke jabatan.
    id_jabatan INTEGER NOT NULL REFERENCES jabatan (id_jabatan),
    -- Foreign key ke golongan ASN; boleh kosong jika pangkat Polri diisi langsung.
    id_golongan INTEGER REFERENCES golongan (id_golongan),
    -- Nomenklatur pangkat Polri atau kualifikasi lain yang tidak berada di tabel golongan ASN.
    pangkat VARCHAR(80),
    -- Self-reference ke pegawai yang menjadi atasan.
    id_atasan INTEGER REFERENCES pegawai (id_pegawai),
    -- Status kepegawaian dengan default aktif.
    status_pegawai VARCHAR(15) NOT NULL DEFAULT 'AKTIF',
    -- Batas usia pensiun dalam tahun.
    batas_usia_pensiun SMALLINT NOT NULL DEFAULT 58,
    -- Waktu pembuatan data untuk audit dasar.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Waktu perubahan terakhir untuk audit dasar.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Memastikan tanggal masuk sesudah tanggal lahir.
    CHECK (tanggal_masuk > tanggal_lahir)
);

-- Membuat tabel user untuk authentication dan authorization.
CREATE TABLE IF NOT EXISTS users (
    -- ID otomatis user.
    id_user SERIAL PRIMARY KEY,
    -- Username login yang unik.
    username VARCHAR(50) NOT NULL UNIQUE,
    -- Password disimpan dalam bentuk bcrypt hash.
    password_hash VARCHAR(255) NOT NULL,
    -- Role menentukan permission endpoint.
    email VARCHAR(150) UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer', 'admin_ssdm', 'operator_polda', 'operator_satker')),
    -- Admin dapat menonaktifkan user tanpa menghapus histori.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Waktu user dibuat.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pendaftaran baru selalu dimulai sebagai viewer dan menunggu persetujuan administrator.
CREATE TABLE IF NOT EXISTS registration_requests (
    id_registration BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    nama VARCHAR(100),
    pangkat VARCHAR(80),
    nip VARCHAR(30),
    satker_asal VARCHAR(150),
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    requested_role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (requested_role IN ('admin', 'editor', 'viewer', 'admin_ssdm', 'operator_polda', 'operator_satker')),
    approved_role VARCHAR(20) CHECK (approved_role IN ('admin', 'editor', 'viewer', 'admin_ssdm', 'operator_polda', 'operator_satker')),
    email_otp_hash CHAR(64),
    otp_expires_at TIMESTAMPTZ NOT NULL,
    email_verified_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users (id_user),
    reviewed_at TIMESTAMPTZ,
    review_note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_registration_status ON registration_requests (status, created_at);

-- Kompatibilitas database lama: registrasi baru tidak lagi membutuhkan email/OTP.
ALTER TABLE registration_requests ALTER COLUMN email DROP NOT NULL;
ALTER TABLE registration_requests ALTER COLUMN email_otp_hash DROP NOT NULL;
ALTER TABLE registration_requests ALTER COLUMN otp_expires_at DROP NOT NULL;
ALTER TABLE registration_requests ALTER COLUMN requested_role SET DEFAULT 'viewer';
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS approved_role VARCHAR(20);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS nama VARCHAR(100);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS pangkat VARCHAR(80);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS nip VARCHAR(30);
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS satker_asal VARCHAR(150);
ALTER TABLE pegawai ALTER COLUMN tanggal_masuk DROP NOT NULL;

-- Token reset password sekali pakai; hanya hash token yang disimpan.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id_reset BIGSERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES users (id_user) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (id_user);

-- Index untuk mempercepat pencarian berdasarkan nama.
CREATE INDEX IF NOT EXISTS idx_pegawai_nama ON pegawai (nama);
-- Index untuk mempercepat filter berdasarkan unit kerja.
CREATE INDEX IF NOT EXISTS idx_pegawai_unit ON pegawai (id_unit);
