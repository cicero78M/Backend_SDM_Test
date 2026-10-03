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

export function registerDashboardRoutes(router) {
  router.get('/dashboard/overview', authenticate, async (req, res, next) => {
    try {
      const cacheKey = `dashboard:overview:user:${req.user.id_user}:role:${req.user.role}`;
      const cached = await getOrSetJson(cacheKey, async () => {
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
        query(`SELECT COALESCE(NULLIF(TRIM(status_pegawai),''),'TIDAK DIISI') AS label, COUNT(*)::int AS value FROM pegawai p ${peopleWhere} GROUP BY COALESCE(NULLIF(TRIM(status_pegawai),''),'TIDAK DIISI') ORDER BY value DESC, label ASC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`WITH education_records AS (
            SELECT r.id_pegawai, r.jenjang, r.tahun_lulus, r.id_pendidikan, 0 AS source_priority FROM riwayat_pendidikan r
            UNION ALL
            SELECT d.id_pegawai, d.jenjang, d.tahun_lulus, d.id_pendidikan, 1 AS source_priority FROM riwayat_pendidikan_personel d
          ), latest_education AS (
            SELECT DISTINCT ON (id_pegawai) id_pegawai, jenjang
            FROM education_records
            ORDER BY id_pegawai, tahun_lulus DESC NULLS LAST, source_priority DESC, id_pendidikan DESC
          )
          SELECT COALESCE(NULLIF(TRIM(e.jenjang),''),'Tidak diisi') AS label, COUNT(*)::int AS value
          FROM pegawai p LEFT JOIN latest_education e ON e.id_pegawai=p.id_pegawai
          WHERE 1=1${personScope}
          GROUP BY COALESCE(NULLIF(TRIM(e.jenjang),''),'Tidak diisi')
          ORDER BY value DESC, label ASC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`WITH q AS (
            SELECT l.id_pegawai, d.nama_diklat, l.tanggal_mulai, l.tanggal_selesai FROM riwayat_diklat l JOIN diklat d ON d.id_diklat=l.id_diklat
            UNION
            SELECT id_pegawai, nama_diklat, tanggal_mulai, tanggal_selesai FROM riwayat_diklat_personel
          ), counts AS (SELECT q.id_pegawai, COUNT(*)::int AS jumlah FROM q JOIN pegawai p ON p.id_pegawai=q.id_pegawai WHERE 1=1${personScope} GROUP BY q.id_pegawai)
          SELECT COUNT(*) FILTER (WHERE jumlah >= 1)::int AS pernah, COUNT(*) FILTER (WHERE jumlah > 1)::int AS lebih_dari_satu, (SELECT COUNT(*)::int FROM pegawai p WHERE 1=1${personScope}) AS total FROM counts`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`WITH q AS (
            SELECT id_pegawai, id_unit_lama, id_unit_baru, nomor_sk, tanggal_sk, tmt_mutasi FROM riwayat_mutasi
            UNION
            SELECT id_pegawai, id_unit_lama, id_unit_baru, nomor_sk, tanggal_sk, tmt_mutasi FROM riwayat_mutasi_personel
          ), counts AS (SELECT q.id_pegawai, COUNT(*)::int AS jumlah FROM q JOIN pegawai p ON p.id_pegawai=q.id_pegawai WHERE 1=1${personScope} GROUP BY q.id_pegawai)
          SELECT COUNT(*) FILTER (WHERE jumlah >= 1)::int AS pernah, COUNT(*) FILTER (WHERE jumlah > 1)::int AS lebih_dari_satu, (SELECT COUNT(*)::int FROM pegawai p WHERE 1=1${personScope}) AS total FROM counts`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT CASE WHEN tanggal_masuk IS NULL THEN 'Tidak diisi' WHEN AGE(CURRENT_DATE,tanggal_masuk) < INTERVAL '5 years' THEN '< 5 tahun' WHEN AGE(CURRENT_DATE,tanggal_masuk) < INTERVAL '10 years' THEN '5–9 tahun' WHEN AGE(CURRENT_DATE,tanggal_masuk) < INTERVAL '20 years' THEN '10–19 tahun' ELSE '20+ tahun' END AS label, COUNT(*)::int AS value FROM pegawai p ${peopleWhere} GROUP BY 1 ORDER BY MIN(COALESCE(tanggal_masuk,CURRENT_DATE))`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT COUNT(*) FILTER (WHERE tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun,58)) <= CURRENT_DATE)::int AS sudah, COUNT(*) FILTER (WHERE tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun,58)) > CURRENT_DATE AND tanggal_lahir + make_interval(years => COALESCE(batas_usia_pensiun,58)) <= CURRENT_DATE + INTERVAL '5 years')::int AS mendekati, COUNT(*)::int AS total FROM pegawai p ${peopleWhere}`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT COALESCE(l.nama_level, 'Nivelering belum diisi') AS label, COUNT(DISTINCT r.id_pegawai)::int AS value FROM riwayat_jabatan r JOIN pegawai p ON p.id_pegawai=r.id_pegawai JOIN status_jabatan st ON st.id_status_jabatan=r.id_status_jabatan LEFT JOIN level_jabatan l ON l.id_level_jabatan=r.id_level_jabatan WHERE r.tanggal_selesai IS NULL AND st.is_active=true${personScope} GROUP BY l.nama_level ORDER BY value DESC, label ASC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT CASE WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) < 18 THEN 'Di bawah 18 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 25 THEN '18–25 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 35 THEN '26–35 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 45 THEN '36–45 tahun' WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)) <= 58 THEN '46–58 tahun' ELSE 'Di atas 58 tahun' END AS label, COUNT(*)::int AS value FROM pegawai p ${peopleWhere} GROUP BY 1 ORDER BY MIN(EXTRACT(YEAR FROM AGE(CURRENT_DATE,p.tanggal_lahir)))`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') AS label, COUNT(*)::int AS value FROM pegawai p LEFT JOIN golongan g ON g.id_golongan=p.id_golongan ${peopleWhere} GROUP BY COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') AS label, COUNT(*)::int AS value FROM pegawai p LEFT JOIN golongan g ON g.id_golongan=p.id_golongan WHERE p.jenis_personel='POLRI'${personScope} GROUP BY COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') AS label, COUNT(*)::int AS value FROM pegawai p LEFT JOIN golongan g ON g.id_golongan=p.id_golongan WHERE p.jenis_personel<>'POLRI'${personScope} GROUP BY COALESCE(g.nama_pangkat, p.pangkat, 'Golongan/pangkat belum diisi') ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        query(`SELECT 'Tanpa tanggal lahir' AS label, COUNT(*)::int AS value FROM pegawai p WHERE p.tanggal_lahir IS NULL${personScope} UNION ALL SELECT 'Tanpa tanggal masuk' AS label, COUNT(*)::int FROM pegawai p WHERE p.tanggal_masuk IS NULL${personScope} UNION ALL SELECT 'Tanpa Satker' AS label, COUNT(*)::int FROM pegawai p WHERE p.id_satker IS NULL${personScope} UNION ALL SELECT 'Tanpa unit kerja' AS label, COUNT(*)::int FROM pegawai p WHERE p.id_unit IS NULL${personScope} UNION ALL SELECT 'Tanpa jabatan' AS label, COUNT(*)::int FROM pegawai p WHERE p.id_jabatan IS NULL${personScope} UNION ALL SELECT 'Identitas tidak sesuai jenis personel' AS label, COUNT(*)::int FROM pegawai p WHERE ((p.jenis_personel='POLRI' AND p.jenis_identitas<>'NRP') OR (p.jenis_personel<>'POLRI' AND p.jenis_identitas<>'NIP'))${personScope} ORDER BY value DESC`, params.slice(0, isAdministrator(req.user) ? 0 : 1)),
        isAdministrator(req.user) ? query("SELECT COALESCE(status_validasi,'BELUM_DIVALIDASI') AS label, COUNT(*)::int AS value FROM staging_pegawai GROUP BY status_validasi ORDER BY value DESC", []) : Promise.resolve({ rows: [] })
      ]);
      const trainingRow = training.rows[0] || { pernah: 0, lebih_dari_satu: 0, total: 0 };
      const mutationRow = mutation.rows[0] || { pernah: 0, lebih_dari_satu: 0, total: 0 };
      return { total_personel: total.rows[0]?.total || 0, status: status.rows, golongan: rankGroup.rows, golongan_polri: polriRankGroup.rows, golongan_asn: asnRankGroup.rows, pendidikan: education.rows, diklat: { pernah: Number(trainingRow.pernah), belum: Math.max(Number(trainingRow.total) - Number(trainingRow.pernah), 0), lebih_dari_satu: Number(trainingRow.lebih_dari_satu), total: Number(trainingRow.total) }, mutasi: { pernah: Number(mutationRow.pernah), belum: Math.max(Number(mutationRow.total) - Number(mutationRow.pernah), 0), lebih_dari_satu: Number(mutationRow.lebih_dari_satu), total: Number(mutationRow.total) }, kualitas_data: dataQuality.rows, validasi_staging: stagingQuality.rows, lama_dinas: service.rows, pensiun: retirement.rows[0] || { sudah: 0, mendekati: 0, total: 0 }, kelompok_jabatan: positionGroup.rows, kelompok_usia: ageGroup.rows };
      }, 30);
      return res.json({ data: cached });
    } catch (error) { return next(error); }
  });
  
  // Endpoint READ daftar personel versi domain Merit System.
}
