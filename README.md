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
| Scope organisasi | Selesai | Satker/Polda, relasi user-scope, pembatasan data operator, transaksi scope, dan operator Polres |
| Administrasi | Selesai untuk prototype | User/role, approval registrasi admin pertama, scope, audit perubahan, dan UI Administrasi Akses |
| Integrasi frontend | Selesai untuk prototype | Login, visualisasi, personel, profil, histori, kualifikasi, form input/edit, dan UI scope |
| Dashboard analitik | Selesai untuk prototype | Agregasi status, golongan/pangkat POLRI dan ASN, pendidikan, diklat berulang, mutasi berulang, kualitas data, usia, lama dinas, dan proyeksi pensiun berbasis scope |
| Pengujian | Lulus | 10 test unit/authorization/validasi lulus; runner E2E demo tiga persona tersedia |

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

| Kompetensi | Implementasi saat ini |
|---|---|
| REST API & HTTP Method | Express, prefix `/api/v1`, GET/POST/PUT/DELETE |
| Routing | Router modular pada `src/routes.js` |
| CRUD & Database | CRUD `pegawai`, `personel`, `riwayat_jabatan`, pendidikan, dan diklat |
| Authentication | JWT Bearer token, password bcrypt, OTP validasi email registrasi |
| Authorization / Permission | Role `admin`, `admin_ssdm`, `operator_polda`, `operator_satker`, `operator_polres`, `editor`, `viewer` + scope organisasi |
| Validation | Zod untuk format NIP/NIK/tanggal dan field wajib |
| Error Handling | Status 400/401/403/404/409/500 dalam response JSON |
| Version Control | Git dan repository GitHub |
| Dokumentasi API | OpenAPI 3 pada `docs/openapi.yaml` |

## Tech stack

Node.js 20+, Express, PostgreSQL, Redis, `pg`, `redis`, `rate-limit-redis`, JSON Web Token, bcryptjs, Zod, dotenv, dan express-rate-limit.

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
REDIS_ENABLED=false
REDIS_URL=redis://:password@127.0.0.1:6379/0
REDIS_KEY_PREFIX=merit:
REDIS_DEFAULT_TTL_SECONDS=60
NODE_ENV=development
# Development lokal boleh memakai console; production wajib memakai smtp.
EMAIL_DELIVERY=console
EMAIL_FROM=no-reply@example.invalid
PASSWORD_RESET_URL=http://localhost:4173/?reset_token=
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
```

`JWT_SECRET` hanya digunakan server dan tidak boleh dimasukkan ke repository atau frontend.
Redis bersifat opsional. Saat aktif, Redis menyimpan cache, lock singkat, dan counter rate limit lintas proses PM2. Saat dinonaktifkan atau tidak tersedia, cache/lock kembali aman ke perilaku fallback dan rate limit memakai store memori lokal; PostgreSQL tetap menjadi sumber data utama. Endpoint `/health` menampilkan jenis store rate limit dan metrik cache dasar untuk monitoring.

### Menyiapkan database dan menjalankan server

```bash
npm install
createdb backend_sdm
psql "$DATABASE_URL" -f db/schema.sql
# Untuk database baru, gunakan runner agar histori dan checksum tercatat.
npm run migrate
# Untuk database lama yang sudah tervalidasi sampai migration terakhir,
# catat baseline tanpa menjalankan ulang migration lama.
npm run migrate:baseline
# Periksa migration yang pending atau checksum yang berubah.
npm run migrate:status
npm run dev
```

Health check: `GET http://localhost:3000/health`.

## Endpoint yang tersedia saat ini

Semua endpoint selain register/login/verify-email/resend-otp memerlukan header `Authorization: Bearer <token>`.

`GET /api/v1/audit-log` menampilkan log input, update, hapus, dan baca data personel. Admin utama dapat melihat seluruh log; role lain hanya menerima log personel dan riwayat yang berada dalam scope Satker-nya. Filter yang tersedia: `page`, `limit`, `action`, `resource`, `search`, `from`, dan `to`.

### Authentication

