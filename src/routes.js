// Mengimpor Router untuk mengelompokkan endpoint API.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
// Mengimpor helper password, JWT, authentication, dan authorization.
import { comparePassword, hashPassword, hashResetToken, signToken, authenticate, authorize } from './auth.js';
// Mengimpor helper query PostgreSQL.
import { query, withTransaction } from './db.js';
import { assertFunctionBelongsToSatker, assertPersonnelAccess, assertSatkerAccess, assertUnitBelongsToSatker, canManagePersonnel, isAdministrator, writeAudit } from './access.js';
import { sendRegistrationOtp } from './email.js';
import { generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES } from './otp.js';
// Mengimpor schema validasi request.
import { adminResetPasswordSchema, approvalSchema, changePasswordSchema, educationSchema, employeeSchema, forgotPasswordSchema, jobHistorySchema, loginSchema, meritAssessmentSchema, personnelSchema, registerResendOtpSchema, registerSchema, registerVerifyEmailSchema, resetPasswordSchema, roleUpdateSchema, trainingSchema, userScopeSchema, userStatusSchema, validate } from './validation.js';
// Membuat router yang akan dipasang di prefix /api/v1.
export const router = Router();
// Query dasar pegawai sekaligus mengambil nama dari tabel referensi.
const employeeSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, COALESCE(p.pangkat, g.nama_pangkat) AS nama_pangkat FROM pegawai p JOIN unit_kerja u ON u.id_unit=p.id_unit JOIN jabatan j ON j.id_jabatan=p.id_jabatan LEFT JOIN golongan g ON g.id_golongan=p.id_golongan`;
// Endpoint registrasi membuat permintaan pending dan mengirim OTP validasi email.
router.post('/auth/register', async (req, res, next) => {
  try {
    const parsed = validate(registerSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    const { username, email, nama, pangkat, nip, satker_asal, password } = parsed.data;
    const otp = generateOtp();
    const result = await query(`INSERT INTO registration_requests (username,email,nama,pangkat,nip,satker_asal,password_hash,requested_role,email_otp_hash,otp_expires_at,otp_last_sent_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'viewer',$8,NOW()+($9 * INTERVAL '1 minute'),NOW())
      RETURNING id_registration, username, email, nama, pangkat, nip, satker_asal, requested_role, status, otp_expires_at`, [username, email, nama, pangkat, nip, satker_asal, await hashPassword(password), hashOtp(otp), OTP_TTL_MINUTES]);
    try {
      await sendRegistrationOtp({ email, otp, expiresMinutes: OTP_TTL_MINUTES });
    } catch (mailError) {
      mailError.statusCode = 503;
      mailError.publicMessage = 'Pendaftaran tersimpan, tetapi email OTP belum dapat dikirim. Silakan coba kirim ulang OTP.';
      throw mailError;
    }
    return res.status(201).json({ ...result.rows[0], message: 'OTP validasi email telah dikirim.' });
  } catch (error) { return next(error); }
});
// Memvalidasi OTP email sebelum pendaftaran dapat diproses admin.
router.post('/auth/register/verify-email', async (req, res, next) => {
  try {
    const parsed = validate(registerVerifyEmailSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi OTP gagal.', details: parsed.error });
    const pending = await query(`SELECT id_registration, email_verified_at, email_otp_hash, otp_expires_at, otp_attempts
      FROM registration_requests WHERE id_registration=$1 AND status='pending'`, [parsed.data.registration_id]);
    const item = pending.rows[0];
    if (!item) return res.status(400).json({ error: 'Permintaan registrasi tidak valid atau sudah diproses.' });
    if (item.email_verified_at) return res.status(409).json({ error: 'Email sudah tervalidasi.' });
    if (item.otp_attempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ error: 'Batas percobaan OTP tercapai. Silakan kirim ulang OTP.' });
    if (!item.otp_expires_at || new Date(item.otp_expires_at) <= new Date()) return res.status(400).json({ error: 'OTP sudah kedaluwarsa. Silakan kirim ulang OTP.' });
    if (hashOtp(parsed.data.otp) !== item.email_otp_hash) {
      await query('UPDATE registration_requests SET otp_attempts=otp_attempts+1 WHERE id_registration=$1', [parsed.data.registration_id]);
      return res.status(400).json({ error: 'OTP tidak valid.' });
    }
    await query(`UPDATE registration_requests SET email_verified_at=NOW(), email_otp_hash=NULL, otp_attempts=0
      WHERE id_registration=$1 AND status='pending'`, [parsed.data.registration_id]);
    return res.json({ message: 'Email berhasil divalidasi. Pendaftaran menunggu approval admin.' });
  } catch (error) { return next(error); }
});
// Mengirim ulang OTP dengan cooldown untuk mencegah abuse email.
router.post('/auth/register/resend-otp', async (req, res, next) => {
  try {
    const parsed = validate(registerResendOtpSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Permintaan OTP tidak valid.', details: parsed.error });
    const pending = await query(`SELECT id_registration, email, email_verified_at, otp_last_sent_at
      FROM registration_requests WHERE id_registration=$1 AND status='pending'`, [parsed.data.registration_id]);
    const item = pending.rows[0];
    if (!item) return res.status(404).json({ error: 'Permintaan registrasi tidak ditemukan.' });
    if (item.email_verified_at) return res.status(409).json({ error: 'Email sudah tervalidasi.' });
    if (item.otp_last_sent_at && (Date.now() - new Date(item.otp_last_sent_at).getTime()) < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      return res.status(429).json({ error: `Tunggu ${OTP_RESEND_COOLDOWN_SECONDS} detik sebelum meminta OTP lagi.` });
    }
    const otp = generateOtp();
    await query(`UPDATE registration_requests SET email_otp_hash=$1, otp_expires_at=NOW()+($2 * INTERVAL '1 minute'), otp_attempts=0, otp_last_sent_at=NOW()
      WHERE id_registration=$3 AND status='pending'`, [hashOtp(otp), OTP_TTL_MINUTES, parsed.data.registration_id]);
    try {
      await sendRegistrationOtp({ email: item.email, otp, expiresMinutes: OTP_TTL_MINUTES });
    } catch (mailError) {
      mailError.statusCode = 503;
      mailError.publicMessage = 'OTP baru belum dapat dikirim. Silakan coba lagi nanti.';
      throw mailError;
    }
    return res.json({ message: 'OTP baru telah dikirim.' });
  } catch (error) { return next(error); }
});
// Admin pertama melihat semua pendaftaran yang menunggu keputusan.
router.get('/auth/registrations/pending', authenticate, authorize('admin'), async (req, res, next) => {
  try { const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50); const offset = (page - 1) * limit; const total = await query("SELECT COUNT(*)::int AS total FROM registration_requests WHERE status='pending' AND email_verified_at IS NOT NULL"); const result = await query(`SELECT id_registration, username, email, email_verified_at, nama, pangkat, nip, satker_asal, requested_role, created_at FROM registration_requests WHERE status='pending' AND email_verified_at IS NOT NULL ORDER BY CASE requested_role WHEN 'admin' THEN 1 WHEN 'admin_ssdm' THEN 2 WHEN 'operator_polda' THEN 3 WHEN 'operator_satker' THEN 4 WHEN 'editor' THEN 5 ELSE 6 END, username ASC LIMIT $1 OFFSET $2`, [limit, offset]); return res.json({ data: result.rows, meta: { page, limit, total: total.rows[0].total } }); } catch (error) { return next(error); }
});
// Riwayat seluruh keputusan approval beserta aktor yang mengambil keputusan.
router.get('/auth/registrations/history', authenticate, authorize('admin'), async (req, res, next) => {
  try { const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50); const offset = (page - 1) * limit; const total = await query("SELECT COUNT(*)::int AS total FROM registration_requests WHERE status IN ('approved','rejected')"); const result = await query(`SELECT r.id_registration, r.username, r.nama, r.pangkat, r.nip, r.satker_asal, r.requested_role, r.approved_role, r.status, r.reviewed_at, r.review_note, u.username AS reviewer_username FROM registration_requests r LEFT JOIN users u ON u.id_user = r.reviewed_by WHERE r.status IN ('approved','rejected') ORDER BY CASE r.requested_role WHEN 'admin' THEN 1 WHEN 'admin_ssdm' THEN 2 WHEN 'operator_polda' THEN 3 WHEN 'operator_satker' THEN 4 WHEN 'editor' THEN 5 ELSE 6 END, r.reviewed_at DESC, r.username ASC LIMIT $1 OFFSET $2`, [limit, offset]); return res.json({ data: result.rows, meta: { page, limit, total: total.rows[0].total } }); } catch (error) { return next(error); }
});
// Daftar akun yang sudah aktif/disetujui untuk dikelola admin pertama.
router.get('/auth/users/approved', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
  try { const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50); const offset = (page - 1) * limit; const total = await query('SELECT COUNT(*)::int AS total FROM users'); const result = await query('SELECT u.id_user, u.username, u.role, u.is_active, u.created_at, r.nama, r.pangkat, r.nip, r.satker_asal FROM users u LEFT JOIN registration_requests r ON r.username=u.username AND r.status=\'approved\' ORDER BY u.is_active DESC, CASE u.role WHEN \'admin\' THEN 1 WHEN \'admin_ssdm\' THEN 2 WHEN \'operator_polda\' THEN 3 WHEN \'operator_satker\' THEN 4 WHEN \'editor\' THEN 5 ELSE 6 END, u.username ASC LIMIT $1 OFFSET $2', [limit, offset]); return res.json({ data: result.rows, meta: { page, limit, total: total.rows[0].total } }); } catch (error) { return next(error); }
});
// Admin melihat scope Satker yang melekat pada user.
router.get('/auth/users/:id/scopes', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
  try {
    const result = await query(`SELECT u.id_user, u.username, s.id_satker, s.kode_satker, s.nama_satker, s.tipe_satker
      FROM users u LEFT JOIN user_scope us ON us.id_user = u.id_user LEFT JOIN satker s ON s.id_satker = us.id_satker
      WHERE u.id_user=$1 ORDER BY s.nama_satker ASC`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    return res.json({ data: result.rows.filter((row) => row.id_satker != null) });
  } catch (error) { return next(error); }
});
// Admin mengganti seluruh daftar scope Satker user dan mencatat perubahannya.
router.put('/auth/users/:id/scopes', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
  try {
    const parsed = validate(userScopeSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Scope tidak valid.', details: parsed.error });
    const user = await query('SELECT id_user, username FROM users WHERE id_user=$1', [req.params.id]);
    if (!user.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    const satkers = await query('SELECT id_satker FROM satker WHERE is_active=true AND id_satker = ANY($1::int[])', [parsed.data.id_satker]);
    if (satkers.rowCount !== parsed.data.id_satker.length) return res.status(400).json({ error: 'Salah satu Satker tidak ditemukan atau tidak aktif.' });
    await withTransaction(async (client) => {
      await client.query('DELETE FROM user_scope WHERE id_user=$1', [req.params.id]);
      for (const satkerId of parsed.data.id_satker) await client.query('INSERT INTO user_scope (id_user,id_satker) VALUES ($1,$2)', [req.params.id, satkerId]);
    });
    await query(`INSERT INTO audit_log (id_user, action, resource, resource_id, metadata) VALUES ($1, 'UPDATE', 'users.scope', $2, $3)`, [req.user.id_user, String(req.params.id), JSON.stringify({ id_satker: parsed.data.id_satker })]);
    return res.json({ message: 'Scope user berhasil diperbarui.', data: { id_user: Number(req.params.id), id_satker: parsed.data.id_satker } });
  } catch (error) { return next(error); }
});
// Promote/demote role akun aktif hanya dapat dilakukan admin pertama.
router.patch('/auth/users/:id/role', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
  try { const parsed = validate(roleUpdateSchema, req.body); if (parsed.error) return res.status(400).json({ error: 'Role tidak valid.', details: parsed.error }); if (Number(req.params.id) === req.user.id_user && parsed.data.role !== 'admin') return res.status(409).json({ error: 'Admin pertama tidak dapat menurunkan role dirinya sendiri.' }); const result = await query('UPDATE users SET role=$1 WHERE id_user=$2 AND is_active=true RETURNING id_user, username, role, is_active', [parsed.data.role, req.params.id]); if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' }); return res.json({ message: 'Role user berhasil diperbarui.', user: result.rows[0] }); } catch (error) { return next(error); }
});
router.patch('/auth/users/:id/status', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
  try {
    const parsed = validate(userStatusSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Status user tidak valid.', details: parsed.error });
    if (Number(req.params.id) === req.user.id_user) return res.status(409).json({ error: 'Admin tidak dapat menonaktifkan atau mengaktifkan dirinya sendiri.' });
    const result = await query('UPDATE users SET is_active=$1 WHERE id_user=$2 RETURNING id_user, username, role, is_active', [parsed.data.is_active, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    await query(`INSERT INTO audit_log (id_user, action, resource, resource_id, metadata) VALUES ($1, 'UPDATE', 'users.status', $2, $3)`, [req.user.id_user, String(req.params.id), JSON.stringify({ is_active: parsed.data.is_active, reason: parsed.data.reason || null })]);
    return res.json({ message: parsed.data.is_active ? 'User diaktifkan.' : 'User dinonaktifkan.', user: result.rows[0] });
  } catch (error) { return next(error); }
});
// Admin menyetujui atau menolak pendaftaran. Approval membuat akun aktif.
router.patch('/auth/registrations/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const parsed = validate(approvalSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    const pending = await query(`SELECT * FROM registration_requests WHERE id_registration=$1 AND status='pending'`, [req.params.id]);
    if (!pending.rows[0]) return res.status(404).json({ error: 'Permintaan pendaftaran tidak ditemukan.' });
    const item = pending.rows[0];
    if (!item.email_verified_at) return res.status(409).json({ error: 'Email pendaftar belum tervalidasi.' });
    if (parsed.data.decision === 'approve') {
      const created = await query(`INSERT INTO users (username,email,email_verified,password_hash,role) VALUES ($1,$2,TRUE,$3,$4) RETURNING id_user, username, email, role, is_active`, [item.username, item.email, item.password_hash, parsed.data.approved_role]);
      await query(`UPDATE registration_requests SET status='approved', approved_role=$1, reviewed_by=$2, reviewed_at=NOW(), review_note=$3 WHERE id_registration=$4`, [parsed.data.approved_role, req.user.id_user, parsed.data.note || null, req.params.id]);
      return res.json({ message: 'Pendaftaran disetujui.', user: created.rows[0] });
    }
    await query(`UPDATE registration_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2 WHERE id_registration=$3`, [req.user.id_user, parsed.data.note || null, req.params.id]);
    return res.json({ message: 'Pendaftaran ditolak.' });
  } catch (error) { return next(error); }
});
// Endpoint login untuk memperoleh JWT.
router.post('/auth/login', async (req, res, next) => {
  try {
    // Memvalidasi kredensial login.
    const parsed = validate(loginSchema, req.body);
    // Mengembalikan detail validation error jika input salah.
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    // User yang baru mendaftar belum memiliki akun aktif sampai disetujui admin pertama.
    const pending = await query("SELECT id_registration FROM registration_requests WHERE username=$1 AND status='pending'", [parsed.data.username]);
    if (pending.rows[0]) return res.status(403).json({ error: 'Registrasi Anda masih menunggu approval admin pertama.', code: 'PENDING_APPROVAL' });
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
// Mengembalikan profil user dari token yang sedang aktif.
router.get('/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
// Mengganti password dengan verifikasi password lama.
router.put('/auth/me/password', authenticate, async (req, res, next) => {
  try {
    const parsed = validate(changePasswordSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    const current = await query('SELECT password_hash FROM users WHERE id_user=$1', [req.user.id_user]);
    if (!current.rows[0] || !(await comparePassword(parsed.data.current_password, current.rows[0].password_hash))) return res.status(401).json({ error: 'Password lama salah.' });
    await query('UPDATE users SET password_hash=$1 WHERE id_user=$2', [await hashPassword(parsed.data.new_password), req.user.id_user]);
    await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id_user=$1 AND used_at IS NULL', [req.user.id_user]);
    return res.json({ message: 'Password berhasil diperbarui.' });
  } catch (error) { return next(error); }
});
// Membuat token lupa password. Pada prototype token dikembalikan agar dapat dipakai tanpa email provider.
router.post('/auth/forgot-password', async (req, res, next) => {
  try {
    const parsed = validate(forgotPasswordSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    const result = await query('SELECT id_user FROM users WHERE username=$1 AND is_active=TRUE', [parsed.data.username]);
    const response = { message: 'Jika akun aktif ditemukan, token reset telah dibuat dan berlaku 30 menit.' };
    if (!result.rows[0]) return res.json(response);
    const token = randomBytes(32).toString('hex');
    await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id_user=$1 AND used_at IS NULL', [result.rows[0].id_user]);
    await query('INSERT INTO password_reset_tokens (id_user, token_hash, expires_at) VALUES ($1,$2,NOW()+INTERVAL \'30 minutes\')', [result.rows[0].id_user, hashResetToken(token)]);
    return res.json({ ...response, reset_token: token, prototype_only: true });
  } catch (error) { return next(error); }
});
// Mereset password memakai token satu kali yang belum kedaluwarsa.
router.post('/auth/reset-password', async (req, res, next) => {
  try {
    const parsed = validate(resetPasswordSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    const result = await query('SELECT id_reset, id_user FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()', [hashResetToken(parsed.data.token)]);
    if (!result.rows[0]) return res.status(400).json({ error: 'Token reset tidak valid atau sudah kedaluwarsa.' });
    await query('UPDATE users SET password_hash=$1 WHERE id_user=$2', [await hashPassword(parsed.data.new_password), result.rows[0].id_user]);
    await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id_reset=$1', [result.rows[0].id_reset]);
    return res.json({ message: 'Password berhasil direset. Silakan login kembali.' });
  } catch (error) { return next(error); }
});
// Admin dapat menetapkan password baru user tanpa mengetahui password lama.
router.put('/auth/users/:id/password', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
  try {
    const parsed = validate(adminResetPasswordSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    const result = await query('UPDATE users SET password_hash=$1 WHERE id_user=$2 RETURNING id_user, username, role', [await hashPassword(parsed.data.new_password), req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id_user=$1 AND used_at IS NULL', [req.params.id]);
    return res.json({ message: 'Password user berhasil direset.', user: result.rows[0] });
  } catch (error) { return next(error); }
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
    const { nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, id_golongan, pangkat, id_atasan, status_pegawai, batas_usia_pensiun } = parsed.data;
    // Menyimpan pegawai dan mengembalikan record baru.
    const result = await query(`INSERT INTO pegawai (nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,id_atasan,status_pegawai,batas_usia_pensiun) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,id_atasan,status_pegawai,batas_usia_pensiun]);
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
    const { nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, id_golongan, pangkat, id_atasan, status_pegawai, batas_usia_pensiun } = parsed.data;
    // Memperbarui data dan timestamp perubahan.
    const result = await query(`UPDATE pegawai SET nip=$1,jenis_personel=$2,jenis_identitas=$3,nik=$4,nama=$5,jenis_kelamin=$6,tempat_lahir=$7,tanggal_lahir=$8,tanggal_masuk=$9,id_unit=$10,id_jabatan=$11,id_golongan=$12,pangkat=$13,id_atasan=$14,status_pegawai=$15,batas_usia_pensiun=$16,updated_at=NOW() WHERE id_pegawai=$17 RETURNING *`, [nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,id_atasan,status_pegawai,batas_usia_pensiun,req.params.id]);
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
const personnelSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, COALESCE(p.pangkat, g.nama_pangkat) AS nama_pangkat,
  s.kode_satker, s.nama_satker, s.tipe_satker, parent.id_satker AS id_satker_induk,
  parent.kode_satker AS kode_satker_induk, parent.nama_satker AS nama_satker_induk,
  parent.tipe_satker AS tipe_satker_induk
  FROM pegawai p
  JOIN unit_kerja u ON u.id_unit = p.id_unit
  JOIN jabatan j ON j.id_jabatan = p.id_jabatan
  LEFT JOIN golongan g ON g.id_golongan = p.id_golongan
  LEFT JOIN satker s ON s.id_satker = p.id_satker
  LEFT JOIN satker parent ON parent.id_satker = s.id_satker_induk`;

// Master karier dibaca oleh seluruh user terautentikasi; perubahan master akan
// menjadi tahap administrasi terpisah agar tidak tercampur dengan CRUD personel.
router.get('/master/satker', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active FROM satker WHERE is_active=true ORDER BY nama_satker ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/satker/tree', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active FROM satker ORDER BY COALESCE(id_satker_induk, 0), nama_satker ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/fungsi', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_fungsi, kode_fungsi, nama_fungsi, is_active FROM fungsi WHERE is_active=true ORDER BY nama_fungsi ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/satker/:id/fungsi', authenticate, async (req, res, next) => {
  try { const result = await query(`SELECT f.id_fungsi, f.kode_fungsi, f.nama_fungsi, sf.is_active FROM fungsi f JOIN satker_fungsi sf ON sf.id_fungsi=f.id_fungsi WHERE sf.id_satker=$1 AND sf.is_active=true AND f.is_active=true ORDER BY f.nama_fungsi ASC`, [req.params.id]); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/satker/:id/unit-kerja', authenticate, async (req, res, next) => {
  try { const result = await query('SELECT id_unit, kode_unit, nama_unit, tipe_unit, id_unit_induk, is_active FROM unit_kerja u WHERE id_satker=$1 AND is_active=true AND (COALESCE(is_placeholder,false)=false OR NOT EXISTS (SELECT 1 FROM unit_kerja real_u WHERE real_u.id_satker=u.id_satker AND COALESCE(real_u.is_placeholder,false)=false)) ORDER BY nama_unit ASC', [req.params.id]); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/level-jabatan', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_level_jabatan, kode_level, nama_level, urutan, is_active FROM level_jabatan WHERE is_active=true ORDER BY urutan ASC, nama_level ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/status-jabatan', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_status_jabatan, kode_status, nama_status, is_active FROM status_jabatan WHERE is_active=true ORDER BY nama_status ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/unit-kerja', authenticate, async (req, res, next) => {
  try { const satkerId = Number(req.query.satker_id); const result = satkerId ? await query('SELECT id_unit, kode_unit, nama_unit, tipe_unit, id_unit_induk, is_active FROM unit_kerja u WHERE id_satker=$1 AND is_active=true AND (COALESCE(is_placeholder,false)=false OR NOT EXISTS (SELECT 1 FROM unit_kerja real_u WHERE real_u.id_satker=u.id_satker AND COALESCE(real_u.is_placeholder,false)=false)) ORDER BY nama_unit ASC', [satkerId]) : await query('SELECT id_unit, nama_unit FROM unit_kerja WHERE is_active=true ORDER BY nama_unit ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/jabatan', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_jabatan, nama_jabatan, jenis_jabatan FROM jabatan ORDER BY nama_jabatan ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/master/golongan', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_golongan, kode_golongan, nama_pangkat FROM golongan ORDER BY id_golongan ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});

// Ringkasan dashboard personel. Agregasi dilakukan di database agar seluruh
// sumber legacy/domain dan pembatasan scope tetap konsisten di backend.
router.get('/dashboard/overview', authenticate, async (req, res, next) => {
  try {
    const params = [];
    const scope = alias => {
      if (isAdministrator(req.user)) return '';
      params.push(req.user.id_user);
      return ` AND EXISTS (SELECT 1 FROM user_scope us WHERE us.id_user=$${params.length}::int AND us.id_satker=${alias}.id_satker)`;
    };
    const peopleWhere = `WHERE 1=1${scope('p')}`;
    const personScope = isAdministrator(req.user) ? '' : ' AND EXISTS (SELECT 1 FROM user_scope us WHERE us.id_user=$1::int AND us.id_satker=p.id_satker)';
    const [total, status, education, training, mutation, service, retirement, positionGroup, ageGroup, rankGroup, polriRankGroup, asnRankGroup, dataQuality, stagingQuality] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM pegawai p ${peopleWhere}`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT COALESCE(status_pegawai,'TIDAK DIISI') AS label, COUNT(*)::int AS value FROM pegawai p ${peopleWhere} GROUP BY status_pegawai ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`WITH q AS (SELECT r.id_pegawai,r.jenjang FROM riwayat_pendidikan r UNION SELECT d.id_pegawai,d.jenjang FROM riwayat_pendidikan_personel d) SELECT COALESCE(q.jenjang,'Tidak diisi') AS label, COUNT(DISTINCT q.id_pegawai)::int AS value FROM q JOIN pegawai p ON p.id_pegawai=q.id_pegawai WHERE 1=1${personScope} GROUP BY q.jenjang ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`WITH q AS (SELECT id_pegawai FROM riwayat_diklat UNION ALL SELECT id_pegawai FROM riwayat_diklat_personel), counts AS (SELECT q.id_pegawai, COUNT(*)::int AS jumlah FROM q JOIN pegawai p ON p.id_pegawai=q.id_pegawai WHERE 1=1${personScope} GROUP BY q.id_pegawai) SELECT COUNT(*) FILTER (WHERE jumlah >= 1)::int AS pernah, COUNT(*) FILTER (WHERE jumlah > 1)::int AS lebih_dari_satu, (SELECT COUNT(*)::int FROM pegawai p WHERE 1=1${personScope}) AS total FROM counts`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`WITH counts AS (SELECT m.id_pegawai, COUNT(*)::int AS jumlah FROM riwayat_mutasi m JOIN pegawai p ON p.id_pegawai=m.id_pegawai WHERE 1=1${personScope} GROUP BY m.id_pegawai) SELECT COUNT(*) FILTER (WHERE jumlah >= 1)::int AS pernah, COUNT(*) FILTER (WHERE jumlah > 1)::int AS lebih_dari_satu, (SELECT COUNT(*)::int FROM pegawai p WHERE 1=1${personScope}) AS total FROM counts`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT CASE WHEN tanggal_masuk IS NULL THEN 'Tidak diisi' WHEN AGE(CURRENT_DATE,tanggal_masuk) < INTERVAL '5 years' THEN '< 5 tahun' WHEN AGE(CURRENT_DATE,tanggal_masuk) < INTERVAL '10 years' THEN '5–9 tahun' WHEN AGE(CURRENT_DATE,tanggal_masuk) < INTERVAL '20 years' THEN '10–19 tahun' ELSE '20+ tahun' END AS label, COUNT(*)::int AS value FROM pegawai p ${peopleWhere} GROUP BY 1 ORDER BY MIN(COALESCE(tanggal_masuk,CURRENT_DATE))`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT COUNT(*) FILTER (WHERE tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun,58)) <= CURRENT_DATE)::int AS sudah, COUNT(*) FILTER (WHERE tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun,58)) > CURRENT_DATE AND tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun,58)) <= CURRENT_DATE + INTERVAL '5 years')::int AS mendekati, COUNT(*)::int AS total FROM pegawai p ${peopleWhere}`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT COALESCE(l.nama_level, 'Nivelering belum diisi') AS label, COUNT(DISTINCT r.id_pegawai)::int AS value FROM riwayat_jabatan r JOIN pegawai p ON p.id_pegawai=r.id_pegawai LEFT JOIN level_jabatan l ON l.id_level_jabatan=r.id_level_jabatan WHERE r.tanggal_selesai IS NULL${personScope} GROUP BY l.nama_level ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT CASE WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) < 18 THEN 'Di bawah 18 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 25 THEN '18–25 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 35 THEN '26–35 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 45 THEN '36–45 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 58 THEN '46–58 tahun' ELSE 'Di atas 58 tahun' END AS label, COUNT(*)::int AS value FROM pegawai p ${peopleWhere} GROUP BY 1 ORDER BY MIN(EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)))`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') AS label, COUNT(*)::int AS value FROM pegawai p LEFT JOIN golongan g ON g.id_golongan=p.id_golongan ${peopleWhere} GROUP BY COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') AS label, COUNT(*)::int AS value FROM pegawai p LEFT JOIN golongan g ON g.id_golongan=p.id_golongan WHERE p.jenis_personel='POLRI'${personScope} GROUP BY COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') AS label, COUNT(*)::int AS value FROM pegawai p LEFT JOIN golongan g ON g.id_golongan=p.id_golongan WHERE p.jenis_personel<>'POLRI'${personScope} GROUP BY COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      query(`SELECT 'Tanpa tanggal lahir' AS label, COUNT(*)::int AS value FROM pegawai p WHERE p.tanggal_lahir IS NULL${personScope} UNION ALL SELECT 'Tanpa tanggal masuk' AS label, COUNT(*)::int FROM pegawai p WHERE p.tanggal_masuk IS NULL${personScope} UNION ALL SELECT 'Tanpa Satker' AS label, COUNT(*)::int FROM pegawai p WHERE p.id_satker IS NULL${personScope} UNION ALL SELECT 'Tanpa unit kerja' AS label, COUNT(*)::int FROM pegawai p WHERE p.id_unit IS NULL${personScope} UNION ALL SELECT 'Tanpa jabatan' AS label, COUNT(*)::int FROM pegawai p WHERE p.id_jabatan IS NULL${personScope} UNION ALL SELECT 'Identitas tidak sesuai jenis personel' AS label, COUNT(*)::int FROM pegawai p WHERE ((p.jenis_personel='POLRI' AND p.jenis_identitas<>'NRP') OR (p.jenis_personel<>'POLRI' AND p.jenis_identitas<>'NIP'))${personScope} ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
      isAdministrator(req.user) ? query("SELECT COALESCE(status_validasi,'BELUM_DIVALIDASI') AS label, COUNT(*)::int AS value FROM staging_pegawai GROUP BY status_validasi ORDER BY value DESC", []) : Promise.resolve({ rows: [] })
    ]);
    const trainingRow = training.rows[0] || { pernah: 0, lebih_dari_satu: 0, total: 0 };
    const mutationRow = mutation.rows[0] || { pernah: 0, lebih_dari_satu: 0, total: 0 };
    return res.json({ data: { total_personel: total.rows[0]?.total || 0, status: status.rows, golongan: rankGroup.rows, golongan_polri: polriRankGroup.rows, golongan_asn: asnRankGroup.rows, pendidikan: education.rows, diklat: { pernah: Number(trainingRow.pernah), belum: Math.max(Number(trainingRow.total) - Number(trainingRow.pernah), 0), lebih_dari_satu: Number(trainingRow.lebih_dari_satu), total: Number(trainingRow.total) }, mutasi: { pernah: Number(mutationRow.pernah), belum: Math.max(Number(mutationRow.total) - Number(mutationRow.pernah), 0), lebih_dari_satu: Number(mutationRow.lebih_dari_satu), total: Number(mutationRow.total) }, kualitas_data: dataQuality.rows, validasi_staging: stagingQuality.rows, lama_dinas: service.rows, pensiun: retirement.rows[0] || { sudah: 0, mendekati: 0, total: 0 }, kelompok_jabatan: positionGroup.rows, kelompok_usia: ageGroup.rows } });
  } catch (error) { return next(error); }
});

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

