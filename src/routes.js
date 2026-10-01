// Mengimpor Router untuk mengelompokkan endpoint API.
import { Router } from 'express';
// Mengimpor helper password, JWT, authentication, dan authorization.
import { comparePassword, hashPassword, signToken, authenticate, authorize } from './auth.js';
// Mengimpor helper query PostgreSQL.
import { query } from './db.js';
// Mengimpor schema validasi request.
import { employeeSchema, loginSchema, registerSchema, validate } from './validation.js';
// Membuat router yang akan dipasang di prefix /api/v1.
export const router = Router();
// Query dasar pegawai sekaligus mengambil nama dari tabel referensi.
const employeeSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, g.nama_pangkat FROM pegawai p JOIN unit_kerja u ON u.id_unit=p.id_unit JOIN jabatan j ON j.id_jabatan=p.id_jabatan JOIN golongan g ON g.id_golongan=p.id_golongan`;
// Endpoint registrasi user baru dengan role awal viewer.
router.post('/auth/register', async (req, res, next) => {
  try {
    // Memvalidasi username dan password dari request.
    const parsed = validate(registerSchema, req.body);
    // Menghentikan proses jika payload tidak valid.
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    // Mengambil data yang sudah dibersihkan oleh Zod.
    const { username, password } = parsed.data;
    // Menyimpan password sebagai hash dan selalu memberi role viewer.
    const result = await query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id_user, username, role', [username, await hashPassword(password), 'viewer']);
    // Mengembalikan user tanpa pernah mengirim password hash.
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    // Meneruskan error ke global error handler.
    return next(error);
  }
});
// Endpoint login untuk memperoleh JWT.
router.post('/auth/login', async (req, res, next) => {
  try {
    // Memvalidasi kredensial login.
    const parsed = validate(loginSchema, req.body);
    // Mengembalikan detail validation error jika input salah.
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    // Mengambil user berdasarkan username.
    const result = await query('SELECT * FROM users WHERE username=$1', [parsed.data.username]);
    // Menolak kredensial yang tidak cocok tanpa membocorkan detail.
    if (!result.rows[0] || !(await comparePassword(parsed.data.password, result.rows[0].password_hash))) return res.status(401).json({ error: 'Username atau password salah.' });
    // Mengembalikan token dan profil publik user.
    return res.json({ token: signToken(result.rows[0]), user: { id_user: result.rows[0].id_user, username: result.rows[0].username, role: result.rows[0].role } });
  } catch (error) {
    // Meneruskan error database ke global handler.
    return next(error);
  }
});
// Endpoint READ daftar pegawai, hanya dapat diakses user terautentikasi.
router.get('/pegawai', authenticate, async (req, res, next) => {
  try {
    // Menentukan halaman minimal 1.
    const page = Math.max(Number(req.query.page) || 1, 1);
    // Membatasi jumlah data per halaman maksimal 100.
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    // Menghitung posisi awal data.
    const offset = (page - 1) * limit;
    // Membentuk parameter pencarian wildcard untuk nama atau NIP.
    const search = `%${String(req.query.search || '').trim()}%`;
    // Mengambil data terurut terbaru dengan pagination parameterized.
    const rows = await query(`${employeeSelect} WHERE p.nama ILIKE $1 OR p.nip ILIKE $1 ORDER BY p.id_pegawai DESC LIMIT $2 OFFSET $3`, [search, limit, offset]);
    // Mengambil total data untuk metadata pagination.
    const total = await query('SELECT COUNT(*)::int AS total FROM pegawai WHERE nama ILIKE $1 OR nip ILIKE $1', [search]);
    // Mengembalikan data dan informasi pagination.
    return res.json({ data: rows.rows, pagination: { page, limit, total: total.rows[0].total } });
  } catch (error) {
    // Meneruskan error ke global handler.
    return next(error);
  }
});
// Endpoint READ detail satu pegawai berdasarkan ID.
router.get('/pegawai/:id', authenticate, async (req, res, next) => {
  try {
    // Mengambil satu record dan relasi referensinya.
    const result = await query(`${employeeSelect} WHERE p.id_pegawai=$1`, [req.params.id]);
    // Mengembalikan 404 jika record tidak ditemukan.
    if (!result.rows[0]) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });
    // Mengembalikan detail pegawai.
    return res.json(result.rows[0]);
  } catch (error) {
    // Meneruskan error ke global handler.
    return next(error);
  }
});
// Endpoint CREATE pegawai yang hanya boleh dipakai admin atau editor.
router.post('/pegawai', authenticate, authorize('admin', 'editor'), async (req, res, next) => {
  try {
    // Memvalidasi seluruh field pegawai.
    const parsed = validate(employeeSchema, req.body);
    // Mengembalikan error terstruktur jika validasi gagal.
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    // Mengambil nilai dalam urutan field schema.
    const values = Object.values(parsed.data);
    // Menyimpan pegawai dan mengembalikan record baru.
    const result = await query(`INSERT INTO pegawai (nip,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,id_atasan,status_pegawai,batas_usia_pensiun) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, values);
    // Status 201 menandakan resource berhasil dibuat.
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    // Meneruskan error database atau constraint.
    return next(error);
  }
});
// Endpoint UPDATE pegawai yang hanya boleh dipakai admin atau editor.
router.put('/pegawai/:id', authenticate, authorize('admin', 'editor'), async (req, res, next) => {
  try {
    // Memvalidasi payload update dengan schema yang sama.
    const parsed = validate(employeeSchema, req.body);
    // Mengembalikan error validasi sebelum query dijalankan.
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    // Menambahkan ID URL sebagai parameter terakhir query UPDATE.
    const values = [...Object.values(parsed.data), req.params.id];
    // Memperbarui data dan timestamp perubahan.
    const result = await query(`UPDATE pegawai SET nip=$1,nik=$2,nama=$3,jenis_kelamin=$4,tempat_lahir=$5,tanggal_lahir=$6,tanggal_masuk=$7,id_unit=$8,id_jabatan=$9,id_golongan=$10,id_atasan=$11,status_pegawai=$12,batas_usia_pensiun=$13,updated_at=NOW() WHERE id_pegawai=$14 RETURNING *`, values);
    // Mengembalikan 404 jika ID tidak ada.
    if (!result.rows[0]) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });
    // Mengembalikan record setelah perubahan.
    return res.json(result.rows[0]);
  } catch (error) {
    // Meneruskan error ke global handler.
    return next(error);
  }
});
// Endpoint DELETE yang sengaja dibatasi hanya untuk admin.
router.delete('/pegawai/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    // Menghapus record berdasarkan ID.
    const result = await query('DELETE FROM pegawai WHERE id_pegawai=$1', [req.params.id]);
    // Mengembalikan 404 jika tidak ada baris yang terhapus.
    if (!result.rowCount) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });
    // Status 204 menandakan penghapusan berhasil tanpa response body.
    return res.status(204).end();
  } catch (error) {
    // Meneruskan error ke global handler.
    return next(error);
  }
});
