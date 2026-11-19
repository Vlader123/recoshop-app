import { Interaction } from './types';

export interface SparseRow {
  idx: number[];
  val: number[];
}

export class InteractionMatrix {
  userIds: string[] = [];
  itemIds: string[] = [];
  userIndex = new Map<string, number>();
  itemIndex = new Map<string, number>();
  rows: SparseRow[] = [];
  cols: SparseRow[] = [];

  static build(data: Interaction[], cap = 10): InteractionMatrix {
    const m = new InteractionMatrix();
    const acc = new Map<string, number>();
    for (const d of data) {
      let u = m.userIndex.get(d.userId);
      if (u === undefined) {
        u = m.userIds.length;
        m.userIds.push(d.userId);
        m.userIndex.set(d.userId, u);
      }
      let i = m.itemIndex.get(d.itemId);
      if (i === undefined) {
        i = m.itemIds.length;
        m.itemIds.push(d.itemId);
        m.itemIndex.set(d.itemId, i);
      }
      const key = u + ':' + i;
      acc.set(key, (acc.get(key) ?? 0) + d.weight);
    }
    m.rows = m.userIds.map(() => ({ idx: [], val: [] }));
    m.cols = m.itemIds.map(() => ({ idx: [], val: [] }));
    for (const [key, sum] of acc) {
      const [u, i] = key.split(':').map(Number);
      const w = Math.min(sum, cap);
      m.rows[u].idx.push(i);
      m.rows[u].val.push(w);
      m.cols[i].idx.push(u);
      m.cols[i].val.push(w);
    }
    return m;
  }

  static restore(s: any): InteractionMatrix {
    const m = new InteractionMatrix();
    m.userIds = s.userIds;
    m.itemIds = s.itemIds;
    m.rows = s.rows;
    m.cols = s.cols;
    m.userIds.forEach((id, i) => m.userIndex.set(id, i));
    m.itemIds.forEach((id, i) => m.itemIndex.set(id, i));
    return m;
  }

  snapshot() {
    return { userIds: this.userIds, itemIds: this.itemIds, rows: this.rows, cols: this.cols };
  }

  get nUsers() {
    return this.userIds.length;
  }
  get nItems() {
    return this.itemIds.length;
  }

  weight(u: number, i: number): number {
    const r = this.rows[u];
    const p = r.idx.indexOf(i);
    return p === -1 ? 0 : r.val[p];
  }
}

export function topK<T>(items: T[], k: number, score: (t: T) => number): T[] {
  return items.sort((a, b) => score(b) - score(a)).slice(0, k);
}
