import { Algorithm } from '../recsys/factory';
import { Recommender } from '../recsys/types';

interface Entry {
  recommender: Recommender;
  modelId: number;
}

const store = new Map<Algorithm, Entry>();

export const modelStore = {
  get: (a: Algorithm) => store.get(a),
  set: (a: Algorithm, e: Entry) => void store.set(a, e),
  has: (a: Algorithm) => store.has(a),
  clear: () => store.clear(),
  algorithms: () => [...store.keys()]
};
