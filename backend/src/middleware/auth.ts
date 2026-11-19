import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Errors } from './errors';

export interface AuthUser {
  id: string;
  role: 'user' | 'manager';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, config.jwtSecret, { subject: user.id, expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

function parse(req: Request): AuthUser | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(h.slice(7), config.jwtSecret) as jwt.JwtPayload;
    return { id: String(p.sub), role: p.role === 'manager' ? 'manager' : 'user' };
  } catch {
    return null;
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = parse(req) ?? undefined;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const u = parse(req);
  if (!u) return next(Errors.unauthorized());
  req.user = u;
  next();
}

export function requireManager(req: Request, _res: Response, next: NextFunction) {
  const u = parse(req);
  if (!u) return next(Errors.unauthorized());
  if (u.role !== 'manager') return next(Errors.forbidden());
  req.user = u;
  next();
}
