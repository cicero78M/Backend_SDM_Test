import { employeeSelect } from "./shared.js";
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

export function registerPersonelRoutes(router) {
  router.get('/personel', authenticate, async (req, res, next) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
      const offset = (page - 1) * limit;
      const search = `%${String(req.query.search || '').trim()}%`;
      const params = [search];
      const filters = [];
      const addFilter = (sql, value) => { params.push(value); filters.push(sql.replace('?', `$${params.length}`)); };
      const status = String(req.query.status || '').trim().toUpperCase();
      const education = String(req.query.education || '').trim().toUpperCase();
      const position = String(req.query.position || '').trim().toLowerCase();
      const training = String(req.query.training || '').trim().toLowerCase();
      const mutation = String(req.query.mutation || '').trim().toLowerCase();
      const serviceMin = Number(req.query.service_min);
      const serviceMax = Number(req.query.service_max);
      if (status && status !== 'ALL') addFilter(' AND UPPER(TRIM(p.status_pegawai)) = ?', status);
      const educationRank = { SD: 1, SMP: 2, SMA: 3, D1: 4, D2: 5, D3: 6, D4: 7, S1: 7, S2: 8, S3: 9 };
      if (educationRank[education]) addFilter(` AND EXISTS (SELECT 1 FROM (SELECT id_pegawai, jenjang FROM riwayat_pendidikan_personel UNION ALL SELECT id_pegawai, jenjang FROM riwayat_pendidikan) ep WHERE ep.id_pegawai = p.id_pegawai AND CASE UPPER(TRIM(ep.jenjang)) WHEN 'SD' THEN 1 WHEN 'SMP' THEN 2 WHEN 'SMA' THEN 3 WHEN 'D1' THEN 4 WHEN 'D2' THEN 5 WHEN 'D3' THEN 6 WHEN 'D4' THEN 7 WHEN 'S1' THEN 7 WHEN 'S2' THEN 8 WHEN 'S3' THEN 9 ELSE 0 END >= ?)`, educationRank[education]);
      if (position === 'yes') filters.push(' AND EXISTS (SELECT 1 FROM riwayat_jabatan rj WHERE rj.id_pegawai = p.id_pegawai)');
      if (position === 'no') filters.push(' AND NOT EXISTS (SELECT 1 FROM riwayat_jabatan rj WHERE rj.id_pegawai = p.id_pegawai)');
      if (training === 'yes') filters.push(' AND EXISTS (SELECT 1 FROM (SELECT id_pegawai FROM riwayat_diklat_personel UNION ALL SELECT id_pegawai FROM riwayat_diklat) dt WHERE dt.id_pegawai = p.id_pegawai)');
      if (training === 'no') filters.push(' AND NOT EXISTS (SELECT 1 FROM (SELECT id_pegawai FROM riwayat_diklat_personel UNION ALL SELECT id_pegawai FROM riwayat_diklat) dt WHERE dt.id_pegawai = p.id_pegawai)');
      if (mutation === 'yes') filters.push(' AND EXISTS (SELECT 1 FROM riwayat_mutasi mt WHERE mt.id_pegawai = p.id_pegawai)');
      if (mutation === 'no') filters.push(' AND NOT EXISTS (SELECT 1 FROM riwayat_mutasi mt WHERE mt.id_pegawai = p.id_pegawai)');
      if (Number.isFinite(serviceMin) && serviceMin >= 0) addFilter(' AND p.tanggal_masuk IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.tanggal_masuk)) >= ?', Math.floor(serviceMin));
      if (Number.isFinite(serviceMax) && serviceMax >= 0) addFilter(' AND p.tanggal_masuk IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.tanggal_masuk)) <= ?', Math.floor(serviceMax));
      let scope = '';
      if (!isAdministrator(req.user)) {
        params.push(req.user.id_user);
        scope = ` AND EXISTS (SELECT 1 FROM user_scope us WHERE us.id_user = $${params.length} AND us.id_satker = p.id_satker)`;
      }
      const where = ` WHERE (p.nama ILIKE $1 OR p.nip ILIKE $1)${filters.join('')}${scope}`;
      const rows = await query(`${personnelSelect}${where} ORDER BY p.nama ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      const total = await query(`SELECT COUNT(*)::int AS total FROM pegawai p${where}`, params);
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
      const history = await query(`WITH history_source AS (
          SELECT r.id_riwayat_jabatan, r.id_pegawai, r.id_jabatan, r.id_satker, r.id_unit, r.id_level_jabatan, r.id_status_jabatan,
                 r.tanggal_mulai, r.tanggal_selesai, r.keterangan, TRUE AS dapat_diedit, 'domain'::text AS sumber_data
          FROM riwayat_jabatan r WHERE r.id_pegawai=$1
          UNION ALL
          SELECT -p.id_pegawai AS id_riwayat_jabatan, p.id_pegawai, p.id_jabatan, p.id_satker, p.id_unit, NULL::integer AS id_level_jabatan,
                 NULL::integer AS id_status_jabatan, p.tanggal_masuk AS tanggal_mulai, NULL::date AS tanggal_selesai,
                 'Jabatan aktif dari data personel legacy; histori jabatan terpisah belum tersedia.'::text AS keterangan,
                 FALSE AS dapat_diedit, 'legacy-current'::text AS sumber_data
          FROM pegawai p
          WHERE p.id_pegawai=$1 AND NOT EXISTS (SELECT 1 FROM riwayat_jabatan r WHERE r.id_pegawai=p.id_pegawai)
        )
        SELECT h.*, j.nama_jabatan, s.kode_satker, s.nama_satker, u.kode_unit, u.nama_unit, u.tipe_unit, l.kode_level, l.nama_level, st.kode_status, st.nama_status
        FROM history_source h LEFT JOIN jabatan j ON j.id_jabatan = h.id_jabatan LEFT JOIN satker s ON s.id_satker = h.id_satker
        LEFT JOIN unit_kerja u ON u.id_unit = h.id_unit LEFT JOIN level_jabatan l ON l.id_level_jabatan = h.id_level_jabatan
        LEFT JOIN status_jabatan st ON st.id_status_jabatan = h.id_status_jabatan
        ORDER BY h.tanggal_mulai ASC NULLS LAST, h.id_riwayat_jabatan ASC`, [req.params.id]);
      const education = await query(`SELECT id_pendidikan, id_pegawai, jenjang, institusi, jurusan, tahun_lulus, NULL::text AS nomor_ijazah, NULL::text AS keterangan, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at, 'legacy'::text AS sumber_data, FALSE AS dapat_diedit
        FROM riwayat_pendidikan l WHERE l.id_pegawai=$1
          AND NOT EXISTS (SELECT 1 FROM riwayat_pendidikan_personel d WHERE d.id_pegawai=l.id_pegawai AND UPPER(TRIM(d.jenjang)) = UPPER(TRIM(l.jenjang)) AND d.institusi IS NOT DISTINCT FROM l.institusi AND d.jurusan IS NOT DISTINCT FROM l.jurusan AND d.tahun_lulus IS NOT DISTINCT FROM l.tahun_lulus)
        UNION ALL
        SELECT id_pendidikan, id_pegawai, jenjang, institusi, jurusan, tahun_lulus, nomor_ijazah, keterangan, created_at, updated_at, 'domain'::text AS sumber_data, TRUE AS dapat_diedit
        FROM riwayat_pendidikan_personel WHERE id_pegawai=$1
        ORDER BY tahun_lulus DESC NULLS LAST, id_pendidikan DESC`, [req.params.id]);
      const training = await query(`SELECT rd.id_riwayat_diklat AS id_diklat, rd.id_pegawai, d.nama_diklat, NULL::text AS jenis_diklat, d.penyelenggara, rd.tanggal_mulai, rd.tanggal_selesai, d.jam_pelajaran, rd.nilai, NULL::text AS nomor_sertifikat, NULL::text AS keterangan, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at, 'legacy'::text AS sumber_data, FALSE AS dapat_diedit
        FROM riwayat_diklat rd JOIN diklat d ON d.id_diklat=rd.id_diklat WHERE rd.id_pegawai=$1
          AND NOT EXISTS (SELECT 1 FROM riwayat_diklat_personel p WHERE p.id_pegawai=rd.id_pegawai AND p.nama_diklat IS NOT DISTINCT FROM d.nama_diklat AND p.penyelenggara IS NOT DISTINCT FROM d.penyelenggara AND p.tanggal_mulai IS NOT DISTINCT FROM rd.tanggal_mulai AND p.tanggal_selesai IS NOT DISTINCT FROM rd.tanggal_selesai AND p.nilai IS NOT DISTINCT FROM rd.nilai)
        UNION ALL
        SELECT id_diklat, id_pegawai, nama_diklat, jenis_diklat, penyelenggara, tanggal_mulai, tanggal_selesai, jam_pelajaran, nilai, nomor_sertifikat, keterangan, created_at, updated_at, 'domain'::text AS sumber_data, TRUE AS dapat_diedit
        FROM riwayat_diklat_personel WHERE id_pegawai=$1
        ORDER BY tanggal_mulai DESC NULLS LAST, id_diklat DESC`, [req.params.id]);
      const mutation = await query(`WITH mutation_source AS (
          SELECT m.id_mutasi, m.id_pegawai, m.id_unit_lama, m.id_unit_baru, m.nomor_sk, m.tanggal_sk, m.tmt_mutasi, 'domain'::text AS sumber_data
          FROM riwayat_mutasi_personel m WHERE m.id_pegawai=$1
          UNION ALL
          SELECT l.id_mutasi, l.id_pegawai, l.id_unit_lama, l.id_unit_baru, l.nomor_sk, l.tanggal_sk, l.tmt_mutasi, 'legacy'::text AS sumber_data
          FROM riwayat_mutasi l WHERE l.id_pegawai=$1 AND NOT EXISTS (
            SELECT 1 FROM riwayat_mutasi_personel d
            WHERE d.id_pegawai=l.id_pegawai AND d.id_unit_lama IS NOT DISTINCT FROM l.id_unit_lama
              AND d.id_unit_baru=l.id_unit_baru AND d.nomor_sk IS NOT DISTINCT FROM l.nomor_sk
              AND d.tanggal_sk IS NOT DISTINCT FROM l.tanggal_sk AND d.tmt_mutasi=l.tmt_mutasi
          )
        )
        SELECT m.id_mutasi, m.id_pegawai, m.id_unit_lama, old_unit.nama_unit AS nama_unit_lama, m.id_unit_baru, new_unit.nama_unit AS nama_unit_baru,
               m.nomor_sk, m.tanggal_sk, m.tmt_mutasi, m.sumber_data
        FROM mutation_source m LEFT JOIN unit_kerja old_unit ON old_unit.id_unit=m.id_unit_lama LEFT JOIN unit_kerja new_unit ON new_unit.id_unit=m.id_unit_baru
        ORDER BY m.tmt_mutasi ASC, m.id_mutasi ASC`, [req.params.id]);
      return res.json({ data: { personel: person.rows[0], riwayat_jabatan: history.rows, pendidikan: education.rows, diklat: training.rows, riwayat_mutasi: mutation.rows } });
    } catch (error) { return next(error); }
  });
  
  // CRUD riwayat pendidikan personel, selalu mengikuti scope personel induk.
  router.get('/personel/:id/pendidikan', authenticate, async (req, res, next) => {
    try {
      if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
      const result = await query(`SELECT -l.id_pendidikan AS id_pendidikan, l.id_pegawai, l.jenjang, l.institusi, l.jurusan, l.tahun_lulus,
          NULL::text AS nomor_ijazah, NULL::text AS keterangan, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at,
          'legacy'::text AS sumber_data, FALSE AS dapat_diedit
        FROM riwayat_pendidikan l WHERE l.id_pegawai=$1
          AND NOT EXISTS (SELECT 1 FROM riwayat_pendidikan_personel d
            WHERE d.id_pegawai=l.id_pegawai AND UPPER(TRIM(d.jenjang))=UPPER(TRIM(l.jenjang))
              AND d.institusi IS NOT DISTINCT FROM l.institusi AND d.jurusan IS NOT DISTINCT FROM l.jurusan
              AND d.tahun_lulus IS NOT DISTINCT FROM l.tahun_lulus)
        UNION ALL
        SELECT id_pendidikan, id_pegawai, jenjang, institusi, jurusan, tahun_lulus, nomor_ijazah, keterangan,
          created_at, updated_at, 'domain'::text AS sumber_data, TRUE AS dapat_diedit
        FROM riwayat_pendidikan_personel WHERE id_pegawai=$1
        ORDER BY tahun_lulus DESC NULLS LAST, id_pendidikan DESC`, [req.params.id]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
      await writeAudit(req, 'DELETE', 'riwayat_pendidikan_personel', req.params.educationId, { id_pegawai: req.params.id });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });
  
  // CRUD riwayat diklat personel, dengan validasi rentang tanggal dan nilai.
  router.get('/personel/:id/diklat', authenticate, async (req, res, next) => {
    try {
      if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
      const result = await query(`SELECT -l.id_riwayat_diklat AS id_diklat, l.id_pegawai, d.nama_diklat,
          NULL::text AS jenis_diklat, d.penyelenggara, l.tanggal_mulai, l.tanggal_selesai, d.jam_pelajaran, l.nilai,
          NULL::text AS nomor_sertifikat, NULL::text AS keterangan, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at,
          'legacy'::text AS sumber_data, FALSE AS dapat_diedit
        FROM riwayat_diklat l JOIN diklat d ON d.id_diklat=l.id_diklat WHERE l.id_pegawai=$1
          AND NOT EXISTS (SELECT 1 FROM riwayat_diklat_personel p
            WHERE p.id_pegawai=l.id_pegawai AND p.nama_diklat IS NOT DISTINCT FROM d.nama_diklat
              AND p.penyelenggara IS NOT DISTINCT FROM d.penyelenggara AND p.tanggal_mulai IS NOT DISTINCT FROM l.tanggal_mulai
              AND p.tanggal_selesai IS NOT DISTINCT FROM l.tanggal_selesai AND p.nilai IS NOT DISTINCT FROM l.nilai)
        UNION ALL
        SELECT id_diklat, id_pegawai, nama_diklat, jenis_diklat, penyelenggara, tanggal_mulai, tanggal_selesai,
          jam_pelajaran, nilai, nomor_sertifikat, keterangan, created_at, updated_at, 'domain'::text AS sumber_data, TRUE AS dapat_diedit
        FROM riwayat_diklat_personel WHERE id_pegawai=$1
        ORDER BY tanggal_mulai DESC NULLS LAST, id_diklat DESC`, [req.params.id]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
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
      const { id_satker, nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, id_golongan, pangkat, nama_polsek, id_atasan, status_pegawai, batas_usia_pensiun } = parsed.data;
      const selectedUnit = await query('SELECT kode_unit FROM unit_kerja WHERE id_unit=$1 AND id_satker=$2 AND is_active=true', [id_unit, id_satker]);
      if (selectedUnit.rows[0]?.kode_unit === 'POLSEK' && !nama_polsek) return res.status(400).json({ error: 'Nama Polsek wajib diisi untuk unit Kepolisian Sektor.' });
      const allowedJob = await query("SELECT 1 FROM jabatan_unit_kerja WHERE id_jabatan=$1 AND id_unit=$2 AND is_active=true AND sumber <> 'legacy-assignment'", [id_jabatan, id_unit]);
      if (!allowedJob.rows[0]) return res.status(400).json({ error: 'Jabatan tidak sesuai dengan nomenklatur Unit Kerja yang dipilih.' });
      const result = await query(`INSERT INTO pegawai (nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,nama_polsek,id_atasan,status_pegawai,batas_usia_pensiun,id_satker)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`, [nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,nama_polsek,id_atasan,status_pegawai,batas_usia_pensiun,id_satker]);
      await query(`INSERT INTO riwayat_jabatan (id_pegawai,id_jabatan,id_satker,id_unit,id_status_jabatan,tanggal_mulai,keterangan)
        SELECT $1,$2,$3,$4,st.id_status_jabatan,COALESCE($5::date,CURRENT_DATE),'Jabatan aktif awal saat personel dibuat.'
        FROM status_jabatan st WHERE st.kode_status='MIGRASI_AKTIF'
        ON CONFLICT DO NOTHING`, [result.rows[0].id_pegawai, id_jabatan, id_satker, id_unit, tanggal_masuk]);
      await invalidateKeys(['master:status-personel']);
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
      const { id_satker, nip, jenis_personel, jenis_identitas, nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, tanggal_masuk, id_unit, id_jabatan, id_golongan, pangkat, nama_polsek, id_atasan, status_pegawai, batas_usia_pensiun } = parsed.data;
      const selectedUnit = await query('SELECT kode_unit FROM unit_kerja WHERE id_unit=$1 AND id_satker=$2 AND is_active=true', [id_unit, id_satker]);
      if (selectedUnit.rows[0]?.kode_unit === 'POLSEK' && !nama_polsek) return res.status(400).json({ error: 'Nama Polsek wajib diisi untuk unit Kepolisian Sektor.' });
      const allowedJob = await query("SELECT 1 FROM jabatan_unit_kerja WHERE id_jabatan=$1 AND id_unit=$2 AND is_active=true AND sumber <> 'legacy-assignment'", [id_jabatan, id_unit]);
      if (!allowedJob.rows[0]) {
        const currentJob = await query('SELECT id_jabatan FROM pegawai WHERE id_pegawai=$1', [req.params.id]);
        if (Number(currentJob.rows[0]?.id_jabatan) !== Number(id_jabatan)) return res.status(400).json({ error: 'Jabatan tidak sesuai dengan nomenklatur Unit Kerja yang dipilih.' });
      }
      const { result, changedPosition } = await withRedisLock(`personel:${req.params.id}`, () => withTransaction(async (client) => {
        // Mengunci personel agar perubahan bersamaan tidak membuat dua histori aktif.
        const previous = await client.query('SELECT id_jabatan, id_unit, id_satker FROM pegawai WHERE id_pegawai=$1 FOR UPDATE', [req.params.id]);
        if (!previous.rows[0]) return { result: { rows: [] }, changedPosition: false };
        const positionChanged = Number(previous.rows[0].id_jabatan) !== Number(id_jabatan)
          || Number(previous.rows[0].id_unit) !== Number(id_unit)
          || Number(previous.rows[0].id_satker) !== Number(id_satker);
        const updated = await client.query(`UPDATE pegawai SET nip=$1,jenis_personel=$2,jenis_identitas=$3,nik=$4,nama=$5,jenis_kelamin=$6,tempat_lahir=$7,tanggal_lahir=$8,tanggal_masuk=$9,id_unit=$10,id_jabatan=$11,id_golongan=$12,pangkat=$13,nama_polsek=$14,id_atasan=$15,status_pegawai=$16,batas_usia_pensiun=$17,id_satker=$18 WHERE id_pegawai=$19 RETURNING *`, [nip,jenis_personel,jenis_identitas,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,tanggal_masuk,id_unit,id_jabatan,id_golongan,pangkat,nama_polsek,id_atasan,status_pegawai,batas_usia_pensiun,id_satker,req.params.id]);
        if (positionChanged) {
          await client.query(`UPDATE riwayat_jabatan r
            SET tanggal_selesai=GREATEST(COALESCE(r.tanggal_mulai,CURRENT_DATE),CURRENT_DATE),
                id_status_jabatan=COALESCE(nonaktif.id_status_jabatan, r.id_status_jabatan),
                updated_at=NOW()
            FROM (SELECT id_status_jabatan FROM status_jabatan WHERE kode_status='MIGRASI_NONAKTIF' LIMIT 1) nonaktif
            WHERE r.id_pegawai=$1 AND r.tanggal_selesai IS NULL`, [req.params.id]);
          await client.query(`INSERT INTO riwayat_jabatan (id_pegawai,id_jabatan,id_satker,id_unit,id_status_jabatan,tanggal_mulai,keterangan)
            SELECT $1,$2,$3,$4,st.id_status_jabatan,CURRENT_DATE,'Perubahan jabatan/unit/Satker dari data personel.'
            FROM status_jabatan st WHERE st.kode_status='MIGRASI_AKTIF'`, [req.params.id, id_jabatan, id_satker, id_unit]);
        }
        return { result: updated, changedPosition: positionChanged };
      }));
      if (!result.rows[0]) return res.status(404).json({ error: 'Personel tidak ditemukan.' });
      await invalidateKeys(['master:status-personel', `profile:${req.params.id}`]);
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
      await invalidateKeys(['master:status-personel', `profile:${req.params.id}`]);
      await writeAudit(req, 'DELETE', 'personel', req.params.id);
      return res.status(204).end();
    } catch (error) { return next(error); }
  });
  
  // Endpoint READ semua histori jabatan personel secara kronologis.
  router.get('/personel/:id/riwayat-jabatan', authenticate, async (req, res, next) => {
    try {
      if (!(await assertPersonnelAccess(req.user, req.params.id))) return res.status(403).json({ error: 'Personel di luar scope Anda.' });
      const result = await query(`SELECT r.*, j.nama_jabatan, s.kode_satker, s.nama_satker, u.kode_unit, u.nama_unit, u.tipe_unit, l.kode_level, l.nama_level, st.kode_status, st.nama_status
        FROM riwayat_jabatan r JOIN jabatan j ON j.id_jabatan = r.id_jabatan JOIN satker s ON s.id_satker = r.id_satker
        LEFT JOIN unit_kerja u ON u.id_unit = r.id_unit LEFT JOIN level_jabatan l ON l.id_level_jabatan = r.id_level_jabatan JOIN status_jabatan st ON st.id_status_jabatan = r.id_status_jabatan
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
      if (isPolresOperator(req.user)) {
        const person = await query('SELECT id_satker FROM pegawai WHERE id_pegawai=$1', [req.params.id]);
        if (!person.rows[0] || Number(person.rows[0].id_satker) !== Number(parsed.data.id_satker)) return res.status(403).json({ error: 'Operator Polres hanya dapat memilih Satker personel.' });
      }
      if (!(await assertPersonnelAccess(req.user, req.params.id, parsed.data.id_satker))) return res.status(403).json({ error: 'Personel atau Satker di luar scope Anda.' });
      if (!(await assertUnitBelongsToSatker(parsed.data.id_unit, parsed.data.id_satker))) return res.status(400).json({ error: 'Unsur Pembantu Pimpinan tidak berada di bawah Satker yang dipilih.' });
      const { id_jabatan, id_satker, id_unit, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan } = parsed.data;
      const allowedJob = await query(`WITH RECURSIVE parent_chain AS (
          SELECT id_unit, kode_unit, id_unit_induk, tipe_unit FROM unit_kerja WHERE id_unit=$2 AND id_satker=$3 AND is_active=true
          UNION ALL SELECT parent.id_unit, parent.kode_unit, parent.id_unit_induk, parent.tipe_unit FROM unit_kerja parent JOIN parent_chain child ON child.id_unit_induk=parent.id_unit WHERE parent.is_active=true
        ) SELECT 1 FROM jabatan_unit_kerja ju JOIN parent_chain pc ON pc.id_unit=ju.id_unit
        WHERE ju.id_jabatan=$1 AND ju.id_unit=$2 AND ju.is_active=true AND ju.sumber <> 'legacy-assignment'
          AND EXISTS (SELECT 1 FROM parent_chain WHERE kode_unit LIKE 'BAG%' OR kode_unit LIKE 'SAT%' OR kode_unit LIKE 'SI%' OR kode_unit='POLSEK') LIMIT 1`, [id_jabatan, id_unit, id_satker]);
      if (!allowedJob.rowCount) return res.status(400).json({ error: 'Jabatan tidak tersedia pada Satker yang dipilih.' });
      const result = await query(`INSERT INTO riwayat_jabatan (id_pegawai,id_jabatan,id_satker,id_unit,id_level_jabatan,id_status_jabatan,tanggal_mulai,tanggal_selesai,keterangan,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.params.id, id_jabatan, id_satker, id_unit, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan, req.user.id_user]);
      await invalidateKeys([`profile:${req.params.id}`]);
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
      if (isPolresOperator(req.user)) {
        const person = await query('SELECT id_satker FROM pegawai WHERE id_pegawai=$1', [req.params.id]);
        if (!person.rows[0] || Number(person.rows[0].id_satker) !== Number(parsed.data.id_satker)) return res.status(403).json({ error: 'Operator Polres hanya dapat memilih Satker personel.' });
      }
      if (!(await assertPersonnelAccess(req.user, req.params.id, parsed.data.id_satker))) return res.status(403).json({ error: 'Personel atau Satker di luar scope Anda.' });
      if (!(await assertUnitBelongsToSatker(parsed.data.id_unit, parsed.data.id_satker))) return res.status(400).json({ error: 'Unsur Pembantu Pimpinan tidak berada di bawah Satker yang dipilih.' });
      const { id_jabatan, id_satker, id_unit, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan } = parsed.data;
      const allowedJob = await query(`WITH RECURSIVE parent_chain AS (
          SELECT id_unit, kode_unit, id_unit_induk, tipe_unit FROM unit_kerja WHERE id_unit=$2 AND id_satker=$3 AND is_active=true
          UNION ALL SELECT parent.id_unit, parent.kode_unit, parent.id_unit_induk, parent.tipe_unit FROM unit_kerja parent JOIN parent_chain child ON child.id_unit_induk=parent.id_unit WHERE parent.is_active=true
        ) SELECT 1 FROM jabatan_unit_kerja ju JOIN parent_chain pc ON pc.id_unit=ju.id_unit
        WHERE ju.id_jabatan=$1 AND ju.id_unit=$2 AND ju.is_active=true AND ju.sumber <> 'legacy-assignment'
          AND EXISTS (SELECT 1 FROM parent_chain WHERE kode_unit LIKE 'BAG%' OR kode_unit LIKE 'SAT%' OR kode_unit LIKE 'SI%' OR kode_unit='POLSEK') LIMIT 1`, [id_jabatan, id_unit, id_satker]);
      if (!allowedJob.rowCount) return res.status(400).json({ error: 'Jabatan tidak tersedia pada Satker yang dipilih.' });
      const result = await query(`UPDATE riwayat_jabatan SET id_jabatan=$1,id_satker=$2,id_unit=$3,id_level_jabatan=$4,id_status_jabatan=$5,tanggal_mulai=$6,tanggal_selesai=$7,keterangan=$8,updated_by=$9,updated_at=NOW()
        WHERE id_riwayat_jabatan=$10 AND id_pegawai=$11 RETURNING *`, [id_jabatan, id_satker, id_unit, id_level_jabatan, id_status_jabatan, tanggal_mulai, tanggal_selesai, keterangan, req.user.id_user, req.params.historyId, req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Riwayat jabatan tidak ditemukan.' });
      await invalidateKeys([`profile:${req.params.id}`]);
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
      await invalidateKeys([`profile:${req.params.id}`]);
      await writeAudit(req, 'DELETE', 'riwayat_jabatan', req.params.historyId, { id_pegawai: req.params.id });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });
}
