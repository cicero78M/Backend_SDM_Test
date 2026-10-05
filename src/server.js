// Mengimpor framework HTTP Express.
import express from 'express';
// Mengimpor middleware pembatasan jumlah request.
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
// Mengimpor loader environment variable.
import dotenv from 'dotenv';
// Mengimpor seluruh route API.
import { router } from './routes/index.js';
import { getRedisClient, redisStatus } from './cache.js';
// Memuat konfigurasi sebelum server dibuat.
dotenv.config();
// Membuat instance aplikasi Express.
const app = express();
// Backend berjalan di belakang Nginx, sehingga alamat klien dari X-Forwarded-For dapat dipercaya satu hop.
app.set('trust proxy', 1);
// Menentukan port dari environment atau memakai 3000.
const port = Number(process.env.PORT || 3000);
// Mengaktifkan parser JSON dengan batas payload 100 KB.
app.use(express.json({ limit: '100kb' }));
// Redis dipakai sebagai store rate limit agar counter konsisten antar proses PM2.
// Jika Redis belum tersedia, aplikasi tetap start dengan store memori lokal.
let rateLimitStore;
try {
  const redis = await getRedisClient();
  if (redis) {
    rateLimitStore = new RedisStore({
      sendCommand: (...args) => redis.sendCommand(args),
    });
  }
} catch (error) {
  console.error('Redis rate-limit fallback:', error.message);
}

// Mencegah abuse dengan maksimum 300 request setiap 15 menit per IP.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  ...(rateLimitStore ? { store: rateLimitStore } : {}),
  // Gangguan Redis tidak boleh membuat seluruh API gagal diload.
  passOnStoreError: true,
}));
// Endpoint health check untuk monitoring dan deployment.
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  redis: redisStatus(),
  rateLimit: { store: rateLimitStore ? 'redis' : 'memory' },
}));
// Memasang route bisnis pada prefix versi API.
app.use('/api/v1', router);
// Menangani semua URL yang tidak terdaftar.
app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
// Menangani error dari seluruh route secara terpusat.
app.use((error, _req, res, _next) => {
  // Mencatat detail error di server tanpa mengirim stack trace ke client.
  console.error(error);
  // Parser JSON Express menandai body rusak dan body terlalu besar dengan type khusus.
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format JSON request tidak valid.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Ukuran request terlalu besar.' });
  // PostgreSQL code 23505 berarti pelanggaran unique constraint.
  if (error.code === '23505') return res.status(409).json({ error: 'Data duplikat.' });
  // PostgreSQL code 23503 berarti foreign key tidak valid.
  if (error.code === '23503') return res.status(400).json({ error: 'Referensi data tidak valid.' });
  // PostgreSQL code 22P02 berarti format nilai tidak sesuai tipe kolom.
  if (error.code === '22P02') return res.status(400).json({ error: 'Format data tidak valid.' });
  if (error.code === 'REDIS_LOCK_BUSY') return res.status(409).json({ error: error.message });
  if (error.statusCode || error.status) return res.status(error.statusCode || error.status).json({ error: error.publicMessage || error.message || 'Request tidak dapat diproses.' });
  // Semua error lain dikembalikan sebagai internal server error generik.
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});
// Menjalankan server dan memberi informasi URL lokal.
app.listen(port, '127.0.0.1', () => console.log(`REST API berjalan di http://localhost:${port}`));
