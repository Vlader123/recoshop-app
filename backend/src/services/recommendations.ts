import { randomUUID } from 'crypto';
import { config } from '../config';
import { query, tx } from '../db';
import { Algorithm } from '../recsys/factory';
import { PopularityRecommender } from '../recsys/popularity';
import { Reason, ScoredItem } from '../recsys/types';
import { getProductsByIds, ProductDto } from './catalog';
import { resolveForUser } from './experiments';
import { modelStore } from './modelStore';

export interface RecoItem {
  id: number;
  rank: number;
  score: number;
  matchPercent: number | null;
  algorithm: string;
  reason: { type: string; text: string };
  product: ProductDto;
}

export function reasonText(r: Reason, titles: Map<string, string>, categories: Map<string, string>): string {
  const anchor = r.anchorItemId ? titles.get(r.anchorItemId) : undefined;
  switch (r.type) {
    case 'viewed':
      return anchor ? `Бо ви переглядали «${anchor}»` : 'Схоже на те, що ви переглядали';
    case 'together':
      return anchor ? `Купують разом з «${anchor}»` : 'Часто купують разом';
    case 'similar-users':
      return 'Схожі покупці обрали це';
    case 'taste':
      return anchor ? `Подібно до «${anchor}»` : 'Відповідає вашим вподобанням';
    case 'category':
      return `Популярне в категорії «${categories.get(r.category ?? '') ?? 'вашого вибору'}»`;
    default:
      return 'Хіт продажів';
  }
}

async function userContext(userId: string) {
  const seenRows = await query<{ product_id: string }>('SELECT DISTINCT product_id FROM interactions WHERE user_id = $1', [userId]);
  const cat = await query<{ category_id: string; w: number }>(
    `SELECT p.category_id::text AS category_id, sum(i.weight)::int AS w
     FROM interactions i JOIN products p ON p.id = i.product_id WHERE i.user_id = $1 GROUP BY p.category_id`,
    [userId]
  );
  const hist = await query<{ product_id: string; w: number }>(
    'SELECT product_id, sum(weight)::int AS w FROM interactions WHERE user_id = $1 GROUP BY product_id',
    [userId]
  );
  return {
    history: new Map(hist.map((r) => [r.product_id, r.w])),
    seen: new Set(seenRows.map((r) => r.product_id)),
    categoryWeights: new Map(cat.map((r) => [r.category_id, r.w]))
  };
}

async function popularFromDb(n: number, exclude: Set<string>): Promise<ScoredItem[]> {
  const rows = await query<{ id: string; w: number }>(
    `SELECT p.id, COALESCE(i.w, 0)::float AS w
       FROM products p LEFT JOIN (SELECT product_id, sum(weight) AS w FROM interactions GROUP BY product_id) i ON i.product_id = p.id
      WHERE NOT (p.id = ANY($1::uuid[]))
      ORDER BY COALESCE(i.w, 0) DESC, p.rating DESC LIMIT $2`,
    [[...exclude], n]
  );
  return rows.map((r) => ({ itemId: r.id, score: r.w, reason: { type: 'popular' as const } }));
}

async function rerankByCategory(list: ScoredItem[], weights: Map<string, number>): Promise<ScoredItem[]> {
  const max = Math.max(...weights.values(), 0);
  if (!list.length || max === 0) return list;
  const rows = await query<{ id: string; category_id: string }>(
    'SELECT id, category_id::text AS category_id FROM products WHERE id = ANY($1::uuid[])',
    [list.map((l) => l.itemId)]
  );
  const catOf = new Map(rows.map((r) => [r.id, r.category_id]));
  return list
    .map((l) => ({ ...l, score: l.score * (0.25 + 0.75 * ((weights.get(catOf.get(l.itemId) ?? '') ?? 0) / max)) }))
    .sort((a, b) => b.score - a.score);
}

async function loadCached(userId: string, limit: number): Promise<RecoItem[] | null> {
  const rows = await query(
    `SELECT r.* FROM recommendations r
     WHERE r.user_id = $1 AND NOT r.stale AND r.created_at > now() - ($2 || ' minutes')::interval
       AND r.batch_id = (SELECT batch_id FROM recommendations WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1)
     ORDER BY r.rank LIMIT $3`,
    [userId, String(config.recoTtlMinutes), limit]
  );
  if (rows.length < limit) return null;
  const products = await getProductsByIds(rows.map((r) => r.product_id), userId);
  return rows
    .filter((r) => products.has(r.product_id))
    .map((r) => ({
      id: Number(r.id),
      rank: r.rank,
      score: r.score,
      matchPercent: r.match_pct,
      algorithm: r.algorithm,
      reason: { type: r.reason_type, text: r.reason },
      product: products.get(r.product_id)!
    }));
}

