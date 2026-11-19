import { query, tx } from '../db';

export const EVENT_WEIGHTS = { view: 1, select: 3 } as const;
export type EventType = keyof typeof EVENT_WEIGHTS;

export interface UserEvent {
  userId: string;
  productId: string;
  type: EventType;
  recommendationId?: number;
  ts?: string;
}

export async function persistEvent(e: UserEvent): Promise<void> {
  await tx(async (c) => {
    await c.query(
      `INSERT INTO interactions (user_id, product_id, event_type, weight, created_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))`,
      [e.userId, e.productId, e.type, EVENT_WEIGHTS[e.type], e.ts ?? null]
    );
    if (e.recommendationId) {
      await c.query('UPDATE recommendations SET clicked = true WHERE id = $1 AND user_id = $2', [
        e.recommendationId,
        e.userId
      ]);
    }
    await updateProfile(c.query.bind(c), e.userId);
    await c.query('UPDATE recommendations SET stale = true WHERE user_id = $1 AND NOT stale', [e.userId]);
  });
}

type Q = (text: string, params?: unknown[]) => Promise<any>;

export async function updateProfile(q: Q, userId: string): Promise<void> {
  await q(
    `INSERT INTO user_profiles (user_id, top_categories, interactions_count, updated_at)
     SELECT $1,
            COALESCE(jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'weight', t.w) ORDER BY t.w DESC), '[]'::jsonb),
            (SELECT count(*)::int FROM interactions WHERE user_id = $1),
            now()
     FROM (SELECT c.slug, c.name, sum(i.weight)::int AS w
           FROM interactions i JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id
           WHERE i.user_id = $1 GROUP BY c.slug, c.name ORDER BY w DESC LIMIT 5) t
     ON CONFLICT (user_id) DO UPDATE
       SET top_categories = EXCLUDED.top_categories,
           interactions_count = EXCLUDED.interactions_count,
           updated_at = now()`,
    [userId]
  );
}

export async function refreshProfile(userId: string) {
  await updateProfile((t, p) => query(t, p), userId);
}
