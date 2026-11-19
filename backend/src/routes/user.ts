import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { getPublisher } from '../events/publisher';
import { refreshProfile } from '../events/handler';
import { requireAuth } from '../middleware/auth';
import { Errors, wrap } from '../middleware/errors';
import { getProductsByIds } from '../services/catalog';

export const userRouter = Router();
userRouter.use(['/events', '/cart', '/favorites', '/recommendations', '/recently-viewed', '/profile'], requireAuth);

const uuid = z.string().uuid('Некоректний ідентифікатор товару');

async function assertProduct(id: string) {
  if (!(await queryOne('SELECT 1 FROM products WHERE id = $1', [id]))) throw Errors.notFound('Товар');
}

const eventSchema = z.object({
  productId: uuid,
  type: z.enum(['view', 'select']),
  recommendationId: z.coerce.number().int().positive().optional()
});

userRouter.post(
  '/events',
  wrap(async (req, res) => {
    const body = eventSchema.parse(req.body);
    await assertProduct(body.productId);
    await getPublisher().publish({ userId: req.user!.id, ...body });
    res.status(202).json({ status: 'accepted' });
  })
);

async function cartPayload(userId: string) {
  const rows = await query<{ product_id: string; quantity: number }>(
    'SELECT product_id, quantity FROM cart_items WHERE user_id = $1 ORDER BY added_at DESC',
    [userId]
  );
  const products = await getProductsByIds(rows.map((r) => r.product_id), userId);
  const items = rows.filter((r) => products.has(r.product_id)).map((r) => ({ quantity: r.quantity, product: products.get(r.product_id)! }));
  return {
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    total: Math.round(items.reduce((s, i) => s + i.quantity * i.product.price, 0) * 100) / 100
  };
}

userRouter.get('/cart', wrap(async (req, res) => res.json(await cartPayload(req.user!.id))));

userRouter.post(
  '/cart',
  wrap(async (req, res) => {
    const body = z.object({ productId: uuid, quantity: z.coerce.number().int().min(1).max(20).default(1) }).parse(req.body);
    await assertProduct(body.productId);
    await query(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = LEAST(20, cart_items.quantity + EXCLUDED.quantity)`,
      [req.user!.id, body.productId, body.quantity]
    );
    await getPublisher().publish({ userId: req.user!.id, productId: body.productId, type: 'select' });
    res.status(201).json(await cartPayload(req.user!.id));
  })
);

userRouter.patch(
  '/cart/:productId',
  wrap(async (req, res) => {
    const productId = uuid.parse(req.params.productId);
    const { quantity } = z.object({ quantity: z.coerce.number().int().min(1).max(20) }).parse(req.body);
    const r = await query('UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND product_id = $2 RETURNING id', [req.user!.id, productId, quantity]);
    if (!r.length) throw Errors.notFound('Позицію кошика');
    res.json(await cartPayload(req.user!.id));
  })
);

userRouter.delete(
  '/cart/:productId',
  wrap(async (req, res) => {
    const productId = uuid.parse(req.params.productId);
    await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user!.id, productId]);
    res.json(await cartPayload(req.user!.id));
  })
);

userRouter.get(
  '/favorites',
  wrap(async (req, res) => {
    const rows = await query<{ product_id: string }>('SELECT product_id FROM favorites WHERE user_id = $1 ORDER BY added_at DESC', [req.user!.id]);
    const products = await getProductsByIds(rows.map((r) => r.product_id), req.user!.id);
    res.json(rows.filter((r) => products.has(r.product_id)).map((r) => products.get(r.product_id)));
  })
);

userRouter.post(
  '/favorites/:productId',
  wrap(async (req, res) => {
    const productId = uuid.parse(req.params.productId);
    await assertProduct(productId);
    const ins = await query(
      'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING product_id',
      [req.user!.id, productId]
    );
    if (ins.length) await getPublisher().publish({ userId: req.user!.id, productId, type: 'select' });
    res.status(201).json({ favorite: true });
  })
);

userRouter.delete(
  '/favorites/:productId',
  wrap(async (req, res) => {
    await query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [req.user!.id, uuid.parse(req.params.productId)]);
    res.json({ favorite: false });
  })
);

userRouter.get(
  '/profile',
  wrap(async (req, res) => {
    const user = await queryOne('SELECT id, email, name, role, ab_group FROM users WHERE id = $1', [req.user!.id]);
    if (!user) throw Errors.unauthorized();
    const profile = await queryOne('SELECT top_categories, interactions_count, updated_at FROM user_profiles WHERE user_id = $1', [user.id]);
    const counts = await queryOne(
      `SELECT (SELECT count(*)::int FROM favorites WHERE user_id = $1) AS favorites,
              (SELECT count(*)::int FROM cart_items WHERE user_id = $1) AS cart,
              (SELECT count(DISTINCT product_id)::int FROM interactions WHERE user_id = $1) AS viewed`,
      [user.id]
    );
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, group: user.ab_group },
      profile: {
        topCategories: profile?.top_categories ?? [],
        interactionsCount: profile?.interactions_count ?? 0,
        updatedAt: profile?.updated_at ?? null
      },
      counts
    });
  })
);

userRouter.delete(
  '/profile/history',
  wrap(async (req, res) => {
    const id = req.user!.id;
    await query('DELETE FROM interactions WHERE user_id = $1', [id]);
    await query('DELETE FROM recommendations WHERE user_id = $1', [id]);
    await refreshProfile(id);
    res.status(204).end();
  })
);
