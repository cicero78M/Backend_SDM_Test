# Sumber Master Satker

## Sumber resmi

- Daftar satuan wilayah Polri: <https://www.polri.go.id/tentang/satuan-wilayah>
- Daftar satuan kerja Polri: <https://www.polri.go.id/tentang/satuan-kerja>
- SOTK Polda: Perpol No. 6 Tahun 2025, <https://peraturan.bpk.go.id/Details/333570/peraturan-polri-no-6-tahun-2025>
- SOTK Polres/Polsek: Perpol No. 2 Tahun 2021 jo. Perpol No. 7 Tahun 2025, <https://peraturan.bpk.go.id/Details/317447/peraturan-polri-no-2-tahun-2021>

## Import yang dilakukan

Data pada `satker` diisi dari halaman satuan wilayah resmi Polri dan struktur Polda berdasarkan Perpol No. 6 Tahun 2025 pada 1 Oktober 2026:

- `MABES_POLRI`: root aplikasi, tipe `SSDM`.
- 20 Satker Mabes non-kewilayahan: anak langsung `MABES_POLRI`, tipe `SATKER_MABES`.
- 34 Polda: anak langsung `MABES_POLRI`, tipe `POLDA`.
- 481 Polres: anak Polda masing-masing, tipe `SATKER`.
- 408 direktorat: 12 direktorat pada masing-masing Polda, anak langsung Polda, tipe `DIREKTORAT`.
- Polsek tidak diimpor sesuai ruang lingkup tahap ini. Root `MABES_POLRI` tidak ditampilkan sebagai pilihan input; seluruh anak langsungnya tampil sebagai level Satker.

## Struktur Unit Organisasi/Satfung

Migration 008 menambahkan unit organisasi berdasarkan Satker final yang dipilih:

- Direktorat Polda: Bagrenmin, Bagbinopsnal, Bagwassidik, Siident, Subdit, dan Unit.
- Polres: Siwas, Sipropam, Bagops, Bagren, Bag SDM, Baglog, Sihumas, Sikum, Si TIK, Sium, SPKT, satuan fungsi operasional, Sikeu, Sidokkes, dan Polsek.
- Satker Mabes langsung: Unit Organisasi satker sebagai fallback awal; struktur rinci tiap Satker Mabes harus mengikuti SOTK khusus satker tersebut.
- Direktorat Reskrimum: Subdirektorat I–V dan Unit di bawah masing-masing Subdirektorat sebagai struktur Polda Tipe A Khusus; Direktorat Reskrimum lain mengikuti Subdit I–IV sesuai tipe Polda.
- Ditres PPA dan PPO: Subdirektorat I–III dan Unit di bawah masing-masing Subdirektorat.
- Direktorat lain: node umum `Subdirektorat → Unit` disediakan sampai nomenklatur SOTK spesifik Direktorat tersedia.

Unit dan fungsi ditampilkan melalui relasi `unit_kerja.id_satker` dan `satker_fungsi`, bukan daftar global. Backend memvalidasi bahwa `id_unit` dan `id_fungsi` selalu berada di bawah Satker yang dikirim pada payload.
`unit_kerja.id_unit_induk` menyimpan relasi parent-child sehingga dropdown menampilkan indentasi sampai level Subdirektorat dan Unit.

Migration 007 melengkapi 157 Polres yang sebelumnya kosong pada 9 Polda tersebut: Riau (12), Sulawesi Barat (6), Sulawesi Selatan (25), Sulawesi Tengah (13), Sulawesi Tenggara (17), Sulawesi Utara (15), Sumatra Barat (19), Sumatra Selatan (17), dan Sumatra Utara (33). Semua node memakai parent Polda yang sesuai dan kode internal idempoten.

## Kode internal

Kode `PD001`–`PD034` dan `PDxxx_PR001`–`PDxxx_PRnnn` adalah kode internal aplikasi untuk menjaga panjang kolom dan relasi parent. Kode tersebut bukan klaim sebagai kode resmi organisasi Polri; nama dan parent diambil dari halaman sumber resmi. Jika tersedia master kode internal resmi, kode aplikasi harus dimigrasikan melalui proses koreksi ter-audit.

Direktorat memakai kode internal turunan seperti `PD001_DITINTELKAM`; nama dan parent Polda mengikuti Lampiran I Perpol No. 6 Tahun 2025. Direktorat yang pembentukannya bergantung kebutuhan tetap perlu divalidasi penerapannya pada Polda tertentu sebelum dipakai untuk penempatan personel.
### Satbrimob pada tingkat Polda

Migration `010_polda_satbrimob.sql` menambahkan satu node `SATBRIMOB` di bawah setiap Polda (34 node). Struktur internal mengikuti Perpol No. 6 Tahun 2025 Pasal 36–37: Subbagrenmin, Bagops, Silog, Siprovos, Si TIK, Siyanma, Sikesjas, Siintel, Dengegana, serta batalyon. Setiap unit memiliki `id_satker` ke Satbrimob dan `id_unit_induk` untuk hubungan parent-child.

Catatan: master saat ini belum memiliki atribut tipe Polda. Karena itu migration memakai varian struktur A/A Khusus (Yon A–D). Variasi Tipe B (Yon A–C) perlu dipisahkan setelah atribut tipe Polda ditambahkan dari sumber resmi.
