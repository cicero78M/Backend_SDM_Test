-- Migration 009: menghubungkan Subdirektorat dan Unit sebagai child Unit Organisasi.
-- Nomenklatur bernomor hanya ditambahkan pada Direktorat yang diatur eksplisit.
BEGIN;

UPDATE unit_kerja child
SET id_unit_induk = parent.id_unit, tipe_unit = 'UNIT'
FROM unit_kerja parent
WHERE child.id_satker = parent.id_satker
  AND child.kode_unit = 'UNIT'
  AND parent.kode_unit = 'SUBDIT';

UPDATE unit_kerja SET tipe_unit='SUBDIREKTORAT' WHERE kode_unit='SUBDIT';

WITH template(kode, nama, urutan) AS (
  VALUES ('SUBDIT_I','Subdirektorat I',1),('SUBDIT_II','Subdirektorat II',2),('SUBDIT_III','Subdirektorat III',3),('SUBDIT_IV','Subdirektorat IV',4),('SUBDIT_V','Subdirektorat V',5)
), target AS (
  SELECT u.id_unit AS parent_id, u.id_satker
  FROM unit_kerja u JOIN satker s ON s.id_satker=u.id_satker
  WHERE u.kode_unit='SUBDIT' AND s.kode_satker LIKE '%_DITRESKRIMUM'
), rows_to_add AS (
  SELECT t.parent_id,t.id_satker,x.kode,x.nama,x.urutan FROM target t CROSS JOIN template x
)
INSERT INTO unit_kerja (id_unit,kode_unit,nama_unit,id_satker,id_unit_induk,tipe_unit,is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0)+ROW_NUMBER() OVER (ORDER BY id_satker,urutan),kode,nama,id_satker,parent_id,'SUBDIREKTORAT',TRUE
FROM rows_to_add
ON CONFLICT (id_satker,kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit,id_unit_induk=EXCLUDED.id_unit_induk,tipe_unit=EXCLUDED.tipe_unit,is_active=TRUE;

WITH template(kode, nama, urutan) AS (
  VALUES ('SUBDIT_I','Subdirektorat I',1),('SUBDIT_II','Subdirektorat II',2),('SUBDIT_III','Subdirektorat III',3)
), target AS (
  SELECT u.id_unit AS parent_id, u.id_satker
  FROM unit_kerja u JOIN satker s ON s.id_satker=u.id_satker
  WHERE u.kode_unit='SUBDIT' AND s.kode_satker LIKE '%_DITRESPPA_PPO'
), rows_to_add AS (
  SELECT t.parent_id,t.id_satker,x.kode,x.nama,x.urutan FROM target t CROSS JOIN template x
)
INSERT INTO unit_kerja (id_unit,kode_unit,nama_unit,id_satker,id_unit_induk,tipe_unit,is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0)+ROW_NUMBER() OVER (ORDER BY id_satker,urutan),kode,nama,id_satker,parent_id,'SUBDIREKTORAT',TRUE
FROM rows_to_add
ON CONFLICT (id_satker,kode_unit) DO UPDATE SET nama_unit=EXCLUDED.nama_unit,id_unit_induk=EXCLUDED.id_unit_induk,tipe_unit=EXCLUDED.tipe_unit,is_active=TRUE;

WITH target AS (
  SELECT u.id_unit AS parent_id,u.id_satker,u.kode_unit
  FROM unit_kerja u
  WHERE u.tipe_unit='SUBDIREKTORAT' AND u.kode_unit IN ('SUBDIT_I','SUBDIT_II','SUBDIT_III','SUBDIT_IV','SUBDIT_V')
), rows_to_add AS (
  SELECT parent_id,id_satker,parent_id::text || '_UNIT' AS kode_unit,'Unit' AS nama_unit FROM target
)
INSERT INTO unit_kerja (id_unit,kode_unit,nama_unit,id_satker,id_unit_induk,tipe_unit,is_active)
SELECT COALESCE((SELECT MAX(id_unit) FROM unit_kerja),0)+ROW_NUMBER() OVER (ORDER BY id_satker,parent_id),kode_unit,nama_unit,id_satker,parent_id,'UNIT',TRUE
FROM rows_to_add
ON CONFLICT (id_satker,kode_unit) DO UPDATE SET id_unit_induk=EXCLUDED.id_unit_induk,tipe_unit=EXCLUDED.tipe_unit,is_active=TRUE;

INSERT INTO fungsi (kode_fungsi,nama_fungsi,is_active)
SELECT 'SATFUNG_'||kode_unit,MIN(nama_unit),TRUE FROM unit_kerja
WHERE id_satker IS NOT NULL AND kode_unit IS NOT NULL GROUP BY kode_unit
ON CONFLICT (kode_fungsi) DO UPDATE SET nama_fungsi=EXCLUDED.nama_fungsi,is_active=TRUE;
INSERT INTO satker_fungsi (id_satker,id_fungsi,is_active)
SELECT u.id_satker,f.id_fungsi,TRUE FROM unit_kerja u JOIN fungsi f ON f.kode_fungsi='SATFUNG_'||u.kode_unit
WHERE u.id_satker IS NOT NULL AND u.kode_unit IS NOT NULL
ON CONFLICT (id_satker,id_fungsi) DO UPDATE SET is_active=TRUE,updated_at=NOW();

COMMIT;
