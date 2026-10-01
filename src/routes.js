// Mengimpor Router untuk mengelompokkan endpoint API.
import { Router } from 'express';
// Mengimpor helper password, JWT, authentication, dan authorization.
import { comparePassword, hashPassword, signToken, authenticate, authorize } from './auth.js';
// Mengimpor helper query PostgreSQL.
import { query } from './db.js';
// Mengimpor schema validasi request.
import { employeeSchema, jobHistorySchema, loginSchema, personnelSchema, registerSchema, validate } from './validation.js';
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

// Query personel untuk domain Merit System, termasuk nama Satker dan referensi jabatan.
const personnelSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, g.nama_pangkat,
  s.kode_satker, s.nama_satker, s.tipe_satker
  FROM pegawai p
  JOIN unit_kerja u ON u.id_unit = p.id_unit
  JOIN jabatan j ON j.id_jabatan = p.id_jabatan
  JOIN golongan g ON g.id_golongan = p.id_golongan
  LEFT JOIN satker s ON s.id_satker = p.id_satker`;

// Role administrator dapat mengakses semua scope; role operator wajib memiliki scope.
const isAdministrator = (user) => ['admin', 'admin_ssdm'].includes(user.role);
// Role berikut boleh membuat atau mengubah data dalam scope yang dimiliki.
const canManagePersonnel = (user) => ['admin', 'admin_ssdm', 'editor', 'operator_polda', 'operator_satker'].includes(user.role);

// Memastikan personel berada dalam scope user sebelum data dibaca atau diubah.
async function assertPersonnelAccess(user, personnelId, requiredSatkerId = null) {
  if (isAdministrator(user)) return true;
  const params = [user.id_user, personnelId];
  const satkerFilter = requiredSatkerId ? ' AND p.id_satker = $3' : '';
  if (requiredSatkerId) params.push(requiredSatkerId);
  const result = await query(`SELECT 1 FROM pegawai p JOIN user_scope us ON us.id_satker = p.id_satker WHERE us.id_user = $1 AND p.id_pegawai = $2${satkerFilter}`, params);
  return Boolean(result.rows[0]);
}

// Memastikan Satker tujuan termasuk scope user saat membuat histori jabatan.
async function assertSatkerAccess(user, satkerId) {
  if (isAdministrator(user)) return true;
  const result = await query('SELECT 1 FROM user_scope WHERE id_user = $1 AND id_satker = $2', [user.id_user, satkerId]);
  return Boolean(result.rows[0]);
}

// Endpoint READ daftar personel versi domain Merit System.
router.get('/personel', authenticate, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;
    const search = `%${String(req.query.search || '').trim()}%`;
    const params = [search];
    let scope = '';
    if (!isAdministrator(req.user)) {
      params.push(req.user.id_user);
      scope = ` AND EXISTS (SELECT 1 FROM user_scope us WHERE us.id_user = $${params.length} AND us.id_satker = p.id_satker)`;
    }
    const rows = await query(`${personnelSelect} WHERE (p.nama ILIKE $1 OR p.nip ILIKE $1)${scope} ORDER BY p.nama ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = await query(`SELECT COUNT(*)::int AS total FROM pegawai p WHERE (p.nama ILIKE $1 OR p.nip ILIKE $1)${scope}`, params);
    return res.json({ data: rows.rows, meta: { page, limit, total: total.rows[0].total } });
  } catch (error) { return next(error); }
});

// Endpoint READ profil personel dengan jabatan aktif dan seluruh histori kronologis.
router.get('/personel/:id/profile', authenticate, async (req, res, next) => {
  try {
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const person = await query(`${personnelSelect} WHERE p.id_pegawai = $1`, [req.params.id]);
    if (!person.rows[0]) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
    const history = await query(`SELECT r.*, j.nama_jabatan, s.kode_satker, s.nama_satker, f.kode_fungsi, f.nama_fungsi, l.kode_level, l.nama_level, st.kode_status, st.nama_status
      FROM riwayat_jabatan r JOIN jabatan j ON j.id_jabatan = r.id_jabatan JOIN satker s ON s.id_satker = r.id_satker
      LEFT JOIN fungsi f ON f.id_fungsi = r.id_fungsi LEFT JOIN level_jabatan l ON l.id_level_jabatan = r.id_level_jabatan
      JOIN status_jabatan st ON st.id_status_jabatan = r.id_status_jabatan
      WHERE r.id_pegawai = $1 ORDER BY r.tanggal_mulai ASC, r.id_riwayat_jabatan ASC`, [req.params.id]);
    return res.json({ data: { personel: person.rows[0], riwayat_jabatan: history.rows } });
  } catch (error) { return next(error); }
});

