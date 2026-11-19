import { query, tx } from '../db';
import { config } from '../config';
import { Errors } from '../middleware/errors';
import { ALGORITHMS, Algorithm, restoreRecommender } from '../recsys/factory';
import { Interaction, ItemInfo } from '../recsys/types';
import { ensureDefaultExperiment } from './experiments';
import { modelStore } from './modelStore';
import { runHeavy } from './runner';
import { TaskResult } from './tasks';

export const trainState = {
  running: false,
  startedAt: null as string | null,
  finishedAt: null as string | null,
  error: null as string | null,
  trainedModels: [] as { algorithm: string; modelId: number; ms: number }[]
};

export async function loadInteractions(): Promise<Interaction[]> {
  const rows = await query(
    `SELECT user_id, product_id, weight, (extract(epoch from created_at) * 1000)::float8 AS ts FROM interactions`
  );
  return rows.map((r) => ({ userId: r.user_id, itemId: r.product_id, weight: r.weight, ts: r.ts }));
}

export async function loadItems(): Promise<ItemInfo[]> {
  const rows = await query(`SELECT id, category_id::text AS category, rating::float AS rating FROM products`);
  return rows;
}

export async function loadOrTrain(): Promise<void> {
  const hasMetrics = (await query('SELECT count(*)::int AS n FROM metrics'))[0].n > 0;
  await trainAll({ evaluate: !hasMetrics });
}

export async function trainAll(opts: { evaluate?: boolean } = {}): Promise<void> {
  if (trainState.running) throw Errors.trainingInProgress();
  trainState.running = true;
  trainState.startedAt = new Date().toISOString();
  trainState.error = null;
  trainState.trainedModels = [];
  try {
    const [interactions, items] = await Promise.all([loadInteractions(), loadItems()]);
    const results = await Promise.all(
      ALGORITHMS.map((algorithm) => runHeavy({ kind: 'train', algorithm, interactions, items }))
    );
    for (const r of results) {
      if (r.kind !== 'train') continue;
      const alg = r.algorithm as Algorithm;
      const modelId = await tx(async (c) => {
        await c.query(`UPDATE models SET status = 'retired' WHERE algorithm = $1 AND status = 'ready'`, [alg]);
        const res = await c.query(
          `INSERT INTO models (algorithm, params, trained_at, train_ms, status)
           VALUES ($1, $2, now(), $3, 'ready') RETURNING id`,
          [alg, JSON.stringify({ interactions: interactions.length }), r.ms]
        );
        return res.rows[0].id as number;
      });
      modelStore.set(alg, { recommender: restoreRecommender(alg, r.snapshot), modelId });
      trainState.trainedModels.push({ algorithm: alg, modelId, ms: r.ms });
    }
    await query(`UPDATE recommendations SET stale = true WHERE NOT stale`);
    if (opts.evaluate !== false) await evaluateOffline(interactions, items);
    await ensureDefaultExperiment();
  } catch (e) {
    trainState.error = (e as Error).message;
    throw e;
  } finally {
    trainState.running = false;
    trainState.finishedAt = new Date().toISOString();
  }
}

export async function evaluateOffline(interactions?: Interaction[], items?: ItemInfo[]): Promise<void> {
  const data = interactions ?? (await loadInteractions());
  const itemInfo = items ?? (await loadItems());
  if (data.length < 20) return;
  const res: TaskResult = await runHeavy({ kind: 'evaluate', interactions: data, items: itemInfo, k: config.evalK, testRatio: 0.2 });
  if (res.kind !== 'evaluate') return;
  await tx(async (c) => {
    for (const [algorithm, r] of Object.entries(res.results)) {
      const modelId = modelStore.get(algorithm as Algorithm)?.modelId ?? null;
      const rows: [string, string, number][] = [
        ['precision', 'all', r.precision],
        ['recall', 'all', r.recall],
        ['users', 'all', r.users]
      ];
      for (const [seg, m] of Object.entries(r.bySegment)) {
        rows.push(['precision', seg, m.precision], ['recall', seg, m.recall], ['users', seg, m.users]);
      }
      for (const [name, segment, value] of rows) {
        await c.query(
          `INSERT INTO metrics (model_id, algorithm, name, k, segment, value) VALUES ($1, $2, $3, $4, $5, $6)`,
          [modelId, algorithm, name, config.evalK, segment, value]
        );
      }
    }
  });
}
