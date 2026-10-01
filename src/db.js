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

// Menjalankan beberapa query sebagai satu unit perubahan yang konsisten.
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
