# CRUD App Test — REST API Pegawai

REST API untuk pengelolaan data pegawai sebagai persiapan seleksi tahap 1. Implementasi menggunakan PostgreSQL dan schema domain kepegawaian.

## Kompetensi yang dicakup

| Kompetensi | Implementasi |
|---|---|
| REST API & HTTP Method | Express, endpoint `/api/v1`, GET/POST/PUT/DELETE |
| Routing | Router modular pada `src/routes.js` |
| CRUD & Database | CRUD `pegawai`, PostgreSQL, relasi unit/jabatan/golongan |
| Authentication | JWT Bearer token, password bcrypt |
| Authorization / Permission | Role `admin`, `editor`, `viewer` |
| Validation | Zod untuk body request, format NIP/NIK/tanggal |
| Error Handling | Status 400/401/403/404/409/500 dan JSON konsisten |
| Version Control | Git dan repository GitHub |
| Dokumentasi API | OpenAPI 3 di `docs/openapi.yaml` |

## Tech stack

Node.js 20+, Express, PostgreSQL, `pg`, JWT, bcryptjs, Zod, dotenv, dan express-rate-limit.

## Instalasi

```bash
cp .env.example .env
# sesuaikan DATABASE_URL dan JWT_SECRET
npm install
createdb crud_app
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
```

Health check: `GET http://localhost:3000/health`.

## Endpoint

- `POST /api/v1/auth/register` — registrasi user baru (role awal selalu `viewer`; role tinggi diberikan administrator).
- `POST /api/v1/auth/login` — login dan memperoleh JWT.
- `GET /api/v1/pegawai` — daftar pegawai; mendukung `page`, `limit`, `search`.
- `GET /api/v1/pegawai/:id` — detail pegawai.
- `POST /api/v1/pegawai` — membuat pegawai; role `admin`/`editor`.
- `PUT /api/v1/pegawai/:id` — memperbarui pegawai; role `admin`/`editor`.
- `DELETE /api/v1/pegawai/:id` — menghapus pegawai; role `admin` saja.

Endpoint selain register/login membutuhkan header `Authorization: Bearer <token>`.

## Struktur database

`db/schema.sql` memuat tabel `unit_kerja`, `golongan`, `jabatan`, `pegawai`, dan `users`. `pegawai` memiliki foreign key ke tabel referensi dan self-reference `id_atasan`. Constraint database melengkapi validasi aplikasi untuk NIP/NIK unik, jenis kelamin, serta relasi wajib.

## Dokumentasi dan pengujian

Dokumentasi lengkap request/response tersedia di [`docs/openapi.yaml`](docs/openapi.yaml), yang dapat diimpor ke Swagger Editor atau Postman.

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password-kuat"}' | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/v1/pegawai?page=1&limit=10&search=andi'
```
