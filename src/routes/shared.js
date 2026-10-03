/** Shared SQL projections for personnel endpoints. */
export const employeeSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, COALESCE(p.pangkat, g.nama_pangkat) AS nama_pangkat FROM pegawai p JOIN unit_kerja u ON u.id_unit=p.id_unit JOIN jabatan j ON j.id_jabatan=p.id_jabatan LEFT JOIN golongan g ON g.id_golongan=p.id_golongan`;

// Projection lengkap yang dipakai halaman data personel dan profilnya.
export const personnelSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, COALESCE(p.pangkat, g.nama_pangkat) AS nama_pangkat,
  s.kode_satker, s.nama_satker, s.tipe_satker, parent.id_satker AS id_satker_induk,
  parent.kode_satker AS kode_satker_induk, parent.nama_satker AS nama_satker_induk,
  parent.tipe_satker AS tipe_satker_induk
  FROM pegawai p
  JOIN unit_kerja u ON u.id_unit = p.id_unit
  JOIN jabatan j ON j.id_jabatan = p.id_jabatan
  LEFT JOIN golongan g ON g.id_golongan = p.id_golongan
  LEFT JOIN satker s ON s.id_satker = p.id_satker
  LEFT JOIN satker parent ON parent.id_satker = s.id_satker_induk`;