- `POST /api/v1/auth/register` — registrasi user baru dengan email; role awal selalu `viewer` dan OTP dikirim ke email.
- `POST /api/v1/auth/register/verify-email` — validasi OTP 6 digit sebelum registrasi masuk antrean approval.
- `POST /api/v1/auth/register/resend-otp` — mengirim ulang OTP setelah cooldown.
- `POST /api/v1/auth/login` — login dan memperoleh JWT.
- `POST /api/v1/auth/forgot-password` — meminta reset password menggunakan username atau email; instruksi dikirim ke email terdaftar.
- `POST /api/v1/auth/reset-password` — menetapkan password baru memakai token satu kali dari email reset.
- `GET /api/v1/auth/registrations/pending` — daftar registrasi yang sudah memvalidasi email dan menunggu approval; hanya role `admin` pertama.
- `PATCH /api/v1/auth/registrations/:id` — menyetujui atau menolak registrasi serta menetapkan role; hanya role `admin` pertama.
- `GET /api/v1/auth/registrations/history` — riwayat keputusan approval; hanya role `admin` pertama.
- `GET /api/v1/auth/users/approved` — daftar user aktif untuk administrasi; admin/admin SSDM.

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

Endpoint master yang dipakai form personel dan riwayat jabatan:

- `GET /api/v1/master/satker/:id/unit-kerja` — struktur unit kerja untuk Update Data.
- `GET /api/v1/master/satker/:id/unsur-pembantu-pimpinan` — struktur parent-child
  aktif untuk rumpun `BAG*`, `SAT*`, `SI*`, dan `POLSEK`, termasuk parent sampai
  unit terkecil yang relevan.
- `GET /api/v1/master/jabatan?satker_id=<id>&unit_id=<id>` — jabatan aktif yang
  dipetakan ke unit terpilih; mapping `legacy-assignment` tidak dikembalikan.

Riwayat jabatan menyimpan `id_unit` dan memvalidasi Satker, rantai parent,
mapping jabatan-unit, status, serta rentang tanggal di backend. Role
`operator_polres` wajib menggunakan Satker personel saat menambah atau mengubah
riwayat; backend menolak Satker lain walaupun payload dikirim langsung ke API.

Riwayat jabatan mendukung jabatan, Satker, fungsi, tanggal mulai, tanggal berakhir, nivelering, status, dan keterangan. Validasi mencegah format payload yang salah; constraint database mencegah tanggal terbalik dan lebih dari satu histori aktif untuk personel yang sama.

Migration `db/migrations/017_personnel_education_training.sql` menambahkan tabel domain `riwayat_pendidikan_personel` dan `riwayat_diklat_personel`. Migration `038_backfill_legacy_personnel_history.sql` mengisi domain secara idempoten dari data legacy dan menambahkan `riwayat_mutasi_personel`; sumber legacy tidak dihapus atau diubah. Migration `039_backfill_and_track_current_position.sql` membentuk histori awal dari jabatan aktif seluruh personel yang memiliki referensi jabatan/Satker. Migration `040_position_history_status.sql` menambahkan status aktif/nonaktif untuk histori jabatan. Perubahan jabatan, unit, atau Satker berikutnya dicatat otomatis oleh endpoint pembaruan personel dalam transaksi; histori lama ditutup dan diberi status nonaktif sebelum histori baru aktif dibuat. Profil personel mengembalikan data domain dan memakai legacy sebagai fallback tanpa duplikasi.

Data legacy `riwayat_pendidikan`, `riwayat_diklat`, dan `riwayat_mutasi` tetap
dipertahankan. Endpoint profil dan CRUD memakai tabel domain personel baru,
sedangkan endpoint `dashboard/overview` menggabungkan data legacy dan domain
untuk agregasi analitik tanpa mengubah data sumber.

## Struktur database saat ini

Database ini memakai schema PostgreSQL `public`. `db/schema.sql` membuat fondasi
legacy; migration `002` sampai `041` menambahkan domain Merit System secara
additive. Migration tidak dimaksudkan untuk dijalankan acak karena beberapa
foreign key, role, dan mapping bergantung pada migration sebelumnya.

Tabel `schema_migrations` menyimpan nama file, checksum SHA-256, waktu,
executor, durasi, dan metode penerapan (`runner` atau `baseline`). Runner
mengunci proses migration dengan advisory lock, melewati migration yang sudah
tercatat, dan berhenti jika checksum file berubah.

### Peta tabel dan relasi

