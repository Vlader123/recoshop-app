import { Interaction, Recommender } from './types';

export const SEGMENTS = ['1-2', '3-5', '6-10', '11+'] as const;
export type Segment = (typeof SEGMENTS)[number];

export function splitByTime(data: Interaction[], testRatio = 0.2): { train: Interaction[]; test: Interaction[] } {
  const byUser = new Map<string, Interaction[]>();
  for (const d of data) {
    if (!byUser.has(d.userId)) byUser.set(d.userId, []);
    byUser.get(d.userId)!.push(d);
  }
  const train: Interaction[] = [];
  const test: Interaction[] = [];
  for (const list of byUser.values()) {
    list.sort((a, b) => a.ts - b.ts);
    const nTest = list.length >= 3 ? Math.max(1, Math.round(list.length * testRatio)) : 0;
    train.push(...list.slice(0, list.length - nTest));
    test.push(...list.slice(list.length - nTest));
  }
  return { train, test };
}

export function segmentOf(nTrainItems: number): Segment {
  if (nTrainItems <= 2) return '1-2';
  if (nTrainItems <= 5) return '3-5';
  if (nTrainItems <= 10) return '6-10';
  return '11+';
}

export interface SegmentMetrics {
  precision: number;
  recall: number;
  users: number;
}

export interface EvalResult extends SegmentMetrics {
  k: number;
  bySegment: Record<Segment, SegmentMetrics>;
}

export function evaluate(
  rec: Recommender,
  train: Interaction[],
  test: Interaction[],
  k: number,
  fallback?: Recommender
): EvalResult {
  const seen = new Map<string, Set<string>>();
  for (const d of train) {
    if (!seen.has(d.userId)) seen.set(d.userId, new Set());
    seen.get(d.userId)!.add(d.itemId);
  }
  const relevant = new Map<string, Set<string>>();
  for (const d of test) {
    if (seen.get(d.userId)?.has(d.itemId)) continue;
    if (!relevant.has(d.userId)) relevant.set(d.userId, new Set());
    relevant.get(d.userId)!.add(d.itemId);
  }
  const acc: Record<string, { p: number; r: number; n: number }> = { all: { p: 0, r: 0, n: 0 } };
  for (const s of SEGMENTS) acc[s] = { p: 0, r: 0, n: 0 };
  for (const [userId, rel] of relevant) {
    if (rel.size === 0) continue;
    const exclude = seen.get(userId) ?? new Set<string>();
    let list = rec.hasUser(userId) ? rec.recommend(userId, k, { exclude }) : [];
    if (list.length < k && fallback) {
      const have = new Set(list.map((l) => l.itemId));
      const extra = fallback
        .recommend(userId, k * 3, { exclude: new Set([...exclude, ...have]) })
        .slice(0, k - list.length);
      list = list.concat(extra);
    }
    const hits = list.slice(0, k).filter((x) => rel.has(x.itemId)).length;
    const p = hits / k;
    const r = hits / rel.size;
    const seg = segmentOf(exclude.size);
    for (const key of ['all', seg]) {
      acc[key].p += p;
      acc[key].r += r;
      acc[key].n += 1;
    }
  }
  const fin = (a: { p: number; r: number; n: number }): SegmentMetrics => ({
    precision: a.n ? a.p / a.n : 0,
    recall: a.n ? a.r / a.n : 0,
    users: a.n
  });
  const bySegment = {} as Record<Segment, SegmentMetrics>;
  for (const s of SEGMENTS) bySegment[s] = fin(acc[s]);
  return { k, ...fin(acc.all), bySegment };
}
