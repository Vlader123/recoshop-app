import { InteractionMatrix } from './sparse';
import { Interaction, Recommender, RecommendOptions, ScoredItem } from './types';

export class UserBasedCF implements Recommender {
  readonly name = 'user_cf';
  matrix = new InteractionMatrix();
  private norms: number[] = [];

  constructor(private neighborCount = 30, private shrink = 3) {}

  train(data: Interaction[]): void {
    this.matrix = InteractionMatrix.build(data);
    this.computeNorms();
  }

  private computeNorms() {
    this.norms = this.matrix.rows.map((r) => Math.sqrt(r.val.reduce((s, v) => s + v * v, 0)));
  }

  hasUser(userId: string): boolean {
    return this.matrix.userIndex.has(userId);
  }

  private neighborsOf(u: number): [number, number][] {
    const m = this.matrix;
    const row = m.rows[u];
    const dot = new Map<number, number>();
    const overlap = new Map<number, number>();
    for (let p = 0; p < row.idx.length; p++) {
      const col = m.cols[row.idx[p]];
      for (let q = 0; q < col.idx.length; q++) {
        const v = col.idx[q];
        if (v === u) continue;
        dot.set(v, (dot.get(v) ?? 0) + row.val[p] * col.val[q]);
        overlap.set(v, (overlap.get(v) ?? 0) + 1);
      }
    }
    const list: [number, number][] = [];
    for (const [v, d] of dot) {
      const co = overlap.get(v)!;
      const sim = (d / (this.norms[u] * this.norms[v] || 1)) * (co / (co + this.shrink));
      if (sim > 0) list.push([v, sim]);
    }
    return list.sort((a, b) => b[1] - a[1]).slice(0, this.neighborCount);
  }

  recommend(userId: string, k: number, opts: RecommendOptions = {}): ScoredItem[] {
    const m = this.matrix;
    const u = m.userIndex.get(userId);
    if (u === undefined) return [];
    const seen = new Set(m.rows[u].idx);
    const scores = new Map<number, number>();
    for (const [v, sim] of this.neighborsOf(u)) {
      const row = m.rows[v];
      for (let p = 0; p < row.idx.length; p++) {
        const i = row.idx[p];
        if (seen.has(i)) continue;
        scores.set(i, (scores.get(i) ?? 0) + sim * row.val[p]);
      }
    }
    const out: ScoredItem[] = [];
    for (const [i, score] of scores) {
      const id = m.itemIds[i];
      if (opts.exclude?.has(id)) continue;
      out.push({ itemId: id, score, reason: { type: 'similar-users' } });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }

  similarItems(itemId: string, k: number) {
    const m = this.matrix;
    const i = m.itemIndex.get(itemId);
    if (i === undefined) return [];
    const col = m.cols[i];
    const scores = new Map<number, number>();
    for (let q = 0; q < col.idx.length; q++) {
      const row = m.rows[col.idx[q]];
      for (let p = 0; p < row.idx.length; p++) {
        if (row.idx[p] !== i) scores.set(row.idx[p], (scores.get(row.idx[p]) ?? 0) + col.val[q] * row.val[p]);
      }
    }
    return [...scores].sort((a, b) => b[1] - a[1]).slice(0, k).map(([j, s]) => ({ itemId: m.itemIds[j], score: s }));
  }

  snapshot() {
    return { matrix: this.matrix.snapshot() };
  }

  static restore(s: any): UserBasedCF {
    const r = new UserBasedCF();
    r.matrix = InteractionMatrix.restore(s.matrix);
    r.computeNorms();
    return r;
  }
}
