import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Потрібна автентифікація'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Невірний email або пароль'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Недостатньо прав для виконання дії'),
  notFound: (what = 'Ресурс') => new AppError(404, 'NOT_FOUND', `${what} не знайдено`),
  emailTaken: () => new AppError(409, 'EMAIL_TAKEN', 'Користувач з таким email уже існує'),
  alreadySubscribed: () => new AppError(409, 'ALREADY_SUBSCRIBED', 'Цей email уже підписано на добірки'),
  experimentActive: () => new AppError(409, 'EXPERIMENT_ACTIVE', 'Активний експеримент уже існує'),
  trainingInProgress: () => new AppError(409, 'TRAINING_IN_PROGRESS', 'Навчання моделей уже виконується'),
  importFormat: (details?: unknown) =>
    new AppError(422, 'IMPORT_FORMAT_ERROR', 'Файл імпорту має неправильний формат', details)
};

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', 'Ресурс не знайдено'));
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Некоректні дані запиту',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      }
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Некоректний JSON у запиті' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Запит занадто великий' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера' } });
}

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
