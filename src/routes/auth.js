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

export function registerAuthRoutes(router) {
  router.post('/auth/register', async (req, res, next) => {
    try {
      const parsed = validate(registerSchema, req.body);
      if (parsed.error) return res.status(400).json({ error: 'Validasi gagal.', details: parsed.error });
      const { username, email, nama, jenis_personel, nip, id_satker, password } = parsed.data;
      const satker = await query('SELECT id_satker, nama_satker FROM satker WHERE id_satker=$1 AND is_active=true', [id_satker]);
      if (!satker.rows[0]) return res.status(400).json({ error: 'Satker yang dipilih tidak ditemukan atau tidak aktif.' });
      const satker_asal = satker.rows[0].nama_satker;
      let pangkat = parsed.data.pangkat || null;
      let id_golongan = parsed.data.id_golongan || null;
      if (jenis_personel === 'ASN') {
        const golongan = await query('SELECT id_golongan, nama_pangkat FROM golongan WHERE id_golongan=$1', [id_golongan]);
        if (!golongan.rows[0]) return res.status(400).json({ error: 'Golongan ASN tidak ditemukan.' });
        pangkat = golongan.rows[0].nama_pangkat;
      } else if (!POLRI_RANKS.includes(pangkat)) return res.status(400).json({ error: 'Pangkat POLRI tidak valid.' });
      const otp = generateOtp();
      const result = await query(`INSERT INTO registration_requests (username,email,nama,jenis_personel,pangkat,id_golongan,nip,satker_asal,id_satker,password_hash,requested_role,email_otp_hash,otp_expires_at,otp_last_sent_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'viewer',$11,NOW()+($12 * INTERVAL '1 minute'),NOW())
        RETURNING id_registration, username, email, nama, jenis_personel, pangkat, id_golongan, nip, satker_asal, id_satker, requested_role, status, otp_expires_at`, [username, email, nama, jenis_personel, pangkat, id_golongan, nip, satker_asal, id_satker, await hashPassword(password), hashOtp(otp), OTP_TTL_MINUTES]);
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
  // Master Satker non-sensitif untuk pilihan bertingkat pada formulir registrasi.
  router.get('/public/satker/tree', async (_req, res, next) => {
    try {
      const result = await query('SELECT id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk FROM satker WHERE is_active=true ORDER BY COALESCE(id_satker_induk, 0), nama_satker ASC');
      return res.json({ data: result.rows });
    } catch (error) { return next(error); }
  });
  router.get('/public/pangkat-polri', (_req, res) => res.json({ data: POLRI_RANKS }));
  router.get('/public/golongan', async (_req, res, next) => {
    try { const result = await query('SELECT id_golongan, kode_golongan, nama_pangkat FROM golongan ORDER BY id_golongan ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
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
    try { const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50); const offset = (page - 1) * limit; const pendingWhere = `r.status='pending' AND r.email_verified_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users existing_user WHERE LOWER(existing_user.username)=LOWER(r.username))`; const total = await query(`SELECT COUNT(*)::int AS total FROM registration_requests r WHERE ${pendingWhere}`); const result = await query(`SELECT r.id_registration, r.username, r.email, r.email_verified_at, r.nama, r.jenis_personel, r.pangkat, r.id_golongan, r.nip, r.satker_asal, r.id_satker, s.kode_satker, s.nama_satker, r.requested_role, r.created_at FROM registration_requests r LEFT JOIN satker s ON s.id_satker=r.id_satker WHERE ${pendingWhere} ORDER BY CASE r.requested_role WHEN 'admin' THEN 1 WHEN 'admin_ssdm' THEN 2 WHEN 'operator_polda' THEN 3 WHEN 'operator_satker' THEN 4 WHEN 'editor' THEN 5 ELSE 6 END, r.username ASC LIMIT $1 OFFSET $2`, [limit, offset]); return res.json({ data: result.rows, meta: { page, limit, total: total.rows[0].total } }); } catch (error) { return next(error); }
  });
  // Riwayat seluruh keputusan approval beserta aktor yang mengambil keputusan.
  router.get('/auth/registrations/history', authenticate, authorize('admin'), async (req, res, next) => {
    try { const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50); const offset = (page - 1) * limit; const total = await query("SELECT COUNT(*)::int AS total FROM registration_requests WHERE status IN ('approved','rejected')"); const result = await query(`SELECT r.id_registration, r.username, r.nama, r.jenis_personel, r.pangkat, r.id_golongan, r.nip, r.satker_asal, r.id_satker, s.nama_satker, r.requested_role, r.approved_role, r.status, r.reviewed_at, r.review_note, u.username AS reviewer_username FROM registration_requests r LEFT JOIN satker s ON s.id_satker=r.id_satker LEFT JOIN users u ON u.id_user = r.reviewed_by WHERE r.status IN ('approved','rejected') ORDER BY CASE r.requested_role WHEN 'admin' THEN 1 WHEN 'admin_ssdm' THEN 2 WHEN 'operator_polda' THEN 3 WHEN 'operator_satker' THEN 4 WHEN 'editor' THEN 5 ELSE 6 END, r.reviewed_at DESC, r.username ASC LIMIT $1 OFFSET $2`, [limit, offset]); return res.json({ data: result.rows, meta: { page, limit, total: total.rows[0].total } }); } catch (error) { return next(error); }
  });
  // Daftar akun yang sudah aktif/disetujui untuk dikelola admin pertama.
  router.get('/auth/users/approved', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50); const offset = (page - 1) * limit;
      const scoped = req.user.role !== 'admin';
      const visibility = scoped ? ' AND EXISTS (SELECT 1 FROM user_scope viewer_scope JOIN user_scope target_scope ON target_scope.id_satker=viewer_scope.id_satker WHERE viewer_scope.id_user=$1 AND target_scope.id_user=u.id_user)' : '';
      const count = await query(`SELECT COUNT(*)::int AS total FROM users u WHERE 1=1${visibility}`, scoped ? [req.user.id_user] : []);
      const params = scoped ? [req.user.id_user, limit, offset] : [limit, offset];
      const limitParam = scoped ? '$2' : '$1'; const offsetParam = scoped ? '$3' : '$2';
      const result = await query(`SELECT u.id_user, u.username, u.role, u.is_active, u.created_at, r.nama, r.pangkat, r.nip, r.satker_asal FROM users u LEFT JOIN registration_requests r ON r.username=u.username AND r.status='approved' WHERE 1=1${visibility} ORDER BY u.is_active DESC, CASE u.role WHEN 'admin' THEN 1 WHEN 'admin_ssdm' THEN 2 WHEN 'operator_polda' THEN 3 WHEN 'operator_satker' THEN 4 WHEN 'editor' THEN 5 ELSE 6 END, u.username ASC LIMIT ${limitParam} OFFSET ${offsetParam}`, params);
      return res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
    } catch (error) { return next(error); }
  });
  // Admin melihat scope Satker yang melekat pada user.
  router.get('/auth/users/:id/scopes', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
    try {
      const result = await query(`SELECT u.id_user, u.username, s.id_satker, s.kode_satker, s.nama_satker, s.tipe_satker
        FROM users u LEFT JOIN user_scope us ON us.id_user = u.id_user LEFT JOIN satker s ON s.id_satker = us.id_satker
        WHERE u.id_user=$1${req.user.role === 'admin' ? '' : ' AND EXISTS (SELECT 1 FROM user_scope viewer_scope JOIN user_scope target_scope ON target_scope.id_satker=viewer_scope.id_satker WHERE viewer_scope.id_user=$2 AND target_scope.id_user=u.id_user)'} ORDER BY s.nama_satker ASC`, req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id_user]);
      if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' });
      return res.json({ data: result.rows.filter((row) => row.id_satker != null) });
    } catch (error) { return next(error); }
  });
  // Admin mengganti seluruh daftar scope Satker user dan mencatat perubahannya.
  router.put('/auth/users/:id/scopes', authenticate, authorize('admin', 'admin_ssdm'), async (req, res, next) => {
    try {
      const parsed = validate(userScopeSchema, req.body);
      if (parsed.error) return res.status(400).json({ error: 'Scope tidak valid.', details: parsed.error });
      const user = await query(`SELECT id_user, username FROM users WHERE id_user=$1${req.user.role === 'admin' ? '' : ' AND EXISTS (SELECT 1 FROM user_scope viewer_scope JOIN user_scope target_scope ON target_scope.id_satker=viewer_scope.id_satker WHERE viewer_scope.id_user=$2 AND target_scope.id_user=users.id_user)'}`, req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id_user]);
      if (!user.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan.' });
      const satkers = await query(`SELECT id_satker FROM satker WHERE is_active=true AND id_satker = ANY($1::int[])${req.user.role === 'admin' ? '' : ' AND EXISTS (SELECT 1 FROM user_scope allowed_scope WHERE allowed_scope.id_user=$2 AND allowed_scope.id_satker=satker.id_satker)'}`, req.user.role === 'admin' ? [parsed.data.id_satker] : [parsed.data.id_satker, req.user.id_user]);
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
      const result = await withTransaction(async (client) => {
        // Kunci baris selama approval agar klik/request bersamaan tidak membuat user ganda.
        const registration = await client.query('SELECT * FROM registration_requests WHERE id_registration=$1 FOR UPDATE', [req.params.id]);
        const item = registration.rows[0];
        if (!item) return { notFound: true };
        if (item.status !== 'pending') return { alreadyProcessed: true, status: item.status };
        if (!item.email_verified_at) return { unverified: true };
  
        if (parsed.data.decision === 'approve') {
          // Satker saat registrasi selalu menjadi grant dasar requester. Scope tambahan
          // yang dipilih admin tetap diperbolehkan, tetapi tidak boleh menghapus grant ini.
          const scopeIds = [...new Set([
            ...(item.id_satker ? [Number(item.id_satker)] : []),
            ...parsed.data.scope_satker,
          ])];
          if (!['admin', 'admin_ssdm'].includes(parsed.data.approved_role) && !scopeIds.length) return { invalidScope: true };
          const scopeRows = scopeIds.length ? await client.query('SELECT id_satker FROM satker WHERE is_active=true AND id_satker = ANY($1::int[])', [scopeIds]) : { rowCount: 0 };
          if (scopeRows.rowCount !== scopeIds.length) return { invalidSatker: true };
          const userResult = await client.query(`INSERT INTO users (username,email,email_verified,password_hash,role) VALUES ($1,$2,TRUE,$3,$4) RETURNING id_user, username, email, role, is_active`, [item.username, item.email, item.password_hash, parsed.data.approved_role]);
          for (const satkerId of scopeIds) await client.query('INSERT INTO user_scope (id_user,id_satker) VALUES ($1,$2)', [userResult.rows[0].id_user, satkerId]);
          await client.query(`UPDATE registration_requests SET status='approved', approved_role=$1, reviewed_by=$2, reviewed_at=NOW(), review_note=$3 WHERE id_registration=$4 AND status='pending'`, [parsed.data.approved_role, req.user.id_user, parsed.data.note || null, req.params.id]);
          return { user: userResult.rows[0], scope_satker: scopeIds };
        }
        await client.query(`UPDATE registration_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2 WHERE id_registration=$3 AND status='pending'`, [req.user.id_user, parsed.data.note || null, req.params.id]);
        return { rejected: true };
      });
      if (result.notFound) return res.status(404).json({ error: 'Permintaan pendaftaran tidak ditemukan.' });
      if (result.alreadyProcessed) return res.status(409).json({ error: `Permintaan sudah diproses dengan status ${result.status}.` });
      if (result.unverified) return res.status(409).json({ error: 'Email pendaftar belum tervalidasi.' });
      if (result.invalidScope) return res.status(400).json({ error: 'Scope organisasi wajib dipilih untuk role ini.' });
      if (result.invalidSatker) return res.status(400).json({ error: 'Salah satu scope Satker tidak ditemukan atau tidak aktif.' });
      if (result.rejected) return res.json({ message: 'Pendaftaran ditolak.' });
      return res.json({ message: 'Pendaftaran disetujui dan scope organisasi ditetapkan.', user: result.user, scope_satker: result.scope_satker });
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
      const pending = await query("SELECT r.id_registration FROM registration_requests r WHERE r.username=$1 AND r.status='pending' AND NOT EXISTS (SELECT 1 FROM users existing_user WHERE LOWER(existing_user.username)=LOWER(r.username))", [parsed.data.username]);
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
  // Mengembalikan detail profil akun yang sedang aktif.
  router.get('/auth/me/profile', authenticate, async (req, res, next) => {
    try {
      const result = await query(`SELECT u.id_user, u.username, u.email, u.role, u.is_active, u.created_at,
          r.nama, r.jenis_personel, r.pangkat, r.id_golongan, r.nip, r.satker_asal,
          s.nama_satker, s.kode_satker
        FROM users u
        LEFT JOIN registration_requests r ON r.username=u.username AND r.status='approved'
        LEFT JOIN satker s ON s.id_satker=r.id_satker
        WHERE u.id_user=$1`, [req.user.id_user]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Profil user tidak ditemukan.' });
      return res.json({ profile: result.rows[0] });
    } catch (error) { return next(error); }
  });
  
  // Log perubahan data yang terlihat sesuai role dan scope organisasi user.
}
