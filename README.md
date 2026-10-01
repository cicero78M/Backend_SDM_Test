# Backend SDM Test — Merit System Personel Polri

REST API untuk prototype **Merit System Personel Polri**. Backend ini menjadi layanan terpusat untuk mengelola identitas personel, kualifikasi, dan perjalanan karier melalui REST API yang tervalidasi dan dilindungi authentication serta authorization.

Frontend dikelola terpisah di repository [Frontend_SDM_Test](https://github.com/cicero78M/Frontend_SDM_Test).

## Tujuan aplikasi

Aplikasi mendukung pengelolaan data personel secara sistematis agar Admin SSDM dan Operator Satker/Polda dapat:

- menyimpan data dasar personel seperti nama, NRP/NIP, pangkat, tempat dan tanggal lahir;
- menambahkan beberapa riwayat jabatan untuk setiap personel;
- melihat profil personel, jabatan aktif, dan histori jabatan secara kronologis;
- memperbarui atau menghapus data sesuai kewenangan;
- menyediakan REST API yang dapat diintegrasikan oleh sistem lain secara aman.

## Status prototype

Baseline saat ini sudah menyediakan CRUD `pegawai`, JWT, role dasar, validasi request, dan schema PostgreSQL. Database staging pada server terverifikasi sebagai database `postgres`; data yang terdeteksi tetap dipertahankan. Pengembangan menuju domain Merit System dilakukan bertahap:

| Tahap | Status | Cakupan |
|---|---|---|
| Fondasi API | Selesai | Express, PostgreSQL, CRUD pegawai, JWT, bcrypt, Zod, OpenAPI |
| Domain karier | Selesai | `riwayat_jabatan`, fungsi, status/nivelering jabatan, profil kronologis |
| Scope organisasi | Selesai | Satker/Polda, relasi user-scope, pembatasan data operator, transaksi scope |
| Administrasi | Selesai untuk prototype | User/role, scope, audit perubahan, UI scope, dan matriks Admin SSDM |
| Integrasi frontend | Selesai untuk prototype | Login, visualisasi, personel, profil, histori, kualifikasi, form input/edit, dan UI scope |
| Dashboard analitik | Selesai untuk prototype | Agregasi status, golongan/pangkat, pendidikan, diklat, mutasi, lama dinas, dan proyeksi pensiun berbasis scope |
| Pengujian | Lulus | 10 test unit/authorization/validasi lulus; E2E demo tiga persona tersedia |

Rincian target dan kriteria penerimaan tersedia di [`docs/RENCANA_PENGEMBANGAN.md`](docs/RENCANA_PENGEMBANGAN.md).

## Arsitektur repository

```text
Frontend_SDM_Test  (React + Vite, UI dan API client)
        |
        | HTTPS + JWT Bearer
        v
Backend_SDM_Test   (Express REST API + validation + authorization)
        |
        v
PostgreSQL         (personel, master organisasi, riwayat jabatan, users)
```

Frontend tidak menyimpan secret. Keputusan permission tetap dilakukan backend walaupun menu/aksi frontend dapat disesuaikan berdasarkan role.

## Kompetensi yang dicakup

| Kompetensi | Implementasi saat ini / target |
|---|---|
| REST API & HTTP Method | Express, prefix `/api/v1`, GET/POST/PUT/DELETE |
| Routing | Router modular pada `src/routes.js` |
| CRUD & Database | CRUD `pegawai` saat ini; target CRUD `personel` dan `riwayat_jabatan` |
| Authentication | JWT Bearer token, password bcrypt |
| Authorization / Permission | Role dasar `admin`, `editor`, `viewer`; target Admin SSDM/Operator Polda/Operator Satker + scope |
| Validation | Zod untuk format NIP/NIK/tanggal dan field wajib |
| Error Handling | Status 400/401/403/404/409/500 dalam response JSON |
| Version Control | Git dan repository GitHub |
| Dokumentasi API | OpenAPI 3 pada `docs/openapi.yaml` |

## Tech stack

Node.js 20+, Express, PostgreSQL, `pg`, JSON Web Token, bcryptjs, Zod, dotenv, dan express-rate-limit.

## Instalasi

### Prasyarat

- Node.js 20 atau lebih baru
- PostgreSQL 14 atau lebih baru
- `psql` tersedia pada PATH

### Konfigurasi

```bash
cp .env.example .env
```

Isi `.env` secara lokal dan jangan commit file tersebut:

```env
PORT=3000
DATABASE_URL=postgresql://username:password@localhost:5432/backend_sdm
JWT_SECRET=ganti-dengan-secret-acak-minimal-32-karakter
JWT_EXPIRES_IN=1h
```

`JWT_SECRET` hanya digunakan server dan tidak boleh dimasukkan ke repository, frontend, atau chat.

### Menyiapkan database dan menjalankan server

```bash
npm install
createdb backend_sdm
psql "$DATABASE_URL" -f db/schema.sql
# Untuk database staging yang sudah berisi schema dasar, jalankan migration additive:
psql "$DATABASE_URL" -f db/migrations/002_merit_system_staging.sql
psql "$DATABASE_URL" -f db/migrations/003_grant_app_role.sql
npm run dev
```

Health check: `GET http://localhost:3000/health`.

## Endpoint yang tersedia saat ini

Semua endpoint selain register/login memerlukan header `Authorization: Bearer <token>`.

### Authentication

- `POST /api/v1/auth/register` — registrasi user baru; role awal selalu `viewer`.
- `POST /api/v1/auth/login` — login dan memperoleh JWT.

### Pegawai

- `GET /api/v1/pegawai?page=1&limit=10&search=andi` — daftar dengan pagination dan pencarian nama/NIP.
- `GET /api/v1/pegawai/:id` — detail pegawai.
- `POST /api/v1/pegawai` — membuat pegawai; role `admin`/`editor`.
- `PUT /api/v1/pegawai/:id` — memperbarui pegawai; role `admin`/`editor`.
- `DELETE /api/v1/pegawai/:id` — menghapus pegawai; role `admin` saja.

## Endpoint Merit System yang tersedia

Endpoint berikut tersedia setelah migration schema Merit System diterapkan:

- `GET/POST/PUT/DELETE /api/v1/personel`
- `GET/PUT/DELETE /api/v1/personel/:id` — detail, perubahan, dan penghapusan berbasis scope.
- `GET/POST/PUT/DELETE /api/v1/personel/:id/riwayat-jabatan`
- `GET /api/v1/personel/:id/profile` — identitas, jabatan aktif, dan histori kronologis.
- `GET/POST/PUT/DELETE /api/v1/personel/:id/pendidikan` — kualifikasi pendidikan personel.
- `GET/POST/PUT/DELETE /api/v1/personel/:id/diklat` — riwayat pelatihan/diklat personel.
- Endpoint master data fungsi, jabatan, level/nivelering, status jabatan, dan Satker.
- `GET /api/v1/auth/users/:id/scopes` — melihat scope Satker user oleh admin.
- `PUT /api/v1/auth/users/:id/scopes` — mengganti scope Satker user secara transaksional oleh admin.
- `GET /api/v1/dashboard/overview` — agregasi visualisasi personel, status, golongan/pangkat terpisah untuk POLRI dan ASN, kelompok jabatan/nivelering, jenjang pendidikan, diklat, mutasi, kualitas data, kelompok usia, lama dinas, dan proyeksi pensiun sesuai scope user. Ringkasan diklat dan mutasi mencakup personel yang pernah, belum pernah, serta memiliki lebih dari satu riwayat. Kualitas data mencakup kelengkapan field personel dan status validasi staging.

Riwayat jabatan mendukung jabatan, Satker, fungsi, tanggal mulai, tanggal berakhir, nivelering, status, dan keterangan. Validasi mencegah format payload yang salah; constraint database mencegah tanggal terbalik dan lebih dari satu histori aktif untuk personel yang sama.

Migration `db/migrations/017_personnel_education_training.sql` menambahkan tabel domain `riwayat_pendidikan_personel` dan `riwayat_diklat_personel`. Profil personel mengembalikan kedua koleksi tersebut; seluruh operasi mengikuti pemeriksaan role/scope dan tercatat pada audit log. Fixture aktif demo tersedia pada `db/seed/active_education_training_fixture.sql`.

Data legacy `riwayat_pendidikan`, `riwayat_diklat`, dan `riwayat_mutasi` tetap
dipertahankan. Endpoint profil dan CRUD memakai tabel domain personel baru,
sedangkan endpoint `dashboard/overview` menggabungkan data legacy dan domain
untuk agregasi analitik tanpa mengubah data sumber.

## Struktur database saat ini

Database staging yang telah diverifikasi memuat 300 baris `pegawai`, 150 baris `staging_pegawai`, 398 riwayat pendidikan, 416 riwayat diklat, dan 150 riwayat mutasi. Status validasi staging: 113 `VALID` dan 37 `TINDAK_LANJUT`.

`db/schema.sql` saat ini memuat:

- `pegawai` — data dasar personel dan foreign key ke master;
- `unit_kerja` — struktur unit kerja;
- `jabatan` — master jabatan;
- `golongan` — master pangkat/golongan;
- `users` — kredensial, bcrypt hash, role, dan status aktif.

Migration `db/migrations/002_merit_system_staging.sql` telah diterapkan pada database staging `postgres`. Migration menambahkan `riwayat_jabatan`, master fungsi/status/level jabatan, `satker`, relasi `user_scope`, `audit_log`, serta kolom validasi staging. Migration bersifat additive dan tidak menghapus data staging lama. Constraint `NOT NULL`, `CHECK`, `UNIQUE`, foreign key, index, serta transaksi menjaga konsistensi data.

Sebelum menjalankan migration, pastikan `DATABASE_URL` benar-benar menunjuk database staging. Verifikasi tanpa menampilkan password:

```bash
psql "$DATABASE_URL" -X -Atc "SELECT current_database(), current_user;"
psql "$DATABASE_URL" -X -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

## Dokumentasi API dan pengujian

Dokumentasi request/response tersedia di [`docs/openapi.yaml`](docs/openapi.yaml) dan dapat diimpor ke Swagger Editor atau Postman.

Contoh request:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password-kuat"}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/v1/pegawai?page=1&limit=10&search=andi'
```

Target pengujian mencakup authentication, permission role/scope, validasi field, CRUD personel, CRUD riwayat jabatan, chronology, foreign key, dan response error.

Test yang tersedia saat ini dapat dijalankan dengan:

```bash
npm test
```

Suite saat ini mencakup validasi POLRI/NRP, ASN/NIP, chronology tanggal,
validasi scope, permission role, pendidikan, dan diklat; hasil terakhir
**10/10 lulus**. Postman collection tersedia di
`postman/merit-system.postman_collection.json`.

### Smoke test E2E database demo

Seed demo hanya untuk database terpisah:

```bash
createdb merit_system_demo
export DEMO_DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/merit_system_demo
psql "$DEMO_DATABASE_URL" -f db/schema.sql
for migration in db/migrations/002_merit_system_staging.sql db/migrations/003_grant_app_role.sql db/migrations/004_career_admin_controls.sql db/migrations/005_polda_directorates.sql db/migrations/006_mabes_direct_satker.sql db/migrations/007_missing_regional_polres.sql db/migrations/008_satker_unit_structure.sql db/migrations/009_subdit_unit_hierarchy.sql db/migrations/010_polda_satbrimob.sql db/migrations/011_mabes_sotk_stage1.sql db/migrations/012_mabes_sotk_stage1_support.sql db/migrations/013_mabes_sotk_stage2_bareskrim_itwasum.sql db/migrations/014_deactivate_mabes_placeholders.sql db/migrations/015_polri_personnel_identity.sql; do psql "$DEMO_DATABASE_URL" -f "$migration"; done
psql "$DEMO_DATABASE_URL" -f db/seed/demo_merit_system.sql
```

Jalankan API dengan `DATABASE_URL="$DEMO_DATABASE_URL"`, lalu jalankan. Kredensial demo diambil dari environment lokal; jangan menuliskannya di README, Postman yang dibagikan, atau chat:

```bash
npm run test:e2e:demo
```

Runner memverifikasi health check, login Admin SSDM/Operator Polda/Operator Satker, daftar personel berbasis scope, dan scope operator. Isi `DEMO_*_USERNAME` serta `DEMO_*_PASSWORD` melalui environment lokal sebelum menjalankan runner. Runner menolak database `postgres`, `template0`, `template1`, atau nama yang tidak mengandung `demo`, `e2e`, atau `test`. Seed demo tidak dijalankan otomatis dan tidak boleh dijalankan pada database staging aktif.

## Matriks role dan scope

| Persona | Role | Scope | Kemampuan utama |
|---|---|---|---|
| Admin SSDM | `admin_ssdm` | Seluruh Satker | Kelola personel, histori, dan administrasi domain |
| Operator Polda | `operator_polda` | Satker yang ditetapkan admin | CRUD data dalam scope |
| Operator Satker | `operator_satker` | Satker yang ditetapkan admin | CRUD data dalam scope |
| Viewer | `viewer` | Sesuai kebijakan aplikasi | Baca terbatas |

Catatan: approval pendaftaran tetap sengaja dibatasi role `admin` pertama. Admin SSDM dapat mengelola user aktif, role, password, dan scope setelah akun tersedia.

## Repository terkait

- Backend: [cicero78M/Backend_SDM_Test](https://github.com/cicero78M/Backend_SDM_Test)
- Frontend: [cicero78M/Frontend_SDM_Test](https://github.com/cicero78M/Frontend_SDM_Test)