// Endpoint READ detail personel. Scope diperiksa sebelum detail dikembalikan.
router.get('/personel/:id(\\d+)', authenticate, async (req, res, next) => {
  try {
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query(`${personnelSelect} WHERE p.id_pegawai = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
    return res.json({ data: result.rows[0] });
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
    const education = await query(`SELECT id_pendidikan, id_pegawai, jenjang, institusi, jurusan, tahun_lulus, nomor_ijazah, keterangan, created_at, updated_at
      FROM riwayat_pendidikan_personel WHERE id_pegawai=$1 ORDER BY tahun_lulus DESC NULLS LAST, id_pendidikan DESC`, [req.params.id]);
    const training = await query(`SELECT id_diklat, id_pegawai, nama_diklat, jenis_diklat, penyelenggara, tanggal_mulai, tanggal_selesai, jam_pelajaran, nilai, nomor_sertifikat, keterangan, created_at, updated_at
      FROM riwayat_diklat_personel WHERE id_pegawai=$1 ORDER BY tanggal_mulai DESC NULLS LAST, id_diklat DESC`, [req.params.id]);
    return res.json({ data: { personel: person.rows[0], riwayat_jabatan: history.rows, pendidikan: education.rows, diklat: training.rows } });
  } catch (error) { return next(error); }
});

// CRUD riwayat pendidikan personel, selalu mengikuti scope personel induk.
router.get('/personel/:id/pendidikan', authenticate, async (req, res, next) => {
  try {
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('SELECT * FROM riwayat_pendidikan_personel WHERE id_pegawai=$1 ORDER BY tahun_lulus DESC NULLS LAST, id_pendidikan DESC', [req.params.id]);
    return res.json({ data: result.rows });
  } catch (error) { return next(error); }
});
router.post('/personel/:id/pendidikan', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const parsed = validate(educationSchema, req.body); if (parsed.error) return res.status(400).json({ error: 'Validasi pendidikan gagal.', details: parsed.error });
    const { jenjang, institusi, jurusan, tahun_lulus, nomor_ijazah, keterangan } = parsed.data;
    const result = await query(`INSERT INTO riwayat_pendidikan_personel (id_pegawai,jenjang,institusi,jurusan,tahun_lulus,nomor_ijazah,keterangan,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.params.id, jenjang, institusi, jurusan || null, tahun_lulus || null, nomor_ijazah || null, keterangan || null, req.user.id_user]);
    await writeAudit(req, 'CREATE', 'riwayat_pendidikan_personel', result.rows[0].id_pendidikan, { id_pegawai: req.params.id });
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});
router.put('/personel/:id/pendidikan/:educationId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const parsed = validate(educationSchema, req.body); if (parsed.error) return res.status(400).json({ error: 'Validasi pendidikan gagal.', details: parsed.error });
    const { jenjang, institusi, jurusan, tahun_lulus, nomor_ijazah, keterangan } = parsed.data;
    const result = await query(`UPDATE riwayat_pendidikan_personel SET jenjang=$1,institusi=$2,jurusan=$3,tahun_lulus=$4,nomor_ijazah=$5,keterangan=$6,updated_by=$7,updated_at=NOW()
      WHERE id_pendidikan=$8 AND id_pegawai=$9 RETURNING *`, [jenjang, institusi, jurusan || null, tahun_lulus || null, nomor_ijazah || null, keterangan || null, req.user.id_user, req.params.educationId, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Riwayat pendidikan tidak ditemukan.' });
    await writeAudit(req, 'UPDATE', 'riwayat_pendidikan_personel', req.params.educationId, { id_pegawai: req.params.id });
    return res.json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});
router.delete('/personel/:id/pendidikan/:educationId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('DELETE FROM riwayat_pendidikan_personel WHERE id_pendidikan=$1 AND id_pegawai=$2', [req.params.educationId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Riwayat pendidikan tidak ditemukan.' });
    await writeAudit(req, 'DELETE', 'riwayat_pendidikan_personel', req.params.educationId, { id_pegawai: req.params.id });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// CRUD riwayat diklat personel, dengan validasi rentang tanggal dan nilai.
router.get('/personel/:id/diklat', authenticate, async (req, res, next) => {
  try {
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('SELECT * FROM riwayat_diklat_personel WHERE id_pegawai=$1 ORDER BY tanggal_mulai DESC NULLS LAST, id_diklat DESC', [req.params.id]);
    return res.json({ data: result.rows });
  } catch (error) { return next(error); }
});
router.post('/personel/:id/diklat', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const parsed = validate(trainingSchema, req.body); if (parsed.error) return res.status(400).json({ error: 'Validasi diklat gagal.', details: parsed.error });
    const { nama_diklat, jenis_diklat, penyelenggara, tanggal_mulai, tanggal_selesai, jam_pelajaran, nilai, nomor_sertifikat, keterangan } = parsed.data;
    const result = await query(`INSERT INTO riwayat_diklat_personel (id_pegawai,nama_diklat,jenis_diklat,penyelenggara,tanggal_mulai,tanggal_selesai,jam_pelajaran,nilai,nomor_sertifikat,keterangan,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [req.params.id, nama_diklat, jenis_diklat || null, penyelenggara || null, tanggal_mulai || null, tanggal_selesai || null, jam_pelajaran || null, nilai ?? null, nomor_sertifikat || null, keterangan || null, req.user.id_user]);
    await writeAudit(req, 'CREATE', 'riwayat_diklat_personel', result.rows[0].id_diklat, { id_pegawai: req.params.id });
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});
router.put('/personel/:id/diklat/:trainingId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const parsed = validate(trainingSchema, req.body); if (parsed.error) return res.status(400).json({ error: 'Validasi diklat gagal.', details: parsed.error });
    const { nama_diklat, jenis_diklat, penyelenggara, tanggal_mulai, tanggal_selesai, jam_pelajaran, nilai, nomor_sertifikat, keterangan } = parsed.data;
    const result = await query(`UPDATE riwayat_diklat_personel SET nama_diklat=$1,jenis_diklat=$2,penyelenggara=$3,tanggal_mulai=$4,tanggal_selesai=$5,jam_pelajaran=$6,nilai=$7,nomor_sertifikat=$8,keterangan=$9,updated_by=$10,updated_at=NOW()
      WHERE id_diklat=$11 AND id_pegawai=$12 RETURNING *`, [nama_diklat, jenis_diklat || null, penyelenggara || null, tanggal_mulai || null, tanggal_selesai || null, jam_pelajaran || null, nilai ?? null, nomor_sertifikat || null, keterangan || null, req.user.id_user, req.params.trainingId, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Riwayat diklat tidak ditemukan.' });
    await writeAudit(req, 'UPDATE', 'riwayat_diklat_personel', req.params.trainingId, { id_pegawai: req.params.id });
    return res.json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});
router.delete('/personel/:id/diklat/:trainingId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('DELETE FROM riwayat_diklat_personel WHERE id_diklat=$1 AND id_pegawai=$2', [req.params.trainingId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Riwayat diklat tidak ditemukan.' });
    await writeAudit(req, 'DELETE', 'riwayat_diklat_personel', req.params.trainingId, { id_pegawai: req.params.id });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Master indikator dan periode penilaian merit dibaca oleh user terautentikasi.
router.get('/merit/indicators', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_indicator, kode_indicator, nama_indicator, deskripsi, bobot, is_active FROM merit_indicator WHERE is_active=true ORDER BY id_indicator'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});
router.get('/merit/periods', authenticate, async (_req, res, next) => {
  try { const result = await query('SELECT id_period, kode_period, nama_period, tanggal_mulai, tanggal_selesai, status FROM merit_period ORDER BY tanggal_mulai DESC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
});

// Ringkasan skor personel dihitung dari nilai mentah x bobot indikator.
router.get('/personel/:id/merit', authenticate, async (req, res, next) => {
  try {
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const period = await query(`SELECT p.* FROM merit_period p WHERE ($1::text IS NULL OR p.kode_period=$1) ORDER BY CASE WHEN p.status='AKTIF' THEN 0 ELSE 1 END, p.tanggal_mulai DESC LIMIT 1`, [req.query.period || null]);
    if (!period.rows[0]) return res.status(404).json({ error: 'Periode merit belum tersedia.' });
    const rows = await query(`SELECT a.id_assessment, a.id_pegawai, a.id_period, a.id_indicator, i.kode_indicator, i.nama_indicator, i.deskripsi, i.bobot, a.nilai_raw, ROUND((a.nilai_raw * i.bobot / 100.0)::numeric, 2) AS nilai_berbobot, a.bukti, a.status, a.updated_at
      FROM merit_assessment a JOIN merit_indicator i ON i.id_indicator=a.id_indicator WHERE a.id_pegawai=$1 AND a.id_period=$2 ORDER BY i.id_indicator`, [req.params.id, period.rows[0].id_period]);
    const total = rows.rows.reduce((sum, row) => sum + Number(row.nilai_berbobot), 0);
    return res.json({ data: { period: period.rows[0], total_score: Number(total.toFixed(2)), assessments: rows.rows } });
  } catch (error) { return next(error); }
});

// Create/update satu indikator penilaian, tetap dibatasi scope personel.
router.post('/personel/:id/merit-assessments', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const parsed = validate(meritAssessmentSchema, req.body); if (parsed.error) return res.status(400).json({ error: 'Validasi merit gagal.', details: parsed.error });
    if (parsed.data.status === 'DIVERIFIKASI' && !isAdministrator(req.user)) return res.status(403).json({ error: 'Hanya administrator yang dapat memverifikasi penilaian.' });
    const { id_period, id_indicator, nilai_raw, bukti, status } = parsed.data;
    const result = await query(`INSERT INTO merit_assessment (id_pegawai,id_period,id_indicator,nilai_raw,bukti,status,assessed_by,verified_by,verified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $6='DIVERIFIKASI' THEN NOW() ELSE NULL END)
      ON CONFLICT (id_pegawai,id_period,id_indicator) DO UPDATE SET nilai_raw=EXCLUDED.nilai_raw,bukti=EXCLUDED.bukti,status=EXCLUDED.status,assessed_by=EXCLUDED.assessed_by,verified_by=EXCLUDED.verified_by,verified_at=EXCLUDED.verified_at,updated_at=NOW()
      RETURNING *`, [req.params.id, id_period, id_indicator, nilai_raw, bukti || null, status, req.user.id_user, status === 'DIVERIFIKASI' ? req.user.id_user : null]);
    await writeAudit(req, 'UPDATE', 'merit_assessment', result.rows[0].id_assessment, { id_pegawai: req.params.id, status });
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});
router.delete('/personel/:id/merit-assessments/:assessmentId', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('DELETE FROM merit_assessment WHERE id_assessment=$1 AND id_pegawai=$2', [req.params.assessmentId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Penilaian merit tidak ditemukan.' });
    await writeAudit(req, 'DELETE', 'merit_assessment', req.params.assessmentId, { id_pegawai: req.params.id });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Endpoint CREATE personel dengan Satker wajib untuk pembatasan scope.
router.post('/personel', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    const parsed = validate(personnelSchema, req.body);
    if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
    if (!(await assertSatkerAccess(req.user, parsed.data.id_satker))) return res.status(403).json({ error: 'Satker di luar scope Anda.' });
    if (!(await assertUnitBelongsToSatker(parsed.data.id_unit, parsed.data.id_satker))) return res.status(400).json({ error: 'Unit kerja tidak berada di bawah Satker yang dipilih.' });
    const { id_satker, nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, id_golongan, pangkat, id_atasan, status_pegawai, batas_usia_pensiun } = parsed.data;
    const result = await query(`INSERT INTO pegawai (nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,id_atasan,status_pegawai,batas_usia_pensiun,id_satker)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`, [nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,id_atasan,status_pegawai,batas_usia_pensiun,id_satker]);
    await writeAudit(req, 'CREATE', 'personel', result.rows[0].id_pegawai, { after: result.rows[0] });
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
    if (!(await assertUnitBelongsToSatker(parsed.data.id_unit, parsed.data.id_satker))) return res.status(400).json({ error: 'Unit kerja tidak berada di bawah Satker yang dipilih.' });
    const { id_satker, nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, id_golongan, pangkat, id_atasan, status_pegawai, batas_usia_pensiun } = parsed.data;
    const result = await query(`UPDATE pegawai SET nip=$1,jenis_personel=$2,jenis_identitas=$3,nik=$4,nama=$5,jenis_kelamin=$6,tempat_lahir=$7,tanggal_lahir=$8,tanggal_masuk=$9,id_unit=$10,id_jabatan=$11,id_golongan=$12,pangkat=$13,id_atasan=$14,status_pegawai=$15,batas_usia_pensiun=$16,id_satker=$17 WHERE id_pegawai=$18 RETURNING *`, [nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,id_atasan,status_pegawai,batas_usia_pensiun,id_satker,req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
    await writeAudit(req, 'UPDATE', 'personel', req.params.id, { after: result.rows[0] });
    return res.json({ data: result.rows[0] });
  } catch (error) { return next(error); }
});

// Endpoint DELETE personel; operator hanya dapat menghapus personel dalam scope-nya.
router.delete('/personel/:id', authenticate, async (req, res, next) => {
  try {
    if (!canManagePersonnel(req.user)) return res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
    if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
    const result = await query('DELETE FROM pegawai WHERE id_pegawai = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
    await writeAudit(req, 'DELETE', 'personel', req.params.id);
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
    if (!(await assertFunctionBelongsToSatker(parsed.data.id_fungsi, parsed.data.id_satker))) return res.status(400).json({ error: 'Satuan fungsi tidak berada di bawah Satker yang dipilih.' });
    const { id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan } = parsed.data;
    const result = await query(`INSERT INTO riwayat_jabatan (id_pegawai,id_jabatan,id_satker,id_fungsi,id_level_jabatan,id_status_jabatan,tanggal_mulai,tanggal_selesai,keterangan,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.params.id, id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan, req.user.id_user]);
    await writeAudit(req, 'CREATE', 'riwayat_jabatan', result.rows[0].id_riwayat_jabatan, { id_pegawai: req.params.id, after: result.rows[0] });
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
    if (!(await assertFunctionBelongsToSatker(parsed.data.id_fungsi, parsed.data.id_satker))) return res.status(400).json({ error: 'Satuan fungsi tidak berada di bawah Satker yang dipilih.' });
    const { id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan } = parsed.data;
    const result = await query(`UPDATE riwayat_jabatan SET id_jabatan=$1,id_satker=$2,id_fungsi=$3,id_level_jabatan=$4,id_status_jabatan=$5,tanggal_mulai=$6,tanggal_selesai=$7,keterangan=$8,updated_by=$9,updated_at=NOW()
      WHERE id_riwayat_jabatan=$10 AND id_pegawai=$11 RETURNING *`, [id_jabatan, id_satker, id_fungsi, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan, req.user.id_user, req.params.historyId, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Riwayat jabatan tidak ditemukan.' });
    await writeAudit(req, 'UPDATE', 'riwayat_jabatan', req.params.historyId, { id_pegawai: req.params.id, after: result.rows[0] });
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
    await writeAudit(req, 'DELETE', 'riwayat_jabatan', req.params.historyId, { id_pegawai: req.params.id });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