// Endpoint CREATE personel dengan Satker wajib untuk pembatasan scope.
router.post('/personel', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    const parsed = validate(personnelSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    if (!(await assertSatkerAccess(req.user, parsed.data.id_satker))) return res.status(403).json({ error: 'Satker di luar scope Anda.' });
    const { id_satker, ...person } = parsed.data;
    const values = Object.values(person);
    const result = await query(`INSERT INTO pegawai (nip,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,id_atasan,status_pegawai,batas_usia_pensiun,id_satker)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [...values, id_satker]);
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});

// Endpoint UPDATE personel dengan pemeriksaan scope lama dan scope baru.
router.put('/personel/:id', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    const parsed = validate(personnelSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    if (!(await assertPersonnelAccess(req.user, req.params.id)) || !(await assertSatkerAccess(req.user, parsed.data.id_satker))) return res.status(403).json({ error: 'Personel atau Satker di luar scope Anda.' });
    const { id_satker, ...person } = parsed.data;
    const values = [...Object.values(person), id_satker, req.params.id];
    const result = await query(`UPDATE pegawai SET nip=$1,nik=$2,nama=$3,jenis_kelamin=$4,tempat_lahir=$5,tanggal_lahir=$6,tanggal_masuk=$7,id_unit=$8,id_jabatan=$9,id_golongan=$10,id_atasan=$11,status_pegawai=$12,batas_usia_pensiun=$13,id_satker=$14 WHERE id_pegawai=$15 RETURNING *`, values);
    if (!result.rows[0]) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
    return res.json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});

// Endpoint DELETE personel; foreign key histori menghapus histori terkait secara cascade.
router.delete('/personel/:id', authenticate, async (req, res, next) => {
  try {
    if (!isAdministrator(req.user)) return res.status(403).json({ error: 'Penghapusan personel hanya untuk administrator.' });
    const result = await query('DELETE FROM pegawai WHERE id_pegawai = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Endpoint READ semua histori jabatan personel secara kronologis.
router.get('/personel/:id/riwayat-jabatan', authenticate, async (req, res, next) => {
  try {
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query(`SELECT r.*, j.nama_jabatan, s.kode_satker, s.nama_satker, f.kode_fungsi, f.nama_fungsi, l.kode_level, l.nama_level, st.kode_status, st.nama_status
      FROM riwayat_jabatan r JOIN jabatan j ON j.id_jabatan = r.id_jabatan JOIN satker s ON s.id_satker = r.id_satker
      LEFT JOIN fungsi f ON f.id_fungsi = r.id_fungsi LEFT JOIN level_jabatan l ON l.id_level_jabatan = r.id_level_jabatan JOIN status_jabatan st ON st.id_status_jabatan = r.id_status_jabatan
      WHERE r.id_pegawai = $1 ORDER BY r.tanggal_mulai ASC, r.id_riwayat_jabatan ASC`, [req.params.id]);
    return res.json({ data: result.rows });
  } catch (error) { return next(error); }
});

// Endpoint CREATE histori jabatan dengan validasi scope dan rentang tanggal database.
router.post('/personel/:id/riwayat-jabatan', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    const parsed = validate(jobHistorySchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    if (!(await assertPersonnelAccess(req.user, req.params.id, parsed.data.id_satker))) return res.status(403).json({ error: 'Personel atau Satker di luar scope Anda.' });
    const { id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan } = parsed.data;
    const result = await query(`INSERT INTO riwayat_jabatan (id_pegawai,id_jabatan,id_satker,id_fungsi,id_level_jabatan,id_status_jabatan,tanggal_mulai,tanggal_selesai,keterangan,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.params.id, id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan, req.user.id_user]);
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});

// Endpoint UPDATE histori jabatan.
router.put('/personel/:id/riwayat-jabatan/:historyId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    const parsed = validate(jobHistorySchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    if (!(await assertPersonnelAccess(req.user, req.params.id, parsed.data.id_satker))) return res.status(403).json({ error: 'Personel atau Satker di luar scope Anda.' });
    const { id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan } = parsed.data;
    const result = await query(`UPDATE riwayat_jabatan SET id_jabatan=$1,id_satker=$2,id_fungsi=$3,id_level_jabatan=$4,id_status_jabatan=$5,tanggal_mulai=$6,tanggal_selesai=$7,keterangan=$8,updated_by=$9,updated_at=NOW()
      WHERE id_riwayat_jabatan=$10 AND id_pegawai=$11 RETURNING *`, [id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan, req.user.id_user, req.params.historyId, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Riwayat jabatan tidak ditemukan.' });
    return res.json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});

// Endpoint DELETE histori jabatan; administrator atau operator ber-scope dapat menghapus.
router.delete('/personel/:id/riwayat-jabatan/:historyId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('DELETE FROM riwayat_jabatan WHERE id_riwayat_jabatan = $1 AND id_pegawai = $2', [req.params.historyId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Riwayat jabatan tidak ditemukan.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
