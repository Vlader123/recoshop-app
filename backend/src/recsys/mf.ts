import { InteractionMatrix, SparseRow } from './sparse';
import { Interaction, Recommender, RecommendOptions, ScoredItem } from './types';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solve(A: Float64Array, b: Float64Array, f: number): Float64Array {
  const M = new Float64Array(A);
  const x = new Float64Array(b);
  for (let c = 0; c < f; c++) {
    let p = c;
    for (let r = c + 1; r < f; r++) if (Math.abs(M[r * f + c]) > Math.abs(M[p * f + c])) p = r;
    if (p !== c) {
      for (let k = 0; k < f; k++) {
        const t = M[c * f + k];
        M[c * f + k] = M[p * f + k];
        M[p * f + k] = t;
      }
      const t = x[c];
      x[c] = x[p];
      x[p] = t;
    }
    const d = M[c * f + c] || 1e-9;
    for (let r = c + 1; r < f; r++) {
      const m = M[r * f + c] / d;
      if (m === 0) continue;
      for (let k = c; k < f; k++) M[r * f + k] -= m * M[c * f + k];
      x[r] -= m * x[c];
    }
  }
  for (let r = f - 1; r >= 0; r--) {
    let s = x[r];
    for (let k = r + 1; k < f; k++) s -= M[r * f + k] * x[k];
    x[r] = s / (M[r * f + r] || 1e-9);
  }
  return x;
}

export interface MFParams {
  factors: number;
  lambda: number;
  alpha: number;
  iterations: number;
  seed: number;
}

export class MatrixFactorization implements Recommender {
  readonly name = 'mf';
  matrix = new InteractionMatrix();
  U: Float64Array = new Float64Array(0);
  V: Float64Array = new Float64Array(0);
  params: MFParams;

  constructor(params: Partial<MFParams> = {}) {
    this.params = { factors: 8, lambda: 20, alpha: 2, iterations: 12, seed: 42, ...params };
  }

  train(data: Interaction[]): void {
    const m = (this.matrix = InteractionMatrix.build(data));
    const { factors: f, iterations } = this.params;
    const rand = rng(this.params.seed);
    this.U = new Float64Array(m.nUsers * f).map(() => (rand() - 0.5) * 0.1);
    this.V = new Float64Array(m.nItems * f).map(() => (rand() - 0.5) * 0.1);
    for (let it = 0; it < iterations; it++) {
      this.U = this.updateSide(this.V, m.rows, m.nUsers);
      this.V = this.updateSide(this.U, m.cols, m.nItems);
    }
  }

  private updateSide(Y: Float64Array, rows: SparseRow[], n: number): Float64Array {
    const { factors: f, lambda, alpha } = this.params;
    const nY = Y.length / f;
    const YtY = new Float64Array(f * f);
    for (let j = 0; j < nY; j++)
      for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) YtY[a * f + b] += Y[j * f + a] * Y[j * f + b];
    const X = new Float64Array(n * f);
    for (let r = 0; r < n; r++) {
      const A = new Float64Array(YtY);
      for (let a = 0; a < f; a++) A[a * f + a] += lambda;
      const b = new Float64Array(f);
      const row = rows[r];
      for (let p = 0; p < row.idx.length; p++) {
        const j = row.idx[p];
        const c = 1 + alpha * row.val[p];
        for (let a = 0; a < f; a++) {
          const ya = Y[j * f + a];
          b[a] += c * ya;
          for (let bb = 0; bb < f; bb++) A[a * f + bb] += (c - 1) * ya * Y[j * f + bb];
        }
      }
      X.set(solve(A, b, f), r * f);
    }
    return X;
  }

  hasUser(userId: string): boolean {
    return this.matrix.userIndex.has(userId);
  }

  private cosine(i: number, j: number): number {
    const f = this.params.factors;
    let d = 0,
      a = 0,
      b = 0;
    for (let k = 0; k < f; k++) {
      d += this.V[i * f + k] * this.V[j * f + k];
      a += this.V[i * f + k] ** 2;
      b += this.V[j * f + k] ** 2;
    }
    return d / (Math.sqrt(a * b) || 1);
  }

  recommend(userId: string, k: number, opts: RecommendOptions = {}): ScoredItem[] {
    const m = this.matrix;
    const u = m.userIndex.get(userId);
    if (u === undefined) return [];
    const f = this.params.factors;
    const seen = new Set(m.rows[u].idx);
    const out: ScoredItem[] = [];
    for (let i = 0; i < m.nItems; i++) {
      const id = m.itemIds[i];
      if (seen.has(i) || opts.exclude?.has(id)) continue;
      let s = 0;
      for (let a = 0; a < f; a++) s += this.U[u * f + a] * this.V[i * f + a];
      out.push({ itemId: id, score: s, reason: { type: 'taste' } });
    }
    const top = out.sort((a, b) => b.score - a.score).slice(0, k);
    for (const t of top) {
      const i = m.itemIndex.get(t.itemId)!;
      let best = -1,
        bestSim = -2;
      for (const j of m.rows[u].idx) {
        const s = this.cosine(i, j);
        if (s > bestSim) {
          bestSim = s;
          best = j;
        }
      }
      if (best >= 0) t.reason = { type: 'taste', anchorItemId: m.itemIds[best] };
    }
    return top;
  }

  similarItems(itemId: string, k: number) {
    const m = this.matrix;
    const i = m.itemIndex.get(itemId);
    if (i === undefined) return [];
    const out: { itemId: string; score: number }[] = [];
    for (let j = 0; j < m.nItems; j++) if (j !== i) out.push({ itemId: m.itemIds[j], score: this.cosine(i, j) });
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }

  snapshot() {
    return { matrix: this.matrix.snapshot(), U: this.U, V: this.V, params: this.params };
  }

  static restore(s: any): MatrixFactorization {
    const r = new MatrixFactorization(s.params);
    r.matrix = InteractionMatrix.restore(s.matrix);
    r.U = s.U;
    r.V = s.V;
    return r;
  }
}
