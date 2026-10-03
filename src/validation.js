// Mengimpor Zod sebagai library validasi request.
import { z } from 'zod';
export const POLRI_RANKS = ['JENDERAL POLISI', 'KOMISARIS JENDERAL POLISI', 'INSPEKTUR JENDERAL POLISI', 'BRIGADIR JENDERAL POLISI', 'KOMISARIS BESAR POLISI', 'AJUN KOMISARIS BESAR POLISI', 'KOMISARIS POLISI', 'AJUN KOMISARIS POLISI', 'INSPEKTUR POLISI SATU', 'INSPEKTUR POLISI DUA', 'AJUN INSPEKTUR POLISI SATU', 'AJUN INSPEKTUR POLISI DUA', 'BRIGADIR POLISI KEPALA', 'BRIGADIR POLISI', 'BRIGADIR POLISI SATU', 'BRIGADIR POLISI DUA', 'AJUN BRIGADIR POLISI KEPALA', 'AJUN BRIGADIR POLISI', 'BHAYANGKARA KEPALA', 'BHAYANGKARA SATU', 'BHAYANGKARA DUA'];
// Membatasi format tanggal menjadi YYYY-MM-DD.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.');
// Schema registrasi; role sengaja tidak menerima input publik agar tidak terjadi privilege escalation.
export const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(150),
  nama: z.string().trim().min(2).max(100),
  jenis_personel: z.enum(['POLRI', 'ASN']),
  pangkat: z.string().trim().max(80).optional().nullable(),
  id_golongan: z.coerce.number().int().positive().optional().nullable(),
  nip: z.string().trim().regex(/^\d{8,18}$/, 'NRP/NIP harus 8–18 digit.'),
  id_satker: z.coerce.number().int().positive(),
  password: z.string().min(8).max(100)
}).superRefine((value, context) => {
  if (value.jenis_personel === 'POLRI') {
    if (!value.pangkat || !POLRI_RANKS.includes(value.pangkat)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['pangkat'], message: 'Pangkat POLRI harus dipilih dari daftar.' });
    if (value.id_golongan) context.addIssue({ code: z.ZodIssueCode.custom, path: ['id_golongan'], message: 'POLRI tidak menggunakan golongan ASN.' });
    if (!/^\d{8}$/.test(value.nip)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nip'], message: 'NRP POLRI harus tepat 8 digit.' });
  }
  if (value.jenis_personel === 'ASN') {
    if (!value.id_golongan) context.addIssue({ code: z.ZodIssueCode.custom, path: ['id_golongan'], message: 'Golongan ASN wajib dipilih.' });
    if (!/^\d{18}$/.test(value.nip)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['nip'], message: 'NIP ASN harus tepat 18 digit.' });
  }
});
export const registerVerifyEmailSchema = z.object({
  registration_id: z.coerce.number().int().positive(),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP harus 6 digit.'),
});
export const registerResendOtpSchema = z.object({
  registration_id: z.coerce.number().int().positive(),
});
export const approvalSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  approved_role: z.enum(['viewer', 'editor', 'admin', 'admin_ssdm', 'operator_polda', 'operator_satker', 'operator_polres']).default('operator_satker'),
  scope_satker: z.array(z.coerce.number().int().positive()).max(100).default([]).refine((items) => new Set(items).size === items.length, 'Scope Satker tidak boleh duplikat.'),
  note: z.string().trim().max(500).optional().nullable()
});
export const roleUpdateSchema = z.object({ role: z.enum(['viewer', 'editor', 'admin', 'admin_ssdm', 'operator_polda', 'operator_satker', 'operator_polres']) });
export const userStatusSchema = z.object({ is_active: z.boolean(), reason: z.string().trim().max(500).optional().nullable() });
export const userScopeSchema = z.object({ id_satker: z.array(z.number().int().positive()).max(100).refine((items) => new Set(items).size === items.length, 'Satker tidak boleh duplikat.') });
// Schema login dengan username dan password wajib.
export const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
// Schema perubahan password oleh user yang sedang login.
export const changePasswordSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(8).max(100) });
// Schema permintaan reset; identifier dapat berupa username atau email.
// Field username dipertahankan sementara agar bundle frontend lama tetap kompatibel.
export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1).max(150).optional(),
  username: z.string().trim().min(1).max(50).optional(),
}).refine(value => value.identifier || value.username, { message: 'Username atau email wajib diisi.', path: ['identifier'] });
// Schema penggunaan token reset satu kali dengan konfirmasi password.
export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(200),
  new_password: z.string().min(8).max(100),
  confirm_password: z.string().min(8).max(100),
}).refine(value => value.new_password === value.confirm_password, {
  message: 'Password baru dan masukan ulang password harus sama.',
  path: ['confirm_password'],
});
// Schema reset password oleh administrator.
export const adminResetPasswordSchema = z.object({ new_password: z.string().min(8).max(100) });
// Schema lengkap payload CRUD pegawai.
export const employeeSchema = z.object({
  // Nomor identitas dapat berupa NRP Polri atau NIP ASN.
  nip: z.string().trim().regex(/^\d{8,18}$/, 'Nomor identitas harus 8–18 digit (NRP/NIP).'),
  jenis_personel: z.enum(['POLRI', 'ASN', 'PPPK', 'HONORER', 'LAINNYA']).default('POLRI'),
  jenis_identitas: z.enum(['NRP', 'NIP']).default('NRP'),
  // NIK harus berisi tepat 16 digit angka.
  nik: z.string().regex(/^\d{16}$/, 'NIK harus 16 digit.'),
  // Nama dibersihkan dari spasi berlebih dan dibatasi panjangnya.
  nama: z.string().trim().min(2).max(100),
  // Jenis kelamin hanya menerima nilai sesuai constraint database.
  jenis_kelamin: z.enum(['L', 'P']),
  // Field tempat lahir boleh kosong.
  tempat_lahir: z.string().trim().max(50).optional().nullable(),
  // Nama manual Polsek hanya diisi saat unit kerja yang dipilih berkode POLSEK.
  nama_polsek: z.string().trim().max(100).optional().nullable(),
  // Tanggal lahir wajib memakai format yang ditentukan.
  tanggal_lahir: date,
  // Tanggal masuk wajib memakai format yang ditentukan.
  tanggal_masuk: date.nullable().default(null),
  // Foreign key unit kerja harus berupa bilangan positif.
  id_unit: z.number().int().positive(),
  // Foreign key jabatan harus berupa bilangan positif.
  id_jabatan: z.number().int().positive(),
  // Golongan tidak dipaksa untuk Polri; pangkat dapat disimpan langsung sesuai SOTK.
  id_golongan: z.number().int().positive().optional().nullable(),
  pangkat: z.string().trim().max(80).optional().nullable(),
  // Atasan boleh kosong, tetapi jika diisi harus berupa ID valid.
  id_atasan: z.number().int().positive().optional().nullable(),
  // Status memiliki nilai default AKTIF.
  status_pegawai: z.string().trim().min(1).max(15).default('AKTIF'),
  // Batas usia pensiun diberi rentang kewajaran.
  batas_usia_pensiun: z.number().int().min(1).max(100).default(58),
});
// Schema personel Merit System mewajibkan Satker agar data dapat dibatasi berdasarkan scope.
export const personnelSchema = employeeSchema.extend({
  // Satker adalah unit organisasi pemilik tanggung jawab data personel.
  id_satker: z.number().int().positive(),
});
// Schema CRUD riwayat jabatan dengan tanggal mulai dan selesai yang konsisten.
export const jobHistorySchema = z.object({
  // Jabatan yang pernah diduduki personel.
  id_jabatan: z.number().int().positive(),
  // Satker tempat jabatan dijalankan.
  id_satker: z.number().int().positive(),
  // Unsur Pembantu Pimpinan wajib berasal dari unit aktif pada Satker.
  id_unit: z.number().int().positive(),
  // Nivelering jabatan boleh belum diisi pada data lama.
  id_level_jabatan: z.number().int().positive().optional().nullable(),
  // Status jabatan wajib menunjukkan status penugasan.
  id_status_jabatan: z.number().int().positive(),
  // Tanggal mulai wajib ISO date.
  tanggal_mulai: date,
  // Tanggal selesai boleh kosong untuk jabatan aktif.
  tanggal_selesai: date.optional().nullable(),
  // Keterangan tambahan bersifat opsional.
  keterangan: z.string().trim().max(2000).optional().nullable(),
}).superRefine((value, context) => {
  if (value.tanggal_selesai && value.tanggal_selesai < value.tanggal_mulai) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tanggal_selesai'], message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
  }
});
// Schema penilaian merit: nilai mentah selalu berada pada rentang 0-100.
export const meritAssessmentSchema = z.object({
  id_period: z.number().int().positive(),
  id_indicator: z.number().int().positive(),
  nilai_raw: z.number().min(0).max(100),
  bukti: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['DRAFT', 'DIAJUKAN', 'DIVERIFIKASI', 'DITOLAK']).default('DRAFT'),
});
// Schema riwayat pendidikan personel; setiap record merepresentasikan satu kualifikasi.
export const educationSchema = z.object({
  jenjang: z.enum(['SD', 'SMP', 'SMA', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']),
  institusi: z.string().trim().min(2).max(150),
  jurusan: z.string().trim().max(150).optional().nullable(),
  tahun_lulus: z.number().int().min(1900).max(2100).optional().nullable(),
  nomor_ijazah: z.string().trim().max(100).optional().nullable(),
  keterangan: z.string().trim().max(1000).optional().nullable(),
});
// Schema riwayat diklat personel dengan rentang tanggal yang konsisten.
export const trainingSchema = z.object({
  nama_diklat: z.string().trim().min(2).max(200),
  jenis_diklat: z.string().trim().max(100).optional().nullable(),
  penyelenggara: z.string().trim().max(150).optional().nullable(),
  tanggal_mulai: date.optional().nullable(),
  tanggal_selesai: date.optional().nullable(),
  jam_pelajaran: z.number().int().min(0).max(10000).optional().nullable(),
  nilai: z.number().min(0).max(100).optional().nullable(),
  nomor_sertifikat: z.string().trim().max(100).optional().nullable(),
  keterangan: z.string().trim().max(1000).optional().nullable(),
}).superRefine((value, context) => {
  if (value.tanggal_mulai && value.tanggal_selesai && value.tanggal_selesai < value.tanggal_mulai) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tanggal_selesai'], message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
  }
});
const VALIDATION_FIELD_LABELS = {
  nip: 'NRP/NIP',
  jenis_personel: 'jenis personel',
  jenis_identitas: 'jenis identitas',
  nik: 'NIK',
  nama: 'nama lengkap',
  jenis_kelamin: 'jenis kelamin',
  tanggal_lahir: 'tanggal lahir',
  tanggal_masuk: 'tanggal masuk',
  id_satker: 'Satker',
  id_unit: 'unit kerja',
  id_jabatan: 'jabatan',
  id_golongan: 'golongan',
  pangkat: 'pangkat',
  nama_polsek: 'nama Polsek',
  id_atasan: 'atasan',
  status_pegawai: 'status personel',
  batas_usia_pensiun: 'batas usia pensiun',
};

function readableValidationMessage(issue, label) {
  if (issue.code === 'invalid_type') {
    if (issue.received === 'undefined') return `${label} wajib diisi.`;
    if (issue.received === 'null') return `${label} tidak boleh kosong.`;
    if (issue.expected === 'number') return `${label} harus berupa angka.`;
    if (issue.expected === 'string') return `${label} harus berupa teks.`;
    if (issue.expected === 'array') return `${label} harus berupa daftar.`;
  }
  if (issue.code === 'invalid_enum_value') return `${label} memiliki pilihan yang tidak valid.`;
  if (issue.code === 'too_small') {
    const minimum = issue.minimum;
    if (issue.type === 'string') return `${label} minimal ${minimum} karakter.`;
    if (issue.type === 'number') return `${label} minimal bernilai ${minimum}.`;
    if (issue.type === 'array') return `${label} minimal berisi ${minimum} pilihan.`;
  }
  if (issue.code === 'too_big') {
    const maximum = issue.maximum;
    if (issue.type === 'string') return `${label} maksimal ${maximum} karakter.`;
    if (issue.type === 'number') return `${label} maksimal bernilai ${maximum}.`;
    if (issue.type === 'array') return `${label} maksimal berisi ${maximum} pilihan.`;
  }
  if (issue.code === 'invalid_string' && issue.validation === 'email') return `${label} harus berupa alamat email yang valid.`;
  return issue.message;
}

// Menjalankan schema dan mengubah error Zod menjadi format API yang mudah dibaca.
export function validate(schema, input) {
  // safeParse tidak melempar exception sehingga aman dipakai di route.
  const result = schema.safeParse(input);
  // Mengembalikan data yang sudah tervalidasi jika berhasil.
  if (result.success) return { data: result.data };
  // Mengembalikan field dan alasan yang dapat langsung ditampilkan pengguna.
  return {
    error: result.error.issues.map((issue) => {
      const field = issue.path.join('.') || 'data';
      const label = VALIDATION_FIELD_LABELS[field] || field;
      return { field, label, message: readableValidationMessage(issue, label) };
    }),
  };
}
