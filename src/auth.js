// Mengimpor bcrypt untuk hashing dan verifikasi password.
import bcrypt from 'bcryptjs';
// Mengimpor JSON Web Token untuk authentication berbasis token.
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
// Mengimpor helper query untuk memeriksa user di database.
import { query } from './db.js';
// Mengambil secret untuk menandatangani JWT.
const secret = process.env.JWT_SECRET;
// Menghentikan aplikasi jika secret belum aman dikonfigurasi.
if (!secret || secret.length < 32) throw new Error('JWT_SECRET wajib diisi dan minimal 32 karakter.');
// Menghasilkan hash password dengan cost factor 12.
export const hashPassword = (password) => bcrypt.hash(password, 12);
// Membandingkan password plain text dengan hash tersimpan.
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);
// Password reset token hanya disimpan sebagai SHA-256 hash di database.
export const hashResetToken = (token) => {
  return createHash('sha256').update(token).digest('hex');
};
// Membuat token yang menyimpan identitas dan role user.
export const signToken = (user) => jwt.sign({ sub: user.id_user, username: user.username, role: user.role }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
// Middleware yang memastikan request memiliki token valid dan user aktif.
export async function authenticate(req, res, next) {
  try {
    // Mengambil header Authorization dari request.
    const header = req.headers.authorization || '';
    // Menolak request yang tidak memakai format Bearer.
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Token Bearer wajib disertakan.' });
    // Memverifikasi signature dan masa berlaku token.
    const payload = jwt.verify(header.slice(7), secret);
    // Mengambil status terbaru user dari database.
    const { rows } = await query('SELECT id_user, username, role, is_active FROM users WHERE id_user = $1', [payload.sub]);
    // Menolak user yang tidak ada atau sudah dinonaktifkan.
    if (!rows[0]?.is_active) return res.status(401).json({ error: 'User tidak aktif atau tidak ditemukan.' });
    // Menyimpan identitas user agar dapat digunakan middleware berikutnya.
    req.user = rows[0];
    // Melanjutkan request ke controller/route.
    return next();
  } catch {
    // Menyamakan response untuk token invalid dan token expired.
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}
// Middleware pembatasan role sesuai permission endpoint.
export const authorize = (...roles) => (req, res, next) => roles.includes(req.user.role)
  ? next()
  : res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
