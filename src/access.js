import { query } from './db.js';

// Role administrator dapat mengakses seluruh scope organisasi.
export const isAdministrator = (user) => ['admin', 'admin_ssdm'].includes(user.role);

// Role berikut dapat mengelola data personel dalam scope yang dimiliki.
export const canManagePersonnel = (user) => [
  'admin', 'admin_ssdm', 'editor', 'operator_polda', 'operator_satker'
].includes(user.role);

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
  const result = await query('SELECT 1 FROM user_scope WHERE id_user = $1 AND id_satker = $2', [user.id_user, satkerId]);
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
