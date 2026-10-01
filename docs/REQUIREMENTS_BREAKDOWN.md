# Breakdown Kebutuhan dan Roadmap Merit System

Dokumen ini menerjemahkan narasi kebutuhan AS SDM Kapolri menjadi kriteria yang dapat diuji.

## 1. Matriks kebutuhan

| Area | Kebutuhan | Implementasi prototype | Bukti/validasi |
|---|---|---|---|
| Identitas | Nama, NRP/NIP, pangkat, tempat/tanggal lahir | `pegawai` + form/API tervalidasi | Constraint identitas, FK, dan test Zod |
| Kualifikasi | Jenis personel, identitas, golongan/pangkat, unit, Satker | Master golongan, unit, Satker, jenis identitas | Form master dan response personel |
| Karier | Banyak riwayat jabatan per personel | `riwayat_jabatan` dengan jabatan, Satker, fungsi, tanggal, level, status, keterangan | Profil kronologis dan CRUD histori |
| Kualitas data | Tipe, format, field wajib, nilai yang diizinkan | Zod di API + `CHECK`, `NOT NULL`, `UNIQUE`, FK di PostgreSQL | Payload invalid ditolak sebelum insert |
| Otorisasi | Admin SSDM luas; operator dibatasi Satker/Polda | JWT, role, `user_scope`, pemeriksaan scope di read/write/delete | E2E 3 persona dan 403 lintas scope |
| Integrasi | Sistem lain mengakses REST API secara aman | API v1, bearer JWT, response JSON konsisten, OpenAPI/Postman | Health, login, CRUD, scope, error response |
| Operasional | Data mudah dicari, diperbarui, dan diaudit | Search/pagination, audit perubahan, profil, timeline karier | Endpoint dan UI frontend |
| Informasi pengguna | Pengguna memahami tujuan dan alur Merit System | Halaman frontend “Merit System” dengan indikator, alur, prinsip, dan status | Build frontend lulus |

## 2. Kebutuhan data minimum

### Data personel

- Identitas: nama, NRP/NIP unik, jenis identitas, NIK, jenis personel.
- Biografi: jenis kelamin, tempat lahir, tanggal lahir, tanggal masuk.
- Organisasi: Satker, unit kerja, jabatan, pangkat/golongan, status pegawai.
- Relasi: atasan dan scope organisasi.

### Data riwayat jabatan

- Personel dan jabatan yang diduduki.
- Satker/fungsi tempat penugasan.
- Tanggal mulai dan tanggal selesai.
- Nivelering/level jabatan.
- Status jabatan aktif atau selesai.
- Keterangan, pembuat, pengubah, dan timestamp.

### Data tata kelola

- Master Satker hierarkis, unit kerja, jabatan, fungsi, level, dan status.
- User, role, scope, status aktif, serta audit log.
- Pada tahap berikutnya: sumber bukti kinerja, pendidikan/pelatihan, disiplin, dan penilaian tervalidasi.

## 3. Gap yang masih harus diselesaikan sebelum produksi

1. **Mesin skor merit resmi**: fondasi periode, indikator, nilai mentah, bukti, status review, dan skor berbobot sudah ditambahkan pada migration 016; formula dan bobot tetap memerlukan keputusan kebijakan resmi.
2. **Sumber bukti kinerja**: perlu integrasi atau modul untuk SKP/capaian, pendidikan, sertifikasi, diklat, disiplin, dan penghargaan.
3. **Workflow validasi**: perlu status draft → diajukan → diverifikasi → disahkan beserta reviewer dan catatan.
4. **Kelengkapan test**: tambah integration test CRUD penuh, negative test lintas scope, concurrency, dan browser E2E.
5. **Hardening operasi**: HTTPS final, backup/restore drill, monitoring, rotasi secret, least privilege database, dan SOP deployment.
6. **Master resmi**: fixture demo harus diganti dengan referensi organisasi dan kebijakan yang disahkan sebelum data produksi.

## 4. Roadmap improvement

### Tahap A — prototype yang dapat didemokan

- CRUD personel dan riwayat jabatan.
- Profil karier kronologis.
- Role/scope dan REST API terproteksi.
- Validasi request dan constraint database.
- Fixture dummy aktif yang dapat diulang tanpa menyentuh data non-demo.
- Halaman informasi Merit System di frontend.

### Tahap B — penilaian merit terukur

- Tambah tabel `merit_period`, `merit_indicator`, dan `merit_assessment` dengan nilai, bukti, status review, dan scope ke personel.
- Simpan periode, formula/bobot, dan status di database; frontend membaca indikator melalui API dan bukan sumber kebenaran.
- Sediakan endpoint ringkasan penilaian per personel/periode dengan pemeriksaan scope.
- Pisahkan nilai mentah, nilai ternormalisasi, skor berbobot, dan keputusan reviewer.
- Tambah endpoint ringkasan skor berbasis scope dan periode.

### Tahap C — validasi bisnis dan produksi

- Uji bersama pemilik proses AS SDM.
- Migrasikan master resmi dan mapping personel.
- Jalankan uji keamanan, backup/restore, beban, dan audit akses.
- Tetapkan SOP koreksi data, approval, banding, dan retensi audit.

## 5. Fixture aktif saat ini

Fixture berada di `db/seed/active_merit_fixture.sql`. Record yang dibuat memakai prefix demo dan mencakup 6 personel, dua Satker demo, empat unit kerja, tiga fungsi, tiga level, dua status, 15 histori jabatan, satu periode penilaian, empat indikator, dan 24 assessment berbukti. Fixture dijalankan secara transaksional dan hanya menghapus histori/assessment untuk NRP demo yang sama agar aman saat diulang.
