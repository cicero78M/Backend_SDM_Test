import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DEMO_DATABASE_URL;
const baseUrl = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

if (!databaseUrl) throw new Error('DEMO_DATABASE_URL wajib diisi; runner menolak memakai DATABASE_URL aplikasi secara implisit.');

const db = new Client({ connectionString: databaseUrl });
await db.connect();
try {
  const result = await db.query('SELECT current_database() AS database_name, current_user AS database_user');
  const { database_name: databaseName, database_user: databaseUser } = result.rows[0];
  if (/^(postgres|template0|template1)$/i.test(databaseName) || !/(demo|e2e|test)/i.test(databaseName)) {
    throw new Error(`Database '${databaseName}' tidak terlihat seperti database demo/test; runner dihentikan demi keselamatan.`);
  }
  console.log(`Database demo terverifikasi: ${databaseName} (user ${databaseUser})`);
} finally {
  await db.end();
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${text}`);
  return body;
}

const credentials = {
  admin_ssdm: [process.env.DEMO_ADMIN_USERNAME || 'demo_admin_ssdm', process.env.DEMO_ADMIN_PASSWORD || 'Demo-Admin-2026!'],
  operator_polda: [process.env.DEMO_POLDA_USERNAME || 'demo_operator_polda', process.env.DEMO_POLDA_PASSWORD || 'Demo-Operator-2026!'],
  operator_satker: [process.env.DEMO_SATKER_USERNAME || 'demo_operator_satker', process.env.DEMO_SATKER_PASSWORD || 'Demo-Operator-2026!']
};

const health = await request('/health');
if (health.status !== 'ok') throw new Error('Health check tidak mengembalikan status ok.');

const sessions = {};
for (const [role, [username, password]] of Object.entries(credentials)) {
  const login = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (login.user?.role !== role) throw new Error(`Role login ${username} tidak sesuai: ${login.user?.role}`);
  sessions[role] = login;
  const listing = await request('/api/v1/personel?page=1&limit=10', { headers: { authorization: `Bearer ${login.token}` } });
  if (!Array.isArray(listing.data) || !listing.meta) throw new Error(`Response personel ${role} tidak sesuai kontrak.`);
  console.log(`${role}: login dan daftar personel OK (${listing.meta.total} data terlihat)`);
}

const adminHeaders = { authorization: `Bearer ${sessions.admin_ssdm.token}` };
const users = await request('/api/v1/auth/users/approved?page=1&limit=50', { headers: adminHeaders });
for (const role of ['operator_polda', 'operator_satker']) {
  const username = credentials[role][0];
  const user = users.data.find((item) => item.username === username);
  if (!user) throw new Error(`User demo ${username} tidak ditemukan.`);
  const scopes = await request(`/api/v1/auth/users/${user.id_user}/scopes`, { headers: adminHeaders });
  if (!Array.isArray(scopes.data)) throw new Error(`Scope ${role} tidak berupa array.`);
  console.log(`${role}: scope terverifikasi (${scopes.data.length} Satker)`);
}

console.log('E2E demo tiga persona lulus: Admin SSDM, Operator Polda, Operator Satker.');
