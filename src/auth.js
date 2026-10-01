import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET wajib diisi dan minimal 32 karakter.');
export const hashPassword = (password) => bcrypt.hash(password, 12);
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);
export const signToken = (user) => jwt.sign({ sub: user.id_user, username: user.username, role: user.role }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
export async function authenticate(req, res, next) { try { const header = req.headers.authorization || ''; if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Token Bearer wajib disertakan.' }); const payload = jwt.verify(header.slice(7), secret); const { rows } = await query('SELECT id_user, username, role, is_active FROM users WHERE id_user = $1', [payload.sub]); if (!rows[0]?.is_active) return res.status(401).json({ error: 'User tidak aktif atau tidak ditemukan.' }); req.user = rows[0]; return next(); } catch { return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' }); } }
export const authorize = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Anda tidak memiliki permission untuk aksi ini.' });
