import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db';
import { optionalAuth } from '../middleware/auth';
import { wrap } from '../middleware/errors';

export const reportsRouter = Router();

const reportSchema = z.object({
  kind: z.enum(['complaint', 'bug']),
  title: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(5000),
  page: z.string().trim().max(500).optional()
});

reportsRouter.post(
  '/site-reports',
  optionalAuth,
  wrap(async (req, res) => {
    const b = reportSchema.parse(req.body);
    const row = await queryOne(
      `INSERT INTO site_reports (kind, title, message, page, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, status, created_at`,
      [b.kind, b.title, b.message, b.page ?? null, req.user?.id ?? null]
    );
    res.status(201).json({ id: Number(row!.id), status: row!.status, createdAt: row!.created_at });
  })
);
