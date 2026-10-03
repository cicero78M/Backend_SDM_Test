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

export function registerMasterRoutes(router) {
  router.get('/master/satker', authenticate, async (req, res, next) => {
    try {
      const scoped = req.user.role !== 'admin';
      const result = await query(`
        WITH RECURSIVE scoped_satker AS (
          SELECT s.id_satker, s.kode_satker, s.nama_satker, s.tipe_satker, s.id_satker_induk, s.is_active,
                 true AS is_scope_allowed
          FROM satker s
          ${scoped ? 'JOIN user_scope us ON us.id_satker=s.id_satker AND us.id_user=$1' : ''}
          WHERE s.is_active=true
        ), ancestors AS (
          SELECT * FROM scoped_satker
          UNION
          SELECT parent.id_satker, parent.kode_satker, parent.nama_satker, parent.tipe_satker,
                 parent.id_satker_induk, parent.is_active, false AS is_scope_allowed
          FROM satker parent
          JOIN ancestors child ON child.id_satker_induk=parent.id_satker
          WHERE parent.is_active=true
        ), descendants AS (
          SELECT * FROM scoped_satker
          UNION
          SELECT child.id_satker, child.kode_satker, child.nama_satker, child.tipe_satker,
                 child.id_satker_induk, child.is_active, true AS is_scope_allowed
          FROM satker child
          JOIN descendants parent ON child.id_satker_induk=parent.id_satker
          WHERE child.is_active=true
        )
        SELECT id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active,
               bool_or(is_scope_allowed) AS is_scope_allowed
        FROM (SELECT * FROM ancestors UNION SELECT * FROM descendants) visible
        GROUP BY id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active
        ORDER BY COALESCE(id_satker_induk, 0), nama_satker ASC`, scoped ? [req.user.id_user] : []);
      return res.json({ data: result.rows });
    } catch (error) { return next(error); }
  });
  router.get('/master/satker/tree', authenticate, async (req, res, next) => {
    try {
      const scoped = req.user.role !== 'admin';
      const result = await query(`
        WITH RECURSIVE scoped_satker AS (
          SELECT s.id_satker, s.kode_satker, s.nama_satker, s.tipe_satker, s.id_satker_induk, s.is_active,
                 true AS is_scope_allowed
          FROM satker s
          ${scoped ? 'JOIN user_scope us ON us.id_satker=s.id_satker AND us.id_user=$1' : ''}
          WHERE s.is_active=true
        ), ancestors AS (
          SELECT * FROM scoped_satker
          UNION
          SELECT parent.id_satker, parent.kode_satker, parent.nama_satker, parent.tipe_satker,
                 parent.id_satker_induk, parent.is_active, false AS is_scope_allowed
          FROM satker parent
          JOIN ancestors child ON child.id_satker_induk=parent.id_satker
          WHERE parent.is_active=true
        ), descendants AS (
          SELECT * FROM scoped_satker
          UNION
          SELECT child.id_satker, child.kode_satker, child.nama_satker, child.tipe_satker,
                 child.id_satker_induk, child.is_active, true AS is_scope_allowed
          FROM satker child
          JOIN descendants parent ON child.id_satker_induk=parent.id_satker
          WHERE child.is_active=true
        )
        SELECT id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active,
               bool_or(is_scope_allowed) AS is_scope_allowed
        FROM (SELECT * FROM ancestors UNION SELECT * FROM descendants) visible
        GROUP BY id_satker, kode_satker, nama_satker, tipe_satker, id_satker_induk, is_active
        ORDER BY COALESCE(id_satker_induk, 0), nama_satker ASC`, scoped ? [req.user.id_user] : []);
      return res.json({ data: result.rows });
    } catch (error) { return next(error); }
  });
  router.get('/master/fungsi', authenticate, async (_req, res, next) => {
    try { const result = await query('SELECT id_fungsi, kode_fungsi, nama_fungsi, is_active FROM fungsi WHERE is_active=true ORDER BY nama_fungsi ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  router.get('/master/satker/:id/fungsi', authenticate, async (req, res, next) => {
    try { if (!(await assertSatkerAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Satker di luar scope Anda.' }); const result = await query(`SELECT f.id_fungsi, f.kode_fungsi, f.nama_fungsi, sf.is_active FROM fungsi f JOIN satker_fungsi sf ON sf.id_fungsi=f.id_fungsi WHERE sf.id_satker=$1 AND sf.is_active=true AND f.is_active=true ORDER BY f.nama_fungsi ASC`, [req.params.id]); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  router.get('/master/satker/:id/unit-kerja', authenticate, async (req, res, next) => {
    try { if (!(await assertSatkerAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Satker di luar scope Anda.' }); const result = await query('SELECT id_unit, kode_unit, nama_unit, tipe_unit, id_unit_induk, is_active FROM unit_kerja u WHERE id_satker=$1 AND is_active=true AND (COALESCE(is_placeholder,false)=false OR NOT EXISTS (SELECT 1 FROM unit_kerja real_u WHERE real_u.id_satker=u.id_satker AND COALESCE(real_u.is_placeholder,false)=false)) ORDER BY nama_unit ASC', [req.params.id]); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  router.get('/master/satker/:id/unsur-pembantu-pimpinan', authenticate, async (req, res, next) => {
    try {
      if (!(await assertSatkerAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Satker di luar scope Anda.' });
      const result = await query(`WITH RECURSIVE unsur AS (
          SELECT u.id_unit, u.kode_unit, u.nama_unit, u.tipe_unit, u.id_unit_induk, u.is_active
          FROM unit_kerja u WHERE u.id_satker=$1 AND (u.kode_unit LIKE 'BAG%' OR u.kode_unit LIKE 'SAT%' OR u.kode_unit LIKE 'SI%' OR u.kode_unit='POLSEK') AND u.is_active=true AND COALESCE(u.is_placeholder,false)=false
        UNION
          SELECT child.id_unit, child.kode_unit, child.nama_unit, child.tipe_unit, child.id_unit_induk, child.is_active
          FROM unit_kerja child JOIN unsur parent ON child.id_unit_induk=parent.id_unit
          WHERE child.id_satker=$1 AND child.is_active=true AND COALESCE(child.is_placeholder,false)=false
        ), parent_chain AS (
          SELECT * FROM unsur
          UNION
          SELECT parent.id_unit, parent.kode_unit, parent.nama_unit, parent.tipe_unit, parent.id_unit_induk, parent.is_active
          FROM unit_kerja parent JOIN parent_chain child ON child.id_unit_induk=parent.id_unit
          WHERE parent.id_satker=$1 AND parent.is_active=true AND COALESCE(parent.is_placeholder,false)=false
        ) SELECT DISTINCT * FROM parent_chain ORDER BY id_unit_induk NULLS FIRST, nama_unit ASC`, [req.params.id]);
      return res.json({ data: result.rows });
    } catch (error) { return next(error); }
  });
  router.get('/master/level-jabatan', authenticate, async (_req, res, next) => {
    try { const result = await query('SELECT id_level_jabatan, kode_level, nama_level, urutan, is_active FROM level_jabatan WHERE is_active=true ORDER BY urutan ASC, nama_level ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  router.get('/master/status-jabatan', authenticate, async (_req, res, next) => {
    try { const result = await query('SELECT id_status_jabatan, kode_status, nama_status, is_active FROM status_jabatan WHERE is_active=true ORDER BY nama_status ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  // Status personel ditampilkan dari nilai aktual agar filter tidak mengarang kategori.
  router.get('/master/status-personel', authenticate, async (_req, res, next) => {
    try {
      const data = await getOrSetJson('master:status-personel', async () => {
        const result = await query(`SELECT status
        FROM (SELECT DISTINCT TRIM(status_pegawai) AS status
              FROM pegawai WHERE NULLIF(TRIM(status_pegawai), '') IS NOT NULL) statuses
        ORDER BY CASE WHEN UPPER(status)='AKTIF' THEN 0 ELSE 1 END, status ASC`);
        return result.rows;
      }, 300);
      return res.json({ data });
    } catch (error) { return next(error); }
  });
  router.get('/master/unit-kerja', authenticate, async (req, res, next) => {
    try { const satkerId = Number(req.query.satker_id); const result = satkerId ? await query('SELECT id_unit, kode_unit, nama_unit, tipe_unit, id_unit_induk, is_active FROM unit_kerja u WHERE id_satker=$1 AND is_active=true AND (COALESCE(is_placeholder,false)=false OR NOT EXISTS (SELECT 1 FROM unit_kerja real_u WHERE real_u.id_satker=u.id_satker AND COALESCE(real_u.is_placeholder,false)=false)) ORDER BY nama_unit ASC', [satkerId]) : await query('SELECT id_unit, nama_unit FROM unit_kerja WHERE is_active=true ORDER BY nama_unit ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  router.get('/master/jabatan', authenticate, async (req, res, next) => {
    try {
      const satkerId = Number(req.query.satker_id);
      const unitId = Number(req.query.unit_id);
      if (unitId) {
        const result = await query(`SELECT j.id_jabatan, j.nama_jabatan, j.jenis_jabatan
          FROM jabatan j JOIN jabatan_unit_kerja ju ON ju.id_jabatan=j.id_jabatan
          JOIN unit_kerja u ON u.id_unit=ju.id_unit
          WHERE ju.id_unit=$1 AND ju.is_active=true AND ju.sumber <> 'legacy-assignment'
            AND ($2::int IS NULL OR u.id_satker=$2)
          ORDER BY j.jenis_jabatan, j.nama_jabatan ASC`, [unitId, satkerId || null]);
        return res.json({ data: result.rows, filtered: true });
      }
      if (satkerId) {
        const result = await query(`SELECT DISTINCT j.id_jabatan, j.nama_jabatan, j.jenis_jabatan
          , u.tipe_unit, u.nama_unit
          FROM jabatan j JOIN jabatan_unit_kerja ju ON ju.id_jabatan=j.id_jabatan
          JOIN unit_kerja u ON u.id_unit=ju.id_unit
          WHERE u.id_satker=$1 AND ju.is_active=true AND ju.sumber <> 'legacy-assignment'
          ORDER BY j.jenis_jabatan, j.nama_jabatan ASC`, [satkerId]);
        return res.json({ data: result.rows, filtered: true });
      }
      const result = await query('SELECT id_jabatan, nama_jabatan, jenis_jabatan FROM jabatan ORDER BY nama_jabatan ASC');
      return res.json({ data: result.rows, filtered: false });
    } catch (error) { return next(error); }
  });
  router.get('/master/golongan', authenticate, async (_req, res, next) => {
    try { const result = await query('SELECT id_golongan, kode_golongan, nama_pangkat FROM golongan ORDER BY id_golongan ASC'); return res.json({ data: result.rows }); } catch (error) { return next(error); }
  });
  
  // Ringkasan dashboard personel. Agregasi dilakukan di database agar seluruh
  // sumber legacy/domain dan pembatasan scope tetap konsisten di backend.
}
