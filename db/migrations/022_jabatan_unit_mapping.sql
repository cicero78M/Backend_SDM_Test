-- Pemetaan nomenklatur jabatan terhadap Unit Kerja.
CREATE TABLE IF NOT EXISTS jabatan_unit_kerja (
    id_jabatan INTEGER NOT NULL REFERENCES jabatan (id_jabatan) ON DELETE CASCADE,
    id_unit INTEGER NOT NULL REFERENCES unit_kerja (id_unit) ON DELETE CASCADE,
    sumber VARCHAR(30) NOT NULL DEFAULT 'nomenklatur',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id_jabatan, id_unit)
);

CREATE INDEX IF NOT EXISTS ix_jabatan_unit_kerja_unit
    ON jabatan_unit_kerja (id_unit, id_jabatan)
    WHERE is_active = TRUE;

INSERT INTO jabatan_unit_kerja (id_jabatan, id_unit, sumber)
SELECT j.id_jabatan, u.id_unit, 'nomenklatur'
FROM jabatan j CROSS JOIN unit_kerja u
WHERE u.is_active = TRUE
  AND (j.jenis_jabatan IN ('FUNGSIONAL', 'PELAKSANA')
    OR (j.nama_jabatan IN ('Kepala Bagian', 'Kepala Sub Bagian') AND u.tipe_unit IN ('BAGIAN', 'BIRO', 'SEKRETARIAT'))
    OR (j.nama_jabatan = 'Kepala Bidang' AND u.tipe_unit = 'BIDANG'))
ON CONFLICT (id_jabatan, id_unit) DO UPDATE SET is_active = TRUE, sumber = EXCLUDED.sumber;
