import { query } from './db.js';

// Hanya admin utama yang dapat mengakses seluruh scope organisasi.
// Admin SSDM tetap harus mengikuti user_scope agar data lintas Satker tidak bocor.
export const isAdministrator = (user) => user.role === 'admin';

// Role berikut dapat mengelola data personel dalam scope yang dimiliki.
export const canManagePersonnel = (user) => [
  'admin', 'admin_ssdm', 'editor', 'operator_polda', 'operator_satker', 'operator_polres'
].includes(user.role);

// Operator Polres hanya boleh mencatat riwayat pada Satker personel yang sedang dibuka.
export const isPolresOperator = (user) => ['operator_satker', 'operator_polres'].includes(user.role);

// Menyimpan jejak perubahan tanpa mengubah response endpoint pemanggil.
export const writeAudit = (req, action, resource, resourceId, metadata = {}) => query(
  `INSERT INTO audit_log (id_user, action, resource, resource_id, request_id, metadata)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [req.user.id_user, action, resource, resourceId == null ? null : String(resourceId), req.get('x-request-id') || null, JSON.stringify(metadata)]
);

// Memastikan personel berada dalam scope user sebelum data dibaca atau diubah.
export async function assertPersonnelAccess(user, personnelId, requiredSatkerId = null) {
  if (isAdministrator(user)) return true;
  const params = [user.id_user, personnelId];
  const satkerFilter = requiredSatkerId ? ' AND p.id_satker = $3' : '';
  if (requiredSatkerId) params.push(requiredSatkerId);
  const result = await query(`SELECT 1 FROM pegawai p JOIN user_scope us ON us.id_satker = p.id_satker WHERE us.id_user = $1 AND p.id_pegawai = $2${satkerFilter}`, params);
  return Boolean(result.rows[0]);
}

// Memastikan Satker tujuan termasuk scope user saat membuat histori jabatan.
export async function assertSatkerAccess(user, satkerId) {
  if (isAdministrator(user)) return true;
  const result = await query(`WITH RECURSIVE target_ancestors AS (
      SELECT id_satker, id_satker_induk FROM satker WHERE id_satker=$2 AND is_active=true
      UNION ALL
      SELECT parent.id_satker, parent.id_satker_induk
      FROM satker parent JOIN target_ancestors child ON child.id_satker_induk=parent.id_satker
      WHERE parent.is_active=true
    )
    SELECT 1 FROM user_scope us JOIN target_ancestors allowed ON allowed.id_satker=us.id_satker
    WHERE us.id_user=$1 LIMIT 1`, [user.id_user, satkerId]);
  return Boolean(result.rows[0]);
}

export async function assertUnitBelongsToSatker(unitId, satkerId) {
  const result = await query('SELECT 1 FROM unit_kerja WHERE id_unit=$1 AND id_satker=$2 AND is_active=true', [unitId, satkerId]);
  return Boolean(result.rows[0]);
}

export async function assertFunctionBelongsToSatker(functionId, satkerId) {
  if (functionId == null) return true;
  const result = await query('SELECT 1 FROM satker_fungsi WHERE id_fungsi=$1 AND id_satker=$2 AND is_active=true', [functionId, satkerId]);
  return Boolean(result.rows[0]);
}
