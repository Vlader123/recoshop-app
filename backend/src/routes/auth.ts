import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { Errors, wrap } from '../middleware/errors';
import { requireAuth, signToken } from '../middleware/auth';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(6, 'Пароль має містити щонайменше 6 символів').max(100),
  name: z.string().trim().max(100).optional()
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

const publicUser = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    const body = registerSchema.parse(req.body);
    if (await queryOne('SELECT 1 FROM users WHERE email = $1', [body.email])) throw Errors.emailTaken();
    const hash = await bcrypt.hash(body.password, 10);
    const user = await queryOne(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role`,
      [body.email, hash, body.name ?? body.email.split('@')[0]]
    );
    res.status(201).json({ user: publicUser(user), token: signToken({ id: user!.id, role: user!.role }) });
  })
);

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await queryOne('SELECT id, email, name, role, password_hash FROM users WHERE email = $1', [body.email]);
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) throw Errors.invalidCredentials();
    res.json({ user: publicUser(user), token: signToken({ id: user.id, role: user.role }) });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await queryOne('SELECT id, email, name, role FROM users WHERE id = $1', [req.user!.id]);
    if (!user) throw Errors.unauthorized();
    res.json({ user: publicUser(user) });
  })
);

export async function emailExists(email: string) {
  return (await query('SELECT 1 FROM users WHERE email = $1', [email])).length > 0;
}
