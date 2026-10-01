// Mengimpor Zod sebagai library validasi request.
import { z } from 'zod';
// Membatasi format tanggal menjadi YYYY-MM-DD.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.');
// Schema registrasi; role sengaja tidak menerima input publik agar tidak terjadi privilege escalation.
export const registerSchema = z.object({ username: z.string().trim().min(3).max(50), password: z.string().min(8).max(100) });
// Schema login dengan username dan password wajib.
export const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
// Schema lengkap payload CRUD pegawai.
export const employeeSchema = z.object({
  // NIP harus berisi tepat 18 digit angka.
  nip: z.string().regex(/^\d{18}$/, 'NIP harus 18 digit.'),
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
  tanggal_masuk: date,
  // Foreign key unit kerja harus berupa bilangan positif.
  id_unit: z.number().int().positive(),
  // Foreign key jabatan harus berupa bilangan positif.
  id_jabatan: z.number().int().positive(),
  // Foreign key golongan harus berupa bilangan positif.
  id_golongan: z.number().int().positive(),
  // Atasan boleh kosong, tetapi jika diisi harus berupa ID valid.
  id_atasan: z.number().int().positive().optional().nullable(),
  // Status memiliki nilai default AKTIF.
  status_pegawai: z.string().trim().min(1).max(15).default('AKTIF'),
  // Batas usia pensiun diberi rentang kewajaran.
  batas_usia_pensiun: z.number().int().min(1).max(100).default(58),
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
