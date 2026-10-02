-- Menghapus duplikasi child Unit lama setelah Subdirektorat bernama dibuat.
UPDATE unit_kerja child
SET is_active=false
FROM unit_kerja parent
WHERE child.id_unit_induk=parent.id_unit
  AND parent.tipe_unit='SUBDIREKTORAT'
  AND child.kode_unit ~ '^[0-9]+_UNIT$';