```text
users ───────────────< user_scope >────────────── satker
  │                         │                     │
  │                         └───────────────< satker_fungsi >── fungsi
  │
  ├──< registration_requests
  ├──< password_reset_tokens
  ├──< audit_log
  └──< riwayat_jabatan (created_by / updated_by)

satker ───< unit_kerja ───< jabatan_unit_kerja >── jabatan
   │             │                 │
   │             └── parent unit   └── mapping aktif per unit
   │
   └──< pegawai ───< riwayat_jabatan
          │  │  │
          │  │  ├──< riwayat_pendidikan_personel
          │  │  ├──< riwayat_diklat_personel
          │  │  └──< merit_assessment >── merit_period
          │                                      │
          └── golongan                         └── merit_indicator

staging_pegawai     # data mentah sebelum validasi/promosi
riwayat_pendidikan  # tabel legacy analitik
riwayat_diklat      # tabel legacy analitik
riwayat_mutasi      # tabel legacy analitik
```

### Tabel inti dan domain

| Kelompok | Tabel | Isi dan aturan utama |
|---|---|---|
| Master organisasi | `satker` | Hierarki Satker melalui `id_satker_induk`; tipe meliputi `SSDM`, `POLDA`, `SATKER`, `DIREKTORAT`, `SATKER_MABES`, dan `SATBRIMOB`. |
| Master organisasi | `unit_kerja` | Unit kerja bertingkat melalui `id_unit_induk`, terkait ke Satker, memiliki kode/tipe, status aktif, dan metadata SOTK. |
| Master personel | `golongan`, `jabatan`, `fungsi`, `level_jabatan`, `status_jabatan` | Referensi pangkat, jabatan, fungsi, nivelering, dan status penugasan. |
| Personel | `pegawai` | Identitas, jenis personel, NRP/NIP, NIK, pangkat, unit, Satker, atasan, dan status pegawai. `id_satker` ditambahkan oleh migration `002`. |
| Karier | `riwayat_jabatan` | Histori jabatan per personel, Satker, unit, fungsi, nivelering, status, periode, dan user perubahan. Satu record aktif per personel dijaga unique partial index. |
| Karier | `jabatan_unit_kerja` | Mapping jabatan yang valid untuk unit tertentu; mapping aktif menjadi sumber pilihan jabatan pada form. |
| Kualifikasi | `riwayat_pendidikan_personel`, `riwayat_diklat_personel` | Pendidikan dan diklat domain baru dengan validasi tahun, nilai, tanggal, serta audit user. |
| Merit | `merit_period`, `merit_indicator`, `merit_assessment` | Periode penilaian, indikator berbobot, nilai/bukti personel, status verifikasi, dan unique per personel-periode-indikator. |
| Akses | `users`, `user_scope` | Kredensial hash, role, status aktif, dan scope Satker operator. |
| Registrasi | `registration_requests`, `password_reset_tokens` | Approval akun, verifikasi OTP, dan token reset password sekali pakai yang disimpan sebagai hash. |
| Audit | `audit_log` | Aksi `CREATE`, `READ`, `UPDATE`, `DELETE`, resource, request ID, user, dan metadata JSONB. |
| Staging/legacy | `staging_pegawai`, `riwayat_pendidikan`, `riwayat_diklat`, `riwayat_mutasi`, `diklat` | Sumber impor dan data lama yang dipertahankan untuk cleansing serta agregasi dashboard. |

### Constraint dan index penting

- Identitas `pegawai.nip` dan `pegawai.nik` unik; format, jenis personel,
  jenis identitas, jenis kelamin, serta tanggal masuk dibatasi `CHECK`.
- Foreign key menjaga relasi personel, Satker, unit, jabatan, histori, user,
  dan scope. Histori domain personel menggunakan `ON DELETE CASCADE` dari
  `pegawai`; data legacy tetap dipertahankan dengan perilaku FK default.
- `riwayat_jabatan` memiliki check rentang tanggal dan unique partial index
  `uq_riwayat_jabatan_aktif` untuk mencegah lebih dari satu histori aktif.
- `user_scope` memiliki primary key gabungan `(id_user, id_satker)`.
- `jabatan_unit_kerja` memiliki primary key gabungan dan index mapping aktif
  per unit.
- Index tersedia untuk pencarian nama/unit/Satker, histori per personel,
  staging berdasarkan status validasi, kualifikasi personel, assessment merit,
  registrasi, dan token reset.

