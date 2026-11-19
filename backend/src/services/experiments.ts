import { query, queryOne } from '../db';
import { AppError, Errors } from '../middleware/errors';
import { AB_ALGORITHMS, Algorithm } from '../recsys/factory';
import { modelStore } from './modelStore';

export interface ExperimentDto {
  id: number;
  name: string;
  algorithmA: Algorithm;
  algorithmB: Algorithm;
  modelAId: number;
  modelBId: number;
  trafficSplit: number;
  status: string;
  startedAt: string;
}

const SELECT = `SELECT e.id, e.name, e.model_a_id, e.model_b_id, e.traffic_split, e.status, e.started_at,
  ma.algorithm AS alg_a, mb.algorithm AS alg_b
  FROM experiments e JOIN models ma ON ma.id = e.model_a_id JOIN models mb ON mb.id = e.model_b_id`;

const map = (r: any): ExperimentDto => ({
  id: r.id,
  name: r.name,
  algorithmA: r.alg_a,
  algorithmB: r.alg_b,
  modelAId: r.model_a_id,
  modelBId: r.model_b_id,
  trafficSplit: r.traffic_split,
  status: r.status,
  startedAt: r.started_at
});

export async function listExperiments(): Promise<ExperimentDto[]> {
  return (await query(`${SELECT} ORDER BY e.id DESC`)).map(map);
}

export async function getActiveExperiment(): Promise<ExperimentDto | null> {
  const r = await queryOne(`${SELECT} WHERE e.status = 'active' ORDER BY e.id DESC LIMIT 1`);
  return r ? map(r) : null;
}

export async function createExperiment(input: {
  name?: string;
  algorithmA: Algorithm;
  algorithmB: Algorithm;
  trafficSplit: number;
}): Promise<ExperimentDto> {
  if (await getActiveExperiment()) throw Errors.experimentActive();
  if (input.algorithmA === input.algorithmB)
    throw new AppError(400, 'VALIDATION_ERROR', 'Алгоритми A і B мають бути різними');
  const a = modelStore.get(input.algorithmA);
  const b = modelStore.get(input.algorithmB);
  if (!a || !b) throw new AppError(409, 'MODEL_NOT_READY', 'Моделі ще не навчені. Запустіть навчання.');
  const row = await queryOne(
    `INSERT INTO experiments (name, model_a_id, model_b_id, traffic_split) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.name ?? `${input.algorithmA} vs ${input.algorithmB}`, a.modelId, b.modelId, input.trafficSplit]
  );
  await query('UPDATE users SET ab_group = NULL');
  return (await listExperiments()).find((e) => e.id === row!.id)!;
}

export async function stopExperiment(id: number): Promise<void> {
  const r = await queryOne(`UPDATE experiments SET status = 'stopped' WHERE id = $1 RETURNING id`, [id]);
  if (!r) throw Errors.notFound('Експеримент');
}

export async function ensureDefaultExperiment(): Promise<void> {
  const any = await queryOne('SELECT 1 FROM experiments LIMIT 1');
  if (any || !modelStore.has('item_cf') || !modelStore.has('mf')) return;
  await createExperiment({ name: 'Item-CF проти матричної факторизації', algorithmA: 'item_cf', algorithmB: 'mf', trafficSplit: 50 });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Assignment {
  algorithm: Algorithm;
  group: 'A' | 'B' | null;
  experimentId: number | null;
}

export async function resolveForUser(userId: string): Promise<Assignment> {
  const exp = await getActiveExperiment();
  if (!exp) return { algorithm: 'item_cf', group: null, experimentId: null };
  let group = (await queryOne<{ ab_group: 'A' | 'B' | null }>('SELECT ab_group FROM users WHERE id = $1', [userId]))?.ab_group ?? null;
  if (!group) {
    group = hash(userId) % 100 < exp.trafficSplit ? 'B' : 'A';
    await query('UPDATE users SET ab_group = $2 WHERE id = $1', [userId, group]);
  }
  return { algorithm: group === 'A' ? exp.algorithmA : exp.algorithmB, group, experimentId: exp.id };
}

export const SELECTABLE_ALGORITHMS = AB_ALGORITHMS;
