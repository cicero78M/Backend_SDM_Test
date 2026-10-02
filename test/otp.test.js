import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOtp, hashOtp } from '../src/otp.js';

test('OTP generator menghasilkan enam digit dan hash stabil', () => {
  const otp = generateOtp();
  assert.match(otp, /^\d{6}$/);
  assert.equal(hashOtp(otp), hashOtp(otp));
  assert.notEqual(hashOtp(otp), hashOtp('000000'));
});
