-- Fixture additive untuk pendidikan dan diklat personel demo.
-- Hanya menyentuh personel dengan NRP DEMO 90000000000*.
BEGIN;
DELETE FROM riwayat_pendidikan_personel p USING pegawai e WHERE e.id_pegawai=p.id_pegawai AND e.nip LIKE '90000000000%';
DELETE FROM riwayat_diklat_personel d USING pegawai e WHERE e.id_pegawai=d.id_pegawai AND e.nip LIKE '90000000000%';

INSERT INTO riwayat_pendidikan_personel (id_pegawai, jenjang, institusi, jurusan, tahun_lulus, nomor_ijazah, keterangan)
SELECT p.id_pegawai, x.jenjang, x.institusi, x.jurusan, x.tahun, x.ijazah, x.keterangan
FROM (VALUES
 ('900000000001','S1','Universitas Bhayangkara','Manajemen',2011,'DEMO-IJZ-001','Pendidikan terakhir simulasi'),
 ('900000000002','D3','Politeknik Kepolisian','Administrasi Kepolisian',2012,'DEMO-IJZ-002','Pendidikan vokasi simulasi'),
 ('900000000003','S2','Universitas Indonesia','Administrasi Publik',2014,'DEMO-IJZ-003','Pendidikan relevan jabatan analis'),
 ('900000000004','S1','Universitas Airlangga','Hukum',2009,'DEMO-IJZ-004','Pendidikan dasar profesi'),
 ('900000000005','S1','Universitas Gadjah Mada','Psikologi',2015,'DEMO-IJZ-005','Pendidikan relevan SDM'),
 ('900000000006','S2','Universitas Negeri Malang','Manajemen Publik',2013,'DEMO-IJZ-006','Pendidikan ASN simulasi')
) AS x(nip,jenjang,institusi,jurusan,tahun,ijazah,keterangan)
JOIN pegawai p ON p.nip=x.nip;

INSERT INTO riwayat_diklat_personel (id_pegawai, nama_diklat, jenis_diklat, penyelenggara, tanggal_mulai, tanggal_selesai, jam_pelajaran, nilai, nomor_sertifikat, keterangan)
SELECT p.id_pegawai, x.nama, x.jenis, x.penyelenggara, x.mulai::date, x.selesai::date, x.jam, x.nilai, x.sertifikat, x.keterangan
FROM (VALUES
 ('900000000001','Diklat Manajemen Operasional','Kepemimpinan','Pusdikmin Polri','2018-05-01','2018-05-10',80,88.50,'DEMO-SERT-001','Diklat kompetensi operasional'),
 ('900000000002','Diklat Teknis Pelayanan','Teknis','Pusdiklat Polri','2019-07-02','2019-07-08',56,84.00,'DEMO-SERT-002','Diklat teknis pelayanan'),
 ('900000000003','Diklat Analis Kebijakan','Fungsional','LAN RI','2020-03-01','2020-03-14',120,92.00,'DEMO-SERT-003','Diklat relevan analis'),
 ('900000000004','Diklat Pengawasan','Kepemimpinan','Pusdikmin Polri','2017-09-04','2017-09-15',100,89.50,'DEMO-SERT-004','Diklat pengawasan'),
 ('900000000005','Diklat Manajemen SDM','Teknis','SSDM Polri','2021-02-01','2021-02-10',80,91.00,'DEMO-SERT-005','Diklat pengelolaan SDM'),
 ('900000000006','Diklat Administrasi Publik','Fungsional','LAN RI','2022-08-01','2022-08-12',96,87.50,'DEMO-SERT-006','Diklat ASN simulasi')
) AS x(nip,nama,jenis,penyelenggara,mulai,selesai,jam,nilai,sertifikat,keterangan)
JOIN pegawai p ON p.nip=x.nip;
COMMIT;
