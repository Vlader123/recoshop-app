import { ItemBasedCF } from './itemCF';
import { MatrixFactorization } from './mf';
import { PopularityRecommender } from './popularity';
import { ItemInfo, Recommender } from './types';
import { UserBasedCF } from './userCF';

export const ALGORITHMS = ['item_cf', 'user_cf', 'mf', 'popularity'] as const;
export type Algorithm = (typeof ALGORITHMS)[number];
export const AB_ALGORITHMS: Algorithm[] = ['item_cf', 'user_cf', 'mf'];

export function createRecommender(name: Algorithm, items: ItemInfo[], params: Record<string, unknown> = {}): Recommender {
  switch (name) {
    case 'item_cf':
      return new ItemBasedCF();
    case 'user_cf':
      return new UserBasedCF();
    case 'mf':
      return new MatrixFactorization(params);
    case 'popularity':
      return new PopularityRecommender(items);
  }
}

export function restoreRecommender(name: Algorithm, snap: any): Recommender {
  switch (name) {
    case 'item_cf':
      return ItemBasedCF.restore(snap);
    case 'user_cf':
      return UserBasedCF.restore(snap);
    case 'mf':
      return MatrixFactorization.restore(snap);
    case 'popularity':
      return PopularityRecommender.restore(snap);
  }
}
