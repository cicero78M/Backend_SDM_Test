# Rencana Pengembangan Merit System Personel Polri

Dokumen ini menjadi acuan pengembangan backend dan frontend yang dipisahkan dalam dua repository.

## Tujuan prototype

Mengelola data kualifikasi personel dan perjalanan karier secara terstruktur, tervalidasi, aman, dan dapat diintegrasikan melalui REST API.

## Perubahan backend (`Backend_SDM_Test`)

1. **Domain database**
   - Pertahankan `pegawai` sebagai data identitas personel.
   - Tambahkan master `fungsi`, `status_jabatan`, dan `level_jabatan`.
   - Tambahkan `riwayat_jabatan` dengan foreign key ke personel, satker, fungsi, dan jabatan; tanggal mulai/selesai; nivelering; status; dan keterangan.
   - Tambahkan `satker`/scope organisasi serta relasi user ke scope yang diizinkan.
   - Tambahkan constraint tanggal, uniqueness NRP/NIP, dan index pencarian.

2. **REST API v1**
   - `GET/POST/PUT/DELETE /api/v1/personel` dan `/api/v1/personel/:id`.
   - `GET/POST/PUT/DELETE /api/v1/personel/:id/riwayat-jabatan`.
   - `GET /api/v1/personel/:id/profile` untuk identitas, jabatan aktif, dan histori kronologis.
   - Endpoint master data dan endpoint administrasi user/scope untuk Admin SSDM.
   - Response JSON konsisten dengan `data`, `meta`, dan `error`.

3. **Keamanan dan kewenangan**
   - JWT access token dengan expiry, bcrypt, rate limit, dan secret dari environment.
   - Role `admin_ssdm`, `operator_polda`, dan `operator_satker`.
   - Authorization berbasis role **dan** scope organisasi; operator hanya dapat membaca/mengubah data dalam scope-nya.
   - Audit actor, waktu, dan aksi untuk perubahan data penting.

4. **Validasi dan konsistensi**
   - Zod memvalidasi tipe, format NRP/NIP, tanggal ISO, enum, field wajib, dan rentang nilai.
   - Database menjadi lapisan kedua melalui `NOT NULL`, `CHECK`, `UNIQUE`, FK, dan transaksi.
   - Riwayat aktif tidak boleh tumpang tindih untuk personel yang sama; perubahan personel + riwayat terkait memakai transaksi.

5. **Dokumentasi dan pengujian**
   - Perbarui OpenAPI untuk seluruh endpoint, security scheme, contoh sukses, dan contoh error.
   - Tambahkan Postman collection dan test otomatis untuk auth, permission, validasi, CRUD, scope, serta chronology.
   - README menjelaskan arsitektur, ERD, seed, environment, dan skenario demo Admin/Operator.

## Frontend (`Frontend_SDM_Test`)

- React + Vite sebagai SPA terpisah.
- Halaman login, dashboard, daftar personel, form personel, profil personel, dan editor riwayat jabatan.
- API client terpusat dengan bearer token, penanganan 401/403, loading, empty state, dan error field.
- Field form mengikuti kontrak OpenAPI; tanggal memakai input date; NRP/NIP dan field wajib divalidasi sebelum request.
- Menu dan aksi disembunyikan/dibatasi berdasarkan role; backend tetap menjadi sumber keputusan permission.
- `.env.example` hanya berisi `VITE_API_BASE_URL`; tidak ada secret frontend.

## Urutan delivery

1. Migrasi schema + seed master dan user demo.
2. Refactor endpoint personel dan riwayat jabatan dengan scope authorization.
3. OpenAPI, Postman, automated tests, dan README backend.
4. Integrasi UI frontend terhadap endpoint yang sudah stabil.
5. Uji end-to-end tiga persona: Admin SSDM, Operator Polda, Operator Satker.

## Kriteria penerimaan prototype

- Admin dapat CRUD personel, histori jabatan, user, dan scope.
- Operator hanya dapat CRUD data dalam scope yang diberikan.
- Profil personel menampilkan jabatan aktif dan histori dari terlama ke terbaru.
- Payload invalid ditolak sebelum masuk database dengan error yang dapat ditampilkan form.
- Semua endpoint terlindungi authentication/authorization dan terdokumentasi.
