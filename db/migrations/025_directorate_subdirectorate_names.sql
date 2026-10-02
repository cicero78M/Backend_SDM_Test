-- Menormalkan hierarki Direktorat: SUBDIT (kategori) -> Subdirektorat bernama -> Unit.
WITH template(suffix,kode,nama,urutan) AS (
  VALUES
    ('DITINTELKAM','SUBDIT_POLITIK','Subdirektorat Politik',10),('DITINTELKAM','SUBDIT_EKONOMI','Subdirektorat Ekonomi',20),('DITINTELKAM','SUBDIT_SOSBUD','Subdirektorat Sosial Budaya',30),('DITINTELKAM','SUBDIT_KAMNEG','Subdirektorat Keamanan Negara',40),
    ('DITRESKRIMSUS','SUBDIT_TIPIDTER','Subdirektorat Tindak Pidana Tertentu',10),('DITRESKRIMSUS','SUBDIT_TIPIDKOR','Subdirektorat Tindak Pidana Korupsi',20),('DITRESKRIMSUS','SUBDIT_INDUSTRI','Subdirektorat Industri dan Perdagangan',30),
    ('DITRESSIBER','SUBDIT_CYBERCRIME','Subdirektorat Cyber Crime',10),('DITRESSIBER','SUBDIT_CYBERPATROL','Subdirektorat Cyber Patrol',20),('DITRESNARKOBA','SUBDIT_1','Subdirektorat 1',10),('DITRESNARKOBA','SUBDIT_2','Subdirektorat 2',20),
    ('DITBINMAS','SUBDIT_BINPOLMAS','Subdirektorat Pembinaan Polisi Masyarakat',10),('DITBINMAS','SUBDIT_BINTIBMAS','Subdirektorat Pembinaan Ketertiban Masyarakat',20),('DITSAMAPTA','SUBDIT_GASUM','Subdirektorat Gasum',10),('DITSAMAPTA','SUBDIT_DALMAS','Subdirektorat Dalmas',20),
    ('DITLANTAS','SUBDIT_KAMSEL','Subdirektorat Keamanan dan Keselamatan',10),('DITLANTAS','SUBDIT_GAKKUM','Subdirektorat Penegakan Hukum',20),('DITLANTAS','SUBDIT_REGIDENT','Subdirektorat Registrasi dan Identifikasi',30),
    ('DITPAMOBVIT','SUBDIT_WISATA','Subdirektorat Pariwisata',10),('DITPAMOBVIT','SUBDIT_KAWASAN','Subdirektorat Kawasan Tertentu',20),('DITPOLAIRUD','SUBDIT_PATROLI','Subdirektorat Patroli',10),('DITPOLAIRUD','SUBDIT_GAKKUM','Subdirektorat Penegakan Hukum',20),('DITTAHTI','SUBDIT_TAHANAN','Subdirektorat Perawatan Tahanan',10),('DITTAHTI','SUBDIT_BARBUK','Subdirektorat Barang Bukti',20)
), targets AS (
  SELECT s.id_satker,s.kode_satker,u.id_unit AS parent_id,t.kode,t.nama,t.urutan FROM satker s JOIN unit_kerja u ON u.id_satker=s.id_satker AND u.kode_unit='SUBDIT' JOIN template t ON s.kode_satker LIKE '%' || t.suffix WHERE s.tipe_satker='DIREKTORAT'
), numbered AS (
  SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0)+ROW_NUMBER() OVER (ORDER BY id_satker,urutan) AS id_unit,* FROM targets
)
INSERT INTO unit_kerja (id_unit,kode_unit,nama_unit,id_satker,id_unit_induk,tipe_unit,is_active)
SELECT id_unit,kode,nama,id_satker,parent_id,'SUBDIREKTORAT',true FROM numbered
ON CONFLICT (id_satker,kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit,id_unit_induk=EXCLUDED.id_unit_induk,tipe_unit=EXCLUDED.tipe_unit,is_active=true;

INSERT INTO unit_kerja (id_unit,kode_unit,nama_unit,id_satker,id_unit_induk,tipe_unit,is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0)+ROW_NUMBER() OVER (ORDER BY u.id_satker,u.id_unit),u.kode_unit || '_UNIT','Unit ' || u.nama_unit,u.id_satker,u.id_unit,'UNIT',true
FROM unit_kerja u WHERE u.tipe_unit='SUBDIREKTORAT' AND u.kode_unit LIKE 'SUBDIT_%'
ON CONFLICT (id_satker,kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit,id_unit_induk=EXCLUDED.id_unit_induk,tipe_unit=EXCLUDED.tipe_unit,is_active=true;

UPDATE unit_kerja child SET is_active=false FROM unit_kerja parent
WHERE child.id_unit_induk=parent.id_unit AND parent.kode_unit='SUBDIT' AND child.kode_unit='UNIT';
