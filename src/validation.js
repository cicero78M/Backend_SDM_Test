// Mengimpor Zod sebagai library validasi request.
import { z } from 'zod';
// Membatasi format tanggal menjadi YYYY-MM-DD.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.');
// Schema registrasi; role sengaja tidak menerima input publik agar tidak terjadi privilege escalation.
export const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  nama: z.string().trim().min(2).max(100),
  pangkat: z.string().trim().min(1).max(80),
  nip: z.string().trim().min(1).max(30),
  satker_asal: z.string().trim().min(2).max(150),
  password: z.string().min(8).max(100)
});
export const approvalSchema = z.object({ decision: z.enum(['approve', 'reject']), approved_role: z.enum(['viewer', 'editor', 'admin', 'admin_ssdm', 'operator_polda', 'operator_satker']).default('viewer'), note: z.string().trim().max(500).optional().nullable() });
export const roleUpdateSchema = z.object({ role: z.enum(['viewer', 'editor', 'admin', 'admin_ssdm', 'operator_polda', 'operator_satker']) });
export const userStatusSchema = z.object({ is_active: z.boolean(), reason: z.string().trim().max(500).optional().nullable() });
export const userScopeSchema = z.object({ id_satker: z.array(z.number().int().positive()).max(100).refine((items) => new Set(items).size === items.length, 'Satker tidak boleh duplikat.') });
// Schema login dengan username dan password wajib.
export const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
// Schema perubahan password oleh user yang sedang login.
export const changePasswordSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(8).max(100) });
// Schema permintaan token lupa password; response tetap generik agar username tidak bocor.
export const forgotPasswordSchema = z.object({ username: z.string().trim().min(1).max(50) });
// Schema penggunaan token reset satu kali.
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(200), new_password: z.string().min(8).max(100) });
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
  // Fungsi jabatan boleh belum diisi jika master belum tersedia.
  id_fungsi: z.number().int().positive().optional().nullable(),
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
// Menjalankan schema dan mengubah error Zod menjadi format API yang mudah dibaca.
export function validate(schema, input) {
  // safeParse tidak melempar exception sehingga aman dipakai di route.
  const result = schema.safeParse(input);
  // Mengembalikan data yang sudah tervalidasi jika berhasil.
  if (result.success) return { data: result.data };
  // Mengembalikan field dan pesan untuk setiap error validasi.
  return { error: result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) };
}
