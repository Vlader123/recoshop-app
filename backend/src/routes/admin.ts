import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { query, queryOne, tx } from '../db';
import { refreshProfile } from '../events/handler';
import { requireManager } from '../middleware/auth';
import { Errors, wrap } from '../middleware/errors';
import { getAnalytics } from '../services/analytics';
import { getProduct } from '../services/catalog';
import { createExperiment, listExperiments, stopExperiment } from '../services/experiments';
import { evaluateOffline, trainAll, trainState } from '../services/trainer';
import { AB_ALGORITHMS } from '../recsys/factory';

export const adminRouter = Router();
adminRouter.use(requireManager);

adminRouter.get(
  '/analytics',
  wrap(async (req, res) => {
    const k = z.coerce.number().int().min(1).max(50).default(config.evalK).parse(req.query.k);
    res.json(await getAnalytics(k));
  })
);

adminRouter.post(
  '/train',
  wrap(async (_req, res) => {
    if (trainState.running) throw Errors.trainingInProgress();
    trainAll({ evaluate: true }).catch((e) => console.error('[train] помилка:', e.message));
    res.status(202).json({ status: 'started' });
  })
);

adminRouter.post(
  '/evaluate',
  wrap(async (_req, res) => {
    await evaluateOffline();
    res.json({ status: 'done' });
  })
);

adminRouter.get('/train/status', (_req, res) => res.json(trainState));

adminRouter.get('/experiments', wrap(async (_req, res) => res.json(await listExperiments())));

adminRouter.post(
  '/experiments',
  wrap(async (req, res) => {
    const alg = z.enum(AB_ALGORITHMS as [string, ...string[]]);
    const body = z
      .object({ name: z.string().trim().max(100).optional(), algorithmA: alg, algorithmB: alg, trafficSplit: z.coerce.number().int().min(1).max(99).default(50) })
      .parse(req.body);
    res.status(201).json(await createExperiment(body as any));
  })
);

adminRouter.post(
  '/experiments/:id/stop',
  wrap(async (req, res) => {
    await stopExperiment(z.coerce.number().int().parse(req.params.id));
    res.json({ status: 'stopped' });
  })
);

