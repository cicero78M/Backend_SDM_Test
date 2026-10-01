// Mengimpor framework HTTP Express.
import express from 'express';
// Mengimpor middleware pembatasan jumlah request.
import rateLimit from 'express-rate-limit';
// Mengimpor loader environment variable.
import dotenv from 'dotenv';
// Mengimpor seluruh route API.
import { router } from './routes.js';
// Memuat konfigurasi sebelum server dibuat.
dotenv.config();
// Membuat instance aplikasi Express.
const app = express();
// Menentukan port dari environment atau memakai 3000.
const port = Number(process.env.PORT || 3000);
// Mengaktifkan parser JSON dengan batas payload 100 KB.
app.use(express.json({ limit: '100kb' }));
// Mencegah abuse dengan maksimum 300 request setiap 15 menit per IP.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
// Endpoint health check untuk monitoring dan deployment.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Memasang route bisnis pada prefix versi API.
app.use('/api/v1', router);
// Menangani semua URL yang tidak terdaftar.
app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
// Menangani error dari seluruh route secara terpusat.
app.use((error, _req, res, _next) => {
  // Mencatat detail error di server tanpa mengirim stack trace ke client.
  console.error(error);
  // PostgreSQL code 23505 berarti pelanggaran unique constraint.
  if (error.code === '23505') return res.status(409).json({ error: 'Data duplikat.' });
  // PostgreSQL code 23503 berarti foreign key tidak valid.
  if (error.code === '23503') return res.status(400).json({ error: 'Referensi data tidak valid.' });
  // Semua error lain dikembalikan sebagai internal server error generik.
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});
// Menjalankan server dan memberi informasi URL lokal.
app.listen(port, () => console.log(`REST API berjalan di http://localhost:${port}`));
