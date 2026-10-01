// Mengimpor client PostgreSQL untuk koneksi database.
import pg from 'pg';
// Mengimpor dotenv agar konfigurasi dibaca dari file .env.
import dotenv from 'dotenv';
// Memuat DATABASE_URL dan konfigurasi environment lainnya.
dotenv.config();
// Mengambil class Pool dari package pg.
const { Pool } = pg;
// Membuat connection pool agar koneksi dapat digunakan kembali.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Menjalankan query dengan parameterized query untuk mencegah SQL injection.
export function query(text, params) {
  // Mengembalikan Promise hasil query kepada pemanggil.
  return pool.query(text, params);
}
