-- Migration 014: keluarkan placeholder Mabes dari pilihan aktif setelah SOTK tahap 1.
BEGIN;
UPDATE unit_kerja u SET is_active=FALSE
FROM satker s
WHERE u.id_satker=s.id_satker AND s.tipe_satker='SATKER_MABES' AND u.is_placeholder=TRUE;
UPDATE satker_fungsi sf SET is_active=FALSE
FROM unit_kerja u
JOIN satker s ON s.id_satker=u.id_satker
WHERE sf.id_satker=u.id_satker AND sf.id_fungsi IN (SELECT f.id_fungsi FROM fungsi f WHERE f.kode_fungsi=LEFT('SATFUNG_'||u.kode_unit,30)) AND s.tipe_satker='SATKER_MABES' AND u.is_placeholder=TRUE;
COMMIT;
