import { createHash, randomInt } from 'node:crypto';

export const OTP_TTL_MINUTES = Math.max(Number(process.env.OTP_TTL_MINUTES || 10), 1);
export const OTP_MAX_ATTEMPTS = Math.max(Number(process.env.OTP_MAX_ATTEMPTS || 5), 1);
export const OTP_RESEND_COOLDOWN_SECONDS = Math.max(Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60), 0);

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(otp) {
  return createHash('sha256').update(String(otp)).digest('hex');
}