export async function getForUser(userId: string, limit: number): Promise<RecoItem[]> {
  const cached = await loadCached(userId, limit);
  if (cached) return cached;

  const ctx = await userContext(userId);
  let algorithm: Algorithm = 'popularity';
  let group: 'A' | 'B' | null = null;
  let list: ScoredItem[] = [];

  const coldStart = ctx.seen.size < config.minInteractions;
  if (!coldStart) {
    const assignment = await resolveForUser(userId);
    group = assignment.group;
    let entry = modelStore.get(assignment.algorithm);
    let chosen: Algorithm = assignment.algorithm;
    if (entry && !entry.recommender.hasUser(userId)) {
      const live = modelStore.get('item_cf');
      if (live) {
        entry = live;
        chosen = 'item_cf';
      }
    }
    if (entry) {
      algorithm = chosen;
      list = entry.recommender.recommend(userId, Math.max(limit * 5, 30), { exclude: ctx.seen, history: ctx.history });
      list = await rerankByCategory(list, ctx.categoryWeights);
    }
  }

  const pop = modelStore.get('popularity');
  const popRec = pop?.recommender as PopularityRecommender | undefined;
  if (list.length < limit) {
    const have = new Set(list.map((l) => l.itemId));
    const skip = new Set([...ctx.seen, ...have]);
    const extra = popRec
      ? popRec.recommend(userId, limit - list.length, { exclude: skip, categoryWeights: ctx.categoryWeights })
      : await popularFromDb(limit - list.length, skip);
    list = list.concat(extra);
    if (!list.some((l) => l.reason.type !== 'popular' && l.reason.type !== 'category')) algorithm = 'popularity';
  }
  if (!list.length) return [];

  const anchorIds = [...new Set(list.map((l) => l.reason.anchorItemId).filter(Boolean) as string[])];
  const anchors = await getProductsByIds(anchorIds);
  const titles = new Map([...anchors].map(([id, p]) => [id, p.title]));
  const cats = new Map((await query<{ id: string; name: string }>('SELECT id::text AS id, name FROM categories')).map((c) => [c.id, c.name]));

  const maxScore = Math.max(...list.map((l) => l.score), 1e-9);
  const isCf = algorithm !== 'popularity';
  const batchId = randomUUID();
  const modelId = modelStore.get(algorithm)?.modelId ?? null;
  const stored = await tx(async (c) => {
    await c.query('UPDATE recommendations SET stale = true WHERE user_id = $1 AND NOT stale', [userId]);
    const out: { id: number; item: ScoredItem; text: string; pct: number | null }[] = [];
    let rank = 1;
    for (const item of list.slice(0, limit)) {
      const text = reasonText(item.reason, titles, cats);
      const pct = isCf && item.reason.type !== 'popular' && item.reason.type !== 'category'
        ? Math.max(1, Math.min(99, Math.round((Math.max(item.score, 0) / maxScore) * 98)))
        : null;
      const res = await c.query(
        `INSERT INTO recommendations (batch_id, user_id, product_id, model_id, algorithm, ab_group, rank, score, match_pct, reason, reason_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [batchId, userId, item.itemId, modelId, algorithm, group, rank++, item.score, pct, text, item.reason.type]
      );
      out.push({ id: Number(res.rows[0].id), item, text, pct });
    }
    return out;
  });

  const products = await getProductsByIds(stored.map((s) => s.item.itemId), userId);
  return stored
    .filter((s) => products.has(s.item.itemId))
    .map((s, idx) => ({
      id: s.id,
      rank: idx + 1,
      score: s.item.score,
      matchPercent: s.pct,
      algorithm,
      reason: { type: s.item.reason.type, text: s.text },
      product: products.get(s.item.itemId)!
    }));
}

export async function recentlyViewed(userId: string, limit: number) {
  const rows = await query<{ product_id: string }>(
    `SELECT product_id FROM interactions WHERE user_id = $1 GROUP BY product_id ORDER BY max(created_at) DESC LIMIT $2`,
    [userId, 2]
  );
  const viewedIds = rows.map((r) => r.product_id);
  const similarIds: string[] = [];
  const rec = (modelStore.get('item_cf') ?? modelStore.get('mf'))?.recommender;
  for (const id of viewedIds) {
    for (const s of rec?.similarItems(id, 6) ?? []) {
      if (!viewedIds.includes(s.itemId) && !similarIds.includes(s.itemId)) similarIds.push(s.itemId);
    }
  }
  const take = [...viewedIds.map((id) => ({ id, label: 'переглянуто' })), ...similarIds.map((id) => ({ id, label: 'схожий' }))].slice(0, limit);
  const products = await getProductsByIds(take.map((t) => t.id), userId);
  return take.filter((t) => products.has(t.id)).map((t) => ({ label: t.label, product: products.get(t.id)! }));
}

export async function similarProducts(productId: string, limit: number, userId?: string): Promise<ProductDto[]> {
  const ids = (modelStore.get('item_cf')?.recommender ?? modelStore.get('popularity')?.recommender)?.similarItems(productId, limit).map((s) => s.itemId) ?? [];
  const products = await getProductsByIds(ids, userId);
  return ids.filter((id) => products.has(id)).map((id) => products.get(id)!);
}
