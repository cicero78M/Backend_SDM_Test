import { randomBytes } from 'node:crypto';
// Mengimpor helper password, JWT, authentication, dan authorization.
import { comparePassword, hashPassword, hashResetToken, signToken, authenticate, authorize } from '../auth.js';
// Mengimpor helper query PostgreSQL.
import { query, withTransaction } from '../db.js';
import { getOrSetJson, invalidateKeys, withRedisLock } from '../cache.js';
import { assertFunctionBelongsToSatker, assertPersonnelAccess, assertSatkerAccess, assertUnitBelongsToSatker, canManagePersonnel, isAdministrator, isPolresOperator, writeAudit } from '../access.js';
import { sendPasswordResetEmail, sendRegistrationOtp } from '../email.js';
import { generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES } from '../otp.js';
// Mengimpor schema validasi request.
import { POLRI_RANKS, adminResetPasswordSchema, approvalSchema, changePasswordSchema, educationSchema, employeeSchema, forgotPasswordSchema, jobHistorySchema, loginSchema, meritAssessmentSchema, personnelSchema, registerResendOtpSchema, registerSchema, registerVerifyEmailSchema, resetPasswordSchema, roleUpdateSchema, trainingSchema, userScopeSchema, userStatusSchema, validate } from '../validation.js';
// Membuat router yang akan dipasang di prefix /api/v1.

export function registerAuditRoutes(router) {
  router.get('/audit-log', authenticate, async (req, res, next) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const offset = (page - 1) * limit;
      const params = [];
      const addParam = value => { params.push(value); return `$${params.length}`; };
      const conditions = [];
      const targetPersonnel = `(CASE
        WHEN a.resource = 'personel' AND a.resource_id ~ '^[0-9]+$' THEN a.resource_id::integer
        WHEN a.metadata->>'id_pegawai' ~ '^[0-9]+$' THEN (a.metadata->>'id_pegawai')::integer
        ELSE NULL
      END)`;
  
      if (req.query.action && ['CREATE', 'READ', 'UPDATE', 'DELETE'].includes(String(req.query.action).toUpperCase())) {
        conditions.push(`a.action = ${addParam(String(req.query.action).toUpperCase())}`);
      }
      if (req.query.resource) {
        const resource = String(req.query.resource).trim().slice(0, 80);
        if (resource) conditions.push(`a.resource = ${addParam(resource)}`);
      }
      if (req.query.from) conditions.push(`a.created_at >= ${addParam(String(req.query.from))}::timestamptz`);
      if (req.query.to) conditions.push(`a.created_at < (${addParam(String(req.query.to))}::date + INTERVAL '1 day')`);
      if (req.query.search) {
        const search = `%${String(req.query.search).trim().slice(0, 100)}%`;
        conditions.push(`(u.username ILIKE ${addParam(search)} OR a.resource ILIKE ${addParam(search)} OR p.nama ILIKE ${addParam(search)} OR p.nip ILIKE ${addParam(search)})`);
      }
  
      // Admin utama dapat membaca seluruh log. Role lain hanya melihat aksi
      // personel dalam Satker yang menjadi scope-nya.
      if (req.user.role !== 'admin') {
        conditions.push(`a.resource IN ('personel', 'riwayat_jabatan', 'riwayat_pendidikan_personel', 'riwayat_diklat_personel', 'riwayat_mutasi_personel', 'merit_assessment')`);
        const scopeUser = addParam(req.user.id_user);
        conditions.push(`EXISTS (SELECT 1 FROM user_scope scoped WHERE scoped.id_user = ${scopeUser} AND scoped.id_satker = p.id_satker)`);
      }
  
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const fromSql = `audit_log a
        LEFT JOIN users u ON u.id_user = a.id_user
        LEFT JOIN pegawai p ON p.id_pegawai = ${targetPersonnel}
        LEFT JOIN satker s ON s.id_satker = p.id_satker`;
      const count = await query(`SELECT COUNT(*)::int AS total FROM ${fromSql} ${where}`, params);
      const dataParams = [...params, limit, offset];
      const data = await query(`SELECT a.id_audit, a.action, a.resource, a.resource_id, a.request_id, a.metadata, a.created_at,
          u.id_user AS actor_id, u.username AS actor_username, p.id_pegawai AS target_id, p.nama AS target_nama,
          p.nip AS target_nip, s.nama_satker AS target_satker
        FROM ${fromSql} ${where}
        ORDER BY a.created_at DESC, a.id_audit DESC
        LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams);
      await writeAudit(req, 'READ', 'audit_log', null, { filters: req.query, result_count: data.rows.length });
      return res.json({ data: data.rows, meta: { page, limit, total: count.rows[0].total } });
    } catch (error) { return next(error); }
  });
  
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
  // Membuat token reset dan mengirim instruksi ke email akun tanpa membocorkan keberadaan akun.
  router.post('/auth/forgot-password', async (req, res, next) => {
    try {
      const parsed = validate(forgotPasswordSchema, req.body);
      if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
      const identifier = parsed.data.identifier || parsed.data.username;
      const result = await query(`SELECT id_user, email FROM users
        WHERE is_active=TRUE AND email IS NOT NULL AND email_verified=TRUE
        AND (username=$1 OR LOWER(email)=LOWER($1))`, [identifier]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Username atau email tidak ditemukan, periksa kembali username atau email yang Anda masukkan.' });
      const response = { message: 'Link reset password telah dikirim ke email terdaftar.' };
      const token = randomBytes(32).toString('hex');
      await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id_user=$1 AND used_at IS NULL', [result.rows[0].id_user]);
      await query('INSERT INTO password_reset_tokens (id_user, token_hash, expires_at) VALUES ($1,$2,NOW()+INTERVAL \'30 minutes\')', [result.rows[0].id_user, hashResetToken(token)]);
      try {
        await sendPasswordResetEmail({ email: result.rows[0].email, token, expiresMinutes: 30 });
      } catch (mailError) {
        await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id_user=$1 AND token_hash=$2', [result.rows[0].id_user, hashResetToken(token)]);
        mailError.statusCode = 503;
        mailError.publicMessage = 'Email reset password belum dapat dikirim. Silakan coba lagi nanti.';
        throw mailError;
      }
      return res.json(response);
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
}
