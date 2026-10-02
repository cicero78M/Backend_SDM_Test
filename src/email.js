import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const delivery = process.env.EMAIL_DELIVERY || (process.env.NODE_ENV === 'production' ? 'smtp' : 'console');
const from = process.env.EMAIL_FROM || 'no-reply@example.invalid';
let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (delivery !== 'smtp') return null;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error('SMTP_HOST, SMTP_USER, dan SMTP_PASSWORD wajib diisi saat EMAIL_DELIVERY=smtp.');
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return transporter;
}

export async function sendRegistrationOtp({ email, otp, expiresMinutes }) {
  const subject = 'Validasi email registrasi SDM';
  const text = `Kode OTP registrasi Anda: ${otp}\n\nKode berlaku ${expiresMinutes} menit. Jangan bagikan kode ini kepada siapa pun.`;
  const mailer = getTransporter();
  if (!mailer) {
    if (delivery !== 'console') throw new Error(`EMAIL_DELIVERY tidak didukung: ${delivery}`);
    console.info(`[email:console] registration OTP for ${email}: ${otp}`);
    return { mode: 'console' };
  }
  await mailer.sendMail({ from, to: email, subject, text });
  return { mode: 'smtp' };
}

export async function sendPasswordResetEmail({ email, token, expiresMinutes }) {
  const resetUrl = process.env.PASSWORD_RESET_URL || 'http://localhost:4173/?reset_token=';
  const url = `${resetUrl}${resetUrl.includes('reset_token=') ? encodeURIComponent(token) : `?reset_token=${encodeURIComponent(token)}`}`;
  const subject = 'Reset password aplikasi SDM';
  const text = `Gunakan tautan berikut untuk membuat password baru:\n${url}\n\nTautan berlaku ${expiresMinutes} menit dan hanya dapat digunakan satu kali. Jika Anda tidak meminta reset password, abaikan email ini.`;
  const mailer = getTransporter();
  if (!mailer) {
    if (delivery !== 'console') throw new Error(`EMAIL_DELIVERY tidak didukung: ${delivery}`);
    console.info(`[email:console] password reset instructions for ${email}: ${url}`);
    return { mode: 'console' };
  }
  await mailer.sendMail({ from, to: email, subject, text });
  return { mode: 'smtp' };
}
