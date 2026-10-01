import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-for-authorization-suite-123456';
const { authorize } = await import('../src/auth.js');

function run(role, allowedRoles) {
  let nextCalled = false;
  let response;
  const middleware = authorize(...allowedRoles);
  middleware({ user: { role } }, {
    status(code) { response = { status: code }; return this; },
    json(body) { response = { ...response, body }; return this; }
  }, () => { nextCalled = true; });
  return { nextCalled, response };
}

test('role operator_satker diizinkan pada endpoint yang dikelola operator', () => {
  assert.equal(run('operator_satker', ['admin', 'admin_ssdm', 'operator_satker']).nextCalled, true);
});

test('role viewer ditolak dari endpoint yang dikelola operator', () => {
  const result = run('viewer', ['admin', 'admin_ssdm', 'operator_satker']);
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.status, 403);
  assert.equal(result.response.body.error, 'Anda tidak memiliki permission untuk aksi ini.');
});

test('role admin_ssdm diizinkan pada endpoint administrasi', () => {
  assert.equal(run('admin_ssdm', ['admin', 'admin_ssdm']).nextCalled, true);
});
