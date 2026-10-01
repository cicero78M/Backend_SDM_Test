# CRUD App Test

Fondasi aplikasi CRUD yang siap dikembangkan. Contoh domain menggunakan entitas **Item** agar struktur dapat diganti menjadi produk, pegawai, buku, atau data lain.

## Stack

- Node.js 20+
- Express
- Penyimpanan JSON lokal tanpa native binary, sehingga mudah dijalankan di berbagai versi Node.js
- HTML, CSS, dan JavaScript tanpa framework frontend

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>. Data otomatis dibuat di `data/items.json` (file ini diabaikan Git).

## API awal

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/items` | Mengambil semua data |
| GET | `/api/items/:id` | Mengambil satu data |
| POST | `/api/items` | Membuat data |
| PUT | `/api/items/:id` | Memperbarui data |
| DELETE | `/api/items/:id` | Menghapus data |

Payload create/update:

```json
{"name":"Contoh item","description":"Deskripsi item","status":"active"}
```

## Pengembangan berikutnya

- Tambahkan autentikasi dan otorisasi.
- Pisahkan route, service, dan repository ketika domain bertambah.
- Tambahkan test otomatis untuk API.
- Tambahkan migrasi database dan konfigurasi environment untuk deployment.