### Urutan instalasi dan audit deployment

Untuk database baru yang membutuhkan seluruh domain aplikasi, jalankan schema
dasar kemudian seluruh migration di folder ini secara numerik. Migration di
luar folder ini bukan bagian dari database aplikasi SDM:

```bash
psql "$DATABASE_URL" -f db/schema.sql
for migration in db/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

Verifikasi tanpa menampilkan password:

```bash
psql "$DATABASE_URL" -X -Atc "SELECT current_database(), current_user;"
psql "$DATABASE_URL" -X -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
psql "$DATABASE_URL" -X -c "SELECT conname, contype FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname;"
```

Catatan audit: instruksi demo lama hanya mencantumkan migration sampai `015`,
sedangkan tabel merit, pendidikan/diklat domain, mapping jabatan-unit, dan
perubahan role operator Polres dibuat oleh migration `016`–`036`; privilege
tabel runtime dilengkapi oleh migration `037`, sedangkan backfill riwayat legacy
dilakukan oleh migration `038`, histori jabatan aktif dibentuk oleh migration `039`, status histori aktif/nonaktif disiapkan oleh migration `040`, histori deployment dicatat oleh migration `041`, dan status pensiun otomatis diperbarui oleh migration `043`. Untuk menguji
fitur terbaru, seluruh migration harus diterapkan berurutan.

Sebelum menjalankan migration, pastikan `DATABASE_URL` benar-benar menunjuk database staging. Verifikasi tanpa menampilkan password:

```bash
psql "$DATABASE_URL" -X -Atc "SELECT current_database(), current_user;"
psql "$DATABASE_URL" -X -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

## Dokumentasi API dan pengujian

Dokumentasi request/response tersedia di [`docs/openapi.yaml`](docs/openapi.yaml) dan dapat diimpor ke Swagger Editor. Alur smoke test dan CRUD utama tersedia di [`postman/merit-system.postman_collection.json`](postman/merit-system.postman_collection.json). Isi username/password dan ID master pada environment Postman lokal; collection tidak menyimpan kredensial demo.

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
**10/10 lulus**. Jalankan `npm test` sebelum pengumpulan. Untuk uji alur
CRUD berbasis database demo, gunakan Postman collection atau runner E2E;
keduanya memerlukan database demo dan kredensial lokal.

### Smoke test E2E database demo

Seed demo hanya untuk database terpisah:

```bash
createdb merit_system_demo
export DEMO_DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/merit_system_demo
psql "$DEMO_DATABASE_URL" -f db/schema.sql
for migration in db/migrations/*.sql; do
  psql "$DEMO_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
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
| Operator Polres | `operator_polres` | Satker personel | CRUD data dalam scope; riwayat hanya pada Satker personel dan Unsur Pembantu Pimpinan yang sesuai |
| Viewer | `viewer` | Sesuai kebijakan aplikasi | Baca terbatas |

Catatan: approval pendaftaran tetap sengaja dibatasi role `admin` pertama. Admin SSDM dapat mengelola user aktif, role, password, dan scope setelah akun tersedia, tetapi tidak dapat memproses registrasi pending.

### Alur validasi email registrasi

1. User mengirim username, email, identitas pendaftaran, dan password ke endpoint register.
2. Backend menyimpan hanya hash OTP dan hash password; OTP berlaku sesuai `OTP_TTL_MINUTES`.
3. User mengirim `registration_id` dan OTP ke endpoint verify-email.
4. Maksimum percobaan salah diatur `OTP_MAX_ATTEMPTS`; OTP baru memiliki cooldown `OTP_RESEND_COOLDOWN_SECONDS`.
5. Hanya registrasi dengan `email_verified_at` yang tampil pada antrean approval admin.

`EMAIL_DELIVERY=console` hanya untuk development lokal dan menulis OTP ke log server. Production harus memakai `EMAIL_DELIVERY=smtp` serta `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, dan `EMAIL_FROM`; OTP tidak pernah dikembalikan pada response API.

## Repository terkait

- Backend: [cicero78M/Backend_SDM_Test](https://github.com/cicero78M/Backend_SDM_Test)
- Frontend: [cicero78M/Frontend_SDM_Test](https://github.com/cicero78M/Frontend_SDM_Test)
