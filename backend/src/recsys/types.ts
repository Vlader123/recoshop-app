export interface Interaction {
  userId: string;
  itemId: string;
  weight: number;
  ts: number;
}

export type ReasonType = 'viewed' | 'together' | 'similar-users' | 'taste' | 'popular' | 'category';

export interface Reason {
  type: ReasonType;
  anchorItemId?: string;
  category?: string;
}

export interface ScoredItem {
  itemId: string;
  score: number;
  reason: Reason;
}

export interface RecommendOptions {
  exclude?: Set<string>;
  categoryWeights?: Map<string, number>;
  history?: Map<string, number>;
}

export interface Recommender {
  readonly name: string;
  train(data: Interaction[]): void;
  recommend(userId: string, k: number, opts?: RecommendOptions): ScoredItem[];
  similarItems(itemId: string, k: number): { itemId: string; score: number }[];
  hasUser(userId: string): boolean;
  snapshot(): unknown;
}

export interface ItemInfo {
  id: string;
  category: string;
  rating: number;
}
