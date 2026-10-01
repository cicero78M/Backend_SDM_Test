CREATE TABLE IF NOT EXISTS unit_kerja (
    id_unit INTEGER PRIMARY KEY,
    nama_unit VARCHAR(100) NOT NULL,
    id_unit_induk INTEGER REFERENCES unit_kerja (id_unit)
);
CREATE TABLE IF NOT EXISTS golongan (
    id_golongan INTEGER PRIMARY KEY,
    kode_golongan VARCHAR(5) NOT NULL UNIQUE,
    nama_pangkat VARCHAR(50) NOT NULL
);
CREATE TABLE IF NOT EXISTS jabatan (
    id_jabatan INTEGER PRIMARY KEY,
    nama_jabatan VARCHAR(100) NOT NULL,
    jenis_jabatan VARCHAR(20) NOT NULL
);
CREATE TABLE IF NOT EXISTS pegawai (
    id_pegawai SERIAL PRIMARY KEY,
    nip CHAR(18) NOT NULL UNIQUE,
    nik CHAR(16) NOT NULL UNIQUE,
    nama VARCHAR(100) NOT NULL,
    jenis_kelamin CHAR(1) NOT NULL CHECK (jenis_kelamin IN ('L','P')),
    tempat_lahir VARCHAR(50), tanggal_lahir DATE NOT NULL, tanggal_masuk DATE NOT NULL,
    id_unit INTEGER NOT NULL REFERENCES unit_kerja (id_unit), id_jabatan INTEGER NOT NULL REFERENCES jabatan (id_jabatan), id_golongan INTEGER NOT NULL REFERENCES golongan (id_golongan), id_atasan INTEGER REFERENCES pegawai (id_pegawai),
    status_pegawai VARCHAR(15) NOT NULL DEFAULT 'AKTIF', batas_usia_pensiun SMALLINT NOT NULL DEFAULT 58,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (tanggal_masuk > tanggal_lahir)
);
CREATE TABLE IF NOT EXISTS users (
    id_user SERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pegawai_nama ON pegawai (nama);
CREATE INDEX IF NOT EXISTS idx_pegawai_unit ON pegawai (id_unit);
