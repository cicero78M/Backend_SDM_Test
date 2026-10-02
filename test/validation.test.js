import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalSchema, educationSchema, employeeSchema, forgotPasswordSchema, jobHistorySchema, personnelSchema, registerSchema, registerVerifyEmailSchema, resetPasswordSchema, trainingSchema, userScopeSchema, validate } from '../src/validation.js';

const basePersonel = {
  nip: '12345678',
  jenis_personel: 'POLRI',
  jenis_identitas: 'NRP',
  nik: '3201010101010001',
  nama: 'Budi Santoso',
  jenis_kelamin: 'L',
  tanggal_lahir: '1990-01-01',
  id_unit: 1,
  id_jabatan: 1,
  id_satker: 1
};

test('validasi menerima personel POLRI dengan NRP dan golongan kosong', () => {
  const result = validate(personnelSchema, basePersonel);
  assert.equal(result.error, undefined);
  assert.equal(result.data.jenis_personel, 'POLRI');
  assert.equal(result.data.id_golongan ?? null, null);
  assert.equal(result.data.batas_usia_pensiun, 58);
});

test('validasi menerima ASN dengan NIP dan pangkat langsung', () => {
  const result = validate(employeeSchema, {
    ...basePersonel,
    nip: '199001012020121001',
    jenis_personel: 'ASN',
    jenis_identitas: 'NIP',
    pangkat: 'Penata Muda'
  });
  assert.equal(result.error, undefined);
  assert.equal(result.data.jenis_identitas, 'NIP');
});

test('validasi menolak identitas yang bukan NRP/NIP 8–18 digit', () => {
  const result = validate(employeeSchema, { ...basePersonel, nip: '1234' });
  assert.deepEqual(result.error.map(item => item.field), ['nip']);
});

test('validasi menolak histori dengan tanggal selesai sebelum tanggal mulai', () => {
  const result = validate(jobHistorySchema, {
    id_jabatan: 1,
    id_satker: 1,
    id_unit: 1,
    id_status_jabatan: 1,
    tanggal_mulai: '2025-01-01',
    tanggal_selesai: '2024-12-31'
  });
  assert.equal(result.error[0].field, 'tanggal_selesai');
});

test('validasi scope menerima daftar Satker unik dan menolak duplikat', () => {
  assert.equal(validate(userScopeSchema, { id_satker: [1, 2, 3] }).error, undefined);
  assert.equal(validate(userScopeSchema, { id_satker: [1, 1] }).error[0].field, 'id_satker');
});

test('validasi pendidikan menerima jenjang dan tahun lulus', () => {
  const result = validate(educationSchema, { jenjang: 'S2', institusi: 'Universitas Demo', tahun_lulus: 2024 });
  assert.equal(result.error, undefined);
});

test('validasi diklat menolak nilai di atas 100 dan tanggal terbalik', () => {
  const result = validate(trainingSchema, { nama_diklat: 'Diklat Demo', nilai: 101, tanggal_mulai: '2025-02-01', tanggal_selesai: '2025-01-01' });
  assert.deepEqual(result.error.map(item => item.field), ['nilai', 'tanggal_selesai']);
});

test('registrasi mewajibkan email valid', () => {
  const result = validate(registerSchema, { username: 'budi', email: 'bukan-email', nama: 'Budi Santoso', pangkat: 'Briptu', nip: '12345678', id_satker: 1, password: 'password-kuat' });
  assert.equal(result.error[0].field, 'email');
});

test('registrasi membatasi NRP POLRI 8 digit dan NIP ASN 18 digit', () => {
  const polri = validate(registerSchema, { username: 'polri8', email: 'polri8@example.com', nama: 'Polri Delapan', jenis_personel: 'POLRI', pangkat: 'BRIGADIR POLISI', nip: '1234567', id_satker: 1, password: 'password-kuat' });
  const asn = validate(registerSchema, { username: 'asn18', email: 'asn18@example.com', nama: 'ASN Delapan Belas', jenis_personel: 'ASN', id_golongan: 1, nip: '12345678901234567', id_satker: 1, password: 'password-kuat' });
  assert.equal(polri.error.some(item => item.field === 'nip'), true);
  assert.equal(asn.error.some(item => item.field === 'nip'), true);
});

test('approval menerima scope Satker bertingkat dan menolak duplikat', () => {
  assert.equal(validate(approvalSchema, { decision: 'approve', approved_role: 'operator_satker', scope_satker: [236, 1005] }).error, undefined);
  assert.equal(validate(approvalSchema, { decision: 'approve', scope_satker: [236, 236] }).error[0].field, 'scope_satker');
});

test('OTP registrasi harus tepat enam digit', () => {
  assert.equal(validate(registerVerifyEmailSchema, { registration_id: 1, otp: '123456' }).error, undefined);
  assert.equal(validate(registerVerifyEmailSchema, { registration_id: 1, otp: '12345' }).error[0].field, 'otp');
});

test('reset password menerima username atau email sebagai identifier', () => {
  assert.equal(validate(forgotPasswordSchema, { identifier: 'user@example.com' }).error, undefined);
  assert.equal(validate(forgotPasswordSchema, { identifier: 'admin_ssdm' }).error, undefined);
  assert.equal(validate(forgotPasswordSchema, { username: 'admin_ssdm' }).error, undefined);
  assert.equal(validate(forgotPasswordSchema, {}).error[0].field, 'identifier');
});

test('reset password mewajibkan konfirmasi yang sama', () => {
  assert.equal(validate(resetPasswordSchema, { token: 'a'.repeat(32), new_password: 'password-baru', confirm_password: 'password-baru' }).error, undefined);
  assert.equal(validate(resetPasswordSchema, { token: 'a'.repeat(32), new_password: 'password-baru', confirm_password: 'berbeda-123' }).error[0].field, 'confirm_password');
});
