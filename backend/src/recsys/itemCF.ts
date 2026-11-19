import { InteractionMatrix } from './sparse';
import { Interaction, Recommender, RecommendOptions, ScoredItem } from './types';

export class ItemBasedCF implements Recommender {
  readonly name = 'item_cf';
  matrix = new InteractionMatrix();
  neighbors: [number, number][][] = [];

  constructor(private neighborsPerItem = 50, private shrink = 3) {}

  train(data: Interaction[]): void {
    const m = (this.matrix = InteractionMatrix.build(data));
    const norms = m.cols.map((c) => Math.sqrt(c.val.reduce((s, v) => s + v * v, 0)));
    const dots = m.itemIds.map(() => new Map<number, number>());
    const counts = m.itemIds.map(() => new Map<number, number>());
    for (const row of m.rows) {
      const n = Math.min(row.idx.length, 200);
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          if (a === b) continue;
          const i = row.idx[a];
          const j = row.idx[b];
          dots[i].set(j, (dots[i].get(j) ?? 0) + row.val[a] * row.val[b]);
          counts[i].set(j, (counts[i].get(j) ?? 0) + 1);
        }
      }
    }
    this.neighbors = dots.map((d, i) => {
      const list: [number, number][] = [];
      for (const [j, dot] of d) {
        const co = counts[i].get(j) ?? 1;
        const sim = (dot / (norms[i] * norms[j] || 1)) * (co / (co + this.shrink));
        list.push([j, sim]);
      }
      return list.sort((x, y) => y[1] - x[1]).slice(0, this.neighborsPerItem);
    });
  }

  hasUser(userId: string): boolean {
    return this.matrix.userIndex.has(userId);
  }

  recommend(userId: string, k: number, opts: RecommendOptions = {}): ScoredItem[] {
    const m = this.matrix;
    const hist = new Map<number, number>();
    const u = m.userIndex.get(userId);
    if (u !== undefined) {
      const row = m.rows[u];
      row.idx.forEach((j, p) => hist.set(j, row.val[p]));
    } else if (opts.history) {
      for (const [id, w] of opts.history) {
        const j = m.itemIndex.get(id);
        if (j !== undefined) hist.set(j, Math.min(w, 10));
      }
    }
    if (!hist.size) return [];
    const scores = new Map<number, number>();
    const anchor = new Map<number, { j: number; c: number }>();
    for (const [j, w] of hist) {
      for (const [i, sim] of this.neighbors[j] ?? []) {
        const c = w * sim;
        scores.set(i, (scores.get(i) ?? 0) + c);
        const a = anchor.get(i);
        if (!a || c > a.c) anchor.set(i, { j, c });
      }
    }
    const out: ScoredItem[] = [];
    for (const [i, score] of scores) {
      const id = m.itemIds[i];
      if (hist.has(i) || opts.exclude?.has(id) || score <= 0) continue;
      const a = anchor.get(i)!;
      const together = (hist.get(a.j) ?? 0) >= 3;
      out.push({
        itemId: id,
        score,
        reason: { type: together ? 'together' : 'viewed', anchorItemId: m.itemIds[a.j] }
      });
    }
    return out.sort((x, y) => y.score - x.score).slice(0, k);
  }

  similarItems(itemId: string, k: number) {
    const i = this.matrix.itemIndex.get(itemId);
    if (i === undefined) return [];
    return (this.neighbors[i] ?? []).slice(0, k).map(([j, s]) => ({ itemId: this.matrix.itemIds[j], score: s }));
  }

  snapshot() {
    return { matrix: this.matrix.snapshot(), neighbors: this.neighbors };
  }

  static restore(s: any): ItemBasedCF {
    const r = new ItemBasedCF();
    r.matrix = InteractionMatrix.restore(s.matrix);
    r.neighbors = s.neighbors;
    return r;
  }
}
