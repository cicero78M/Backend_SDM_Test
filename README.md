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

Baseline saat ini sudah menyediakan CRUD `pegawai`, JWT, role dasar, validasi request, dan schema PostgreSQL. Pengembangan menuju domain Merit System dilakukan bertahap:

| Tahap | Status | Cakupan |
|---|---|---|
| Fondasi API | Selesai | Express, PostgreSQL, CRUD pegawai, JWT, bcrypt, Zod, OpenAPI |
| Domain karier | Direncanakan | `riwayat_jabatan`, fungsi, status/nivelering jabatan, profil kronologis |
| Scope organisasi | Direncanakan | Satker/Polda, relasi user-scope, pembatasan data operator |
| Administrasi | Direncanakan | Pengelolaan user, role, scope, dan audit perubahan oleh Admin SSDM |
| Integrasi penuh | Direncanakan | Postman collection, automated test, dan integrasi frontend |

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

## Target endpoint Merit System

Endpoint berikut menjadi kontrak pengembangan berikutnya setelah migrasi schema dan authorization scope selesai:

- `GET/POST/PUT/DELETE /api/v1/personel`
- `GET/POST/PUT/DELETE /api/v1/personel/:id/riwayat-jabatan`
- `GET /api/v1/personel/:id/profile` — identitas, jabatan aktif, dan histori kronologis.
- Endpoint master data fungsi, jabatan, level/nivelering, status jabatan, dan Satker.
- Endpoint Admin SSDM untuk user dan scope organisasi.

Riwayat jabatan wajib mendukung jabatan, Satker, fungsi, tanggal mulai, tanggal berakhir, nivelering, status, dan keterangan. Validasi akan mencegah tanggal terbalik serta riwayat aktif yang tumpang tindih.

## Struktur database saat ini

`db/schema.sql` saat ini memuat:

- `pegawai` — data dasar personel dan foreign key ke master;
- `unit_kerja` — struktur unit kerja;
- `jabatan` — master jabatan;
- `golongan` — master pangkat/golongan;
- `users` — kredensial, bcrypt hash, role, dan status aktif.

Migration `db/migrations/002_merit_system_staging.sql` menambahkan `riwayat_jabatan`, master fungsi/status/level jabatan, `satker`, relasi `user_scope`, `audit_log`, serta kolom validasi staging. Migration bersifat additive dan tidak menghapus data staging lama. Constraint `NOT NULL`, `CHECK`, `UNIQUE`, foreign key, index, serta transaksi menjaga konsistensi data.

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

## Repository terkait

- Backend: [cicero78M/Backend_SDM_Test](https://github.com/cicero78M/Backend_SDM_Test)
- Frontend: [cicero78M/Frontend_SDM_Test](https://github.com/cicero78M/Frontend_SDM_Test)
