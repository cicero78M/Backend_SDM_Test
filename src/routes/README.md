# Route API

`index.js` adalah composition root yang dipasang oleh `server.js` pada
`/api/v1`. Setiap modul domain mengelola pendaftaran endpoint-nya sendiri.
Refactor ini mempertahankan perilaku aplikasi: URL, method, middleware,
bentuk respons, dan aturan otorisasi tetap tidak berubah.

## Inventaris route

| Domain | Prefix | Tanggung jawab utama |
| --- | --- | --- |
| `auth.js` | `/auth/*`, `/public/*` | Login, registrasi, OTP, kata sandi, pengguna, scope, dan selector publik |
| `audit.js` | `/audit-log` | Pencarian log audit berdasarkan scope |
| `pegawai.js` | `/pegawai/*` | CRUD personel lama |
| `master.js` | `/master/*` | Data Satker, unit, jabatan, pangkat, dan referensi |
| `dashboard.js` | `/dashboard/*` | Ringkasan seleksi teragregasi |
| `personel.js` | `/personel/*`, `/merit/*` | CRUD personel, profil, pendidikan, pelatihan, riwayat, dan merit |

## Checklist audit

- Tambahkan endpoint baru pada modul domain yang sesuai dengan prefix-nya.
- Pertahankan middleware `authenticate`/`authorize` tetap terlihat di dekat endpoint.
- Pertahankan validasi request pada batas route menggunakan `validate(...)`.
- Pastikan penulisan database bersifat transaksional ketika lebih dari satu tabel diubah.
- Tambahkan atau perbarui test level route sebelum mengubah kontrak respons.
- Jalankan `npm test`, lalu tinjau `git diff --stat` dan inventaris endpoint.
