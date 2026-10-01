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
    -- NIP 18 digit dan tidak boleh sama.
    nip CHAR(18) NOT NULL UNIQUE,
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
    tanggal_masuk DATE NOT NULL,
    -- Foreign key ke unit kerja.
    id_unit INTEGER NOT NULL REFERENCES unit_kerja (id_unit),
    -- Foreign key ke jabatan.
    id_jabatan INTEGER NOT NULL REFERENCES jabatan (id_jabatan),
    -- Foreign key ke golongan.
    id_golongan INTEGER NOT NULL REFERENCES golongan (id_golongan),
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
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    -- Admin dapat menonaktifkan user tanpa menghapus histori.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Waktu user dibuat.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk mempercepat pencarian berdasarkan nama.
CREATE INDEX IF NOT EXISTS idx_pegawai_nama ON pegawai (nama);
-- Index untuk mempercepat filter berdasarkan unit kerja.
CREATE INDEX IF NOT EXISTS idx_pegawai_unit ON pegawai (id_unit);
