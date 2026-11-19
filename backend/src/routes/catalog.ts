import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { wrap } from '../middleware/errors';
import { getProduct, listCategories, listProducts, popular } from '../services/catalog';
import { getForUser, recentlyViewed, similarProducts } from '../services/recommendations';

export const catalogRouter = Router();

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'rating', 'new']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  discount: z.enum(['true', 'false']).optional()
});

catalogRouter.get('/categories', wrap(async (_req, res) => res.json(await listCategories())));

catalogRouter.get(
  '/products',
  optionalAuth,
  wrap(async (req, res) => {
    const p = listSchema.parse(req.query);
    res.json(await listProducts({ ...p, onlyDiscount: p.discount === 'true' }, req.user?.id));
  })
);

catalogRouter.get(
  '/products/:id',
  optionalAuth,
  wrap(async (req, res) => res.json(await getProduct(req.params.id, req.user?.id)))
);

catalogRouter.get(
  '/products/:id/similar',
  optionalAuth,
  wrap(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(12).default(4).parse(req.query.limit);
    res.json(await similarProducts(req.params.id, limit, req.user?.id));
  })
);

catalogRouter.get(
  '/popular',
  optionalAuth,
  wrap(async (req, res) => {
    const q = z
      .object({ tab: z.enum(['hits', 'new', 'sale']).default('hits'), limit: z.coerce.number().int().min(1).max(24).default(4) })
      .parse(req.query);
    res.json(await popular(q.tab, q.limit, req.user?.id));
  })
);

catalogRouter.get(
  '/recommendations',
  requireAuth,
  wrap(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(24).default(5).parse(req.query.limit);
    res.json(await getForUser(req.user!.id, limit));
  })
);

catalogRouter.get(
  '/recently-viewed',
  requireAuth,
  wrap(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(12).default(4).parse(req.query.limit);
    res.json(await recentlyViewed(req.user!.id, limit));
  })
);
