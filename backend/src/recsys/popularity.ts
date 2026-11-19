import { Interaction, ItemInfo, Recommender, RecommendOptions, ScoredItem } from './types';

export class PopularityRecommender implements Recommender {
  readonly name = 'popularity';
  popularity = new Map<string, number>();
  items = new Map<string, ItemInfo>();

  constructor(items: ItemInfo[] = []) {
    this.setItems(items);
  }

  setItems(items: ItemInfo[]) {
    this.items = new Map(items.map((i) => [i.id, i]));
  }

  train(data: Interaction[]): void {
    this.popularity = new Map();
    for (const d of data) this.popularity.set(d.itemId, (this.popularity.get(d.itemId) ?? 0) + d.weight);
  }

  hasUser(): boolean {
    return true;
  }

  recommend(_userId: string, k: number, opts: RecommendOptions = {}): ScoredItem[] {
    const out: ScoredItem[] = [];
    const cw = opts.categoryWeights;
    const maxCat = cw ? Math.max(1, ...cw.values()) : 1;
    for (const item of this.items.values()) {
      if (opts.exclude?.has(item.id)) continue;
      const pop = Math.log(1 + (this.popularity.get(item.id) ?? 0));
      const catBoost = cw ? (cw.get(item.category) ?? 0) / maxCat : 0;
      const score = pop * (1 + catBoost) + item.rating * 0.2;
      out.push({
        itemId: item.id,
        score,
        reason: catBoost > 0.3 ? { type: 'category', category: item.category } : { type: 'popular' }
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }

  similarItems(itemId: string, k: number) {
    const base = this.items.get(itemId);
    if (!base) return [];
    return [...this.items.values()]
      .filter((i) => i.id !== itemId && i.category === base.category)
      .map((i) => ({ itemId: i.id, score: Math.log(1 + (this.popularity.get(i.id) ?? 0)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  snapshot() {
    return { popularity: this.popularity, items: [...this.items.values()] };
  }

  static restore(s: any): PopularityRecommender {
    const r = new PopularityRecommender(s.items);
    r.popularity = s.popularity;
    return r;
  }
}