const productSchema = z.object({
  categoryId: z.coerce.number().int(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  price: z.coerce.number().min(0),
  oldPrice: z.coerce.number().min(0).optional().nullable(),
  rating: z.coerce.number().min(0).max(5).default(0),
  reviewsCount: z.coerce.number().int().min(0).default(0),
  badge: z.string().trim().max(20).optional().nullable(),
  imageUrl: z.string().trim().url().max(500).optional().nullable(),
  gradient: z.coerce.number().int().min(0).max(7).default(0)
});

adminRouter.post(
  '/products',
  wrap(async (req, res) => {
    const b = productSchema.parse(req.body);
    if (!(await queryOne('SELECT 1 FROM categories WHERE id = $1', [b.categoryId]))) throw Errors.notFound('Категорію');
    const row = await queryOne(
      `INSERT INTO products (category_id, title, description, price, old_price, rating, reviews_count, badge, image_url, gradient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [b.categoryId, b.title, b.description ?? null, b.price, b.oldPrice ?? null, b.rating, b.reviewsCount, b.badge ?? null, b.imageUrl ?? null, b.gradient]
    );
    res.status(201).json(await getProduct(row!.id));
  })
);

adminRouter.put(
  '/products/:id',
  wrap(async (req, res) => {
    const b = productSchema.parse(req.body);
    const row = await queryOne(
      `UPDATE products SET category_id=$2, title=$3, description=$4, price=$5, old_price=$6, rating=$7,
         reviews_count=$8, badge=$9, image_url=$10, gradient=$11 WHERE id=$1 RETURNING id`,
      [req.params.id, b.categoryId, b.title, b.description ?? null, b.price, b.oldPrice ?? null, b.rating, b.reviewsCount, b.badge ?? null, b.imageUrl ?? null, b.gradient]
    ).catch(() => null);
    if (!row) throw Errors.notFound('Товар');
    res.json(await getProduct(row.id));
  })
);

const importSchema = z.object({ csv: z.string().min(1).max(10_000_000) });
const MAX_ROWS = 100_000;

adminRouter.post(
  '/import',
  wrap(async (req, res) => {
    const { csv } = importSchema.parse(req.body);
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = lines[0]?.split(',').map((h) => h.trim().toLowerCase());
    if (!header || !['user', 'product', 'event_type'].every((h) => header.includes(h)))
      throw Errors.importFormat({ expectedHeader: 'user,product,event_type[,timestamp]' });
    if (lines.length - 1 > MAX_ROWS) throw Errors.importFormat({ maxRows: MAX_ROWS });
    const col = (name: string) => header.indexOf(name);

    const products = await query<{ id: string; title: string }>('SELECT id, title FROM products');
    const byKey = new Map<string, string>();
    for (const p of products) {
      byKey.set(p.id, p.id);
      byKey.set(p.title.toLowerCase(), p.id);
    }
    const dummyHash = await bcrypt.hash(Math.random().toString(36), 4);
    const errors: string[] = [];
    const rows: { email: string; product: string; type: string; ts: string | null }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',').map((x) => x.trim());
      const email = c[col('user')]?.toLowerCase();
      const product = byKey.get((c[col('product')] ?? '').toLowerCase());
      const type = c[col('event_type')];
      const ts = col('timestamp') >= 0 && c[col('timestamp')] ? c[col('timestamp')] : null;
      if (!email || !/^\S+@\S+$/.test(email)) errors.push(`Рядок ${i + 1}: некоректний користувач`);
      else if (!product) errors.push(`Рядок ${i + 1}: невідомий товар`);
      else if (type !== 'view' && type !== 'select') errors.push(`Рядок ${i + 1}: event_type має бути view або select`);
      else if (ts && Number.isNaN(Date.parse(ts))) errors.push(`Рядок ${i + 1}: некоректна дата`);
      else rows.push({ email, product, type, ts });
    }
    const emails = [...new Set(rows.map((r) => r.email))];
    await tx(async (c) => {
      if (emails.length)
        await c.query(
          `INSERT INTO users (email, password_hash, name) SELECT e, $2, split_part(e,'@',1) FROM unnest($1::text[]) e ON CONFLICT (email) DO NOTHING`,
          [emails, dummyHash]
        );
      if (rows.length)
        await c.query(
          `INSERT INTO interactions (user_id, product_id, event_type, weight, created_at)
           SELECT u.id, r.product::uuid, r.type, CASE r.type WHEN 'select' THEN 3 ELSE 1 END, COALESCE(r.ts::timestamptz, now())
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS r(email, product, type, ts)
           JOIN users u ON u.email = r.email`,
          [rows.map((r) => r.email), rows.map((r) => r.product), rows.map((r) => r.type), rows.map((r) => r.ts)]
        );
    });
    for (const email of emails.slice(0, 500)) {
      const u = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
      if (u) await refreshProfile(u.id);
    }
    if (!rows.length && errors.length) throw Errors.importFormat({ errors: errors.slice(0, 20) });
    res.status(202).json({ imported: rows.length, skipped: errors.length, errors: errors.slice(0, 20), hint: 'Запустіть навчання моделей, щоб врахувати нові дані' });
  })
);


const reportRow = (r: any) => ({
  id: Number(r.id), kind: r.kind, title: r.title, message: r.message, page: r.page, status: r.status,
  adminNote: r.admin_note, author: r.author_email ?? null, handledBy: r.handler_email ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at
});

adminRouter.get(
  '/site-reports',
  wrap(async (req, res) => {
    const q = z
      .object({
        status: z.enum(['new', 'in_progress', 'resolved', 'dismissed']).optional(),
        kind: z.enum(['complaint', 'bug']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
      })
      .parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status) { params.push(q.status); where.push(`r.status = $${params.length}`); }
    if (q.kind) { params.push(q.kind); where.push(`r.kind = $${params.length}`); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = await queryOne(`SELECT count(*)::int AS n FROM site_reports r ${w}`, params);
    const items = await query(
      `SELECT r.*, u.email AS author_email, h.email AS handler_email
       FROM site_reports r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN users h ON h.id = r.handled_by
       ${w} ORDER BY r.created_at DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      params
    );
    res.json({ total: total!.n, page: q.page, items: items.map(reportRow) });
  })
);

adminRouter.patch(
  '/site-reports/:id',
  wrap(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const b = z
      .object({ status: z.enum(['new', 'in_progress', 'resolved', 'dismissed']).optional(), adminNote: z.string().trim().max(4000).optional() })
      .refine((v) => v.status !== undefined || v.adminNote !== undefined, 'Потрібно вказати status або adminNote')
      .parse(req.body);
    const row = await queryOne(
      `UPDATE site_reports SET status = COALESCE($2, status), admin_note = COALESCE($3, admin_note), handled_by = $4, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [id, b.status ?? null, b.adminNote ?? null, req.user!.id]
    );
    if (!row) throw Errors.notFound('Звернення');
    const full = await queryOne(
      `SELECT r.*, u.email AS author_email, h.email AS handler_email FROM site_reports r
       LEFT JOIN users u ON u.id = r.user_id LEFT JOIN users h ON h.id = r.handled_by WHERE r.id = $1`,
      [id]
    );
    res.json(reportRow(full));
  })
);
