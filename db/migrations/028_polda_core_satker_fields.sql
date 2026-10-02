-- Melengkapi Satker inti di bawah setiap Polda sesuai rumpun organisasi Polda.
WITH fields(kode,nama,urutan) AS (
  VALUES
    ('ROOPS','BIRO OPERASI',10),
    ('RORENA','BIRO PERENCANAAN UMUM DAN ANGGARAN',20),
    ('ROSDM','BIRO SUMBER DAYA MANUSIA',30),
    ('ROLOG','BIRO LOGISTIK',40),
    ('BIDPROPAM','BIDANG PROFESI DAN PENGAMANAN',50),
    ('BIDKUM','BIDANG HUKUM',60),
    ('BIDHUMAS','BIDANG HUBUNGAN MASYARAKAT',70),
    ('BIDDOKKES','BIDANG KEDOKTERAN DAN KESEHATAN',80),
    ('BIDLABFOR','BIDANG LABORATORIUM FORENSIK',90),
    ('BIDTIK','BIDANG TEKNOLOGI INFORMASI DAN KOMUNIKASI',100),
    ('SPN','SEKOLAH POLISI NEGARA',110),
    ('RSBHAYANGKARA','RUMAH SAKIT BHAYANGKARA',120)
), targets AS (
  SELECT p.id_satker,p.kode_satker,f.kode,f.nama,f.urutan
  FROM satker p CROSS JOIN fields f
  WHERE p.tipe_satker='POLDA' AND p.kode_satker NOT LIKE 'DEMO%'
)
INSERT INTO satker (kode_satker,nama_satker,tipe_satker,id_satker_induk,is_active)
SELECT t.kode_satker || '_' || t.kode,t.nama,'SATKER',t.id_satker,true FROM targets t
ON CONFLICT (kode_satker) DO UPDATE SET nama_satker=EXCLUDED.nama_satker,tipe_satker=EXCLUDED.tipe_satker,id_satker_induk=EXCLUDED.id_satker_induk,is_active=true;

WITH unit_templates(satker_code,unit_code,unit_name,unit_type,urutan) AS (
  VALUES
    ('ROOPS','BAGRENMIN','Bagian Perencanaan dan Administrasi','PEMBANTU',10),('ROOPS','BAGOPS','Bagian Operasi','PELAKSANA',20),
    ('RORENA','BAGRENMIN','Bagian Perencanaan dan Administrasi','PEMBANTU',10),('RORENA','BAGKEU','Bagian Keuangan','PENDUKUNG',20),
    ('ROSDM','BAGBINKAR','Bagian Pembinaan Karier','PELAKSANA',10),('ROSDM','BAGDALPERS','Bagian Pengendalian Personel','PELAKSANA',20),
    ('ROLOG','BAGBEKUM','Bagian Perbekalan Umum','PENDUKUNG',10),('ROLOG','BAGSARPRAS','Bagian Sarana dan Prasarana','PENDUKUNG',20),
    ('BIDPROPAM','SUBBIDPROVOS','Subbidang Provos','PENGAWAS',10),('BIDPROPAM','SUBBIDWABPROF','Subbidang Wabprof','PENGAWAS',20),
    ('BIDKUM','SUBBIDBANKUM','Subbidang Bantuan Hukum','PELAKSANA',10),('BIDKUM','SUBBIDKEMEN','Subbidang Kajian dan Dokumentasi Hukum','PELAKSANA',20),
    ('BIDHUMAS','SUBBIDPENMAS','Subbidang Penerangan Masyarakat','PELAKSANA',10),('BIDHUMAS','SUBBIDMULTIMEDIA','Subbidang Multimedia','PELAKSANA',20),('BIDHUMAS','SUBBIDPID','Subbidang Pengelolaan Informasi dan Dokumentasi','PELAKSANA',30),
    ('BIDDOKKES','SUBBIDKEDOKTERAN','Subbidang Kedokteran Kepolisian','PELAKSANA',10),('BIDDOKKES','SUBBIDKESEHATAN','Subbidang Kesehatan','PELAKSANA',20),
    ('BIDLABFOR','BAGJEMENMUT','Bagian Manajemen Mutu','PENDUKUNG',10),('BIDLABFOR','BIDDOKUPALFOR','Bidang Dokumen dan Uang Palsu Forensik','BIDANG',20),('BIDLABFOR','BIDBALMETFOR','Bidang Balistik dan Metalurgi Forensik','BIDANG',30),('BIDLABFOR','BIDFISKOMFOR','Bidang Fisika dan Komputer Forensik','BIDANG',40),('BIDLABFOR','BIDKIMBIOFOR','Bidang Kimia dan Biologi Forensik','BIDANG',50),
    ('BIDTIK','SUBBIDTEKINFO','Subbidang Teknologi Informasi','PELAKSANA',10),('BIDTIK','SUBBIDSANDI','Subbidang Persandian','PELAKSANA',20),
    ('SPN','BAGJARLAT','Bagian Pembelajaran dan Pelatihan','PELAKSANA',10),('SPN','BAGSUMDA','Bagian Sumber Daya','PENDUKUNG',20),
    ('RSBHAYANGKARA','BAGTAUD','Bagian Tata Usaha dan Urusan Dalam','PEMBANTU',10),('RSBHAYANGKARA','BIDPELAYANAN','Bidang Pelayanan Medik','PELAYANAN',20)
), targets AS (
  SELECT s.id_satker,s.kode_satker FROM satker s WHERE s.is_active AND s.kode_satker NOT LIKE 'DEMO%' AND s.kode_satker ~ '_(ROOPS|RORENA|ROSDM|ROLOG|BIDPROPAM|BIDKUM|BIDHUMAS|BIDDOKKES|BIDLABFOR|BIDTIK|SPN|RSBHAYANGKARA)$'
)
INSERT INTO unit_kerja (id_unit,kode_unit,nama_unit,id_satker,tipe_unit,is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0)+ROW_NUMBER() OVER (ORDER BY t.id_satker,x.urutan),x.unit_code,x.unit_name,t.id_satker,x.unit_type,true
FROM targets t JOIN unit_templates x ON t.kode_satker LIKE '%' || x.satker_code
ON CONFLICT (id_satker,kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit,tipe_unit=EXCLUDED.tipe_unit,is_active=true;
