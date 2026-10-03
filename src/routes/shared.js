/** Shared SQL projections for personnel endpoints. */
export const employeeSelect = `SELECT p.*, u.nama_unit, j.nama_jabatan, g.kode_golongan, COALESCE(p.pangkat, g.nama_pangkat) AS nama_pangkat FROM pegawai p JOIN unit_kerja u ON u.id_unit=p.id_unit JOIN jabatan j ON j.id_jabatan=p.id_jabatan LEFT JOIN golongan g ON g.id_golongan=p.id_golongan`;
