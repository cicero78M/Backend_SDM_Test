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

export function registerPegawaiRoutes(router) {
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
}
