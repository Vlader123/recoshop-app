import { evaluate, segmentOf, splitByTime } from '../src/recsys/evaluator';
import { ItemBasedCF } from '../src/recsys/itemCF';
import { MatrixFactorization } from '../src/recsys/mf';
import { PopularityRecommender } from '../src/recsys/popularity';
import { InteractionMatrix } from '../src/recsys/sparse';
import { Interaction } from '../src/recsys/types';
import { UserBasedCF } from '../src/recsys/userCF';
import { restoreRecommender } from '../src/recsys/factory';

function clusters(): Interaction[] {
  const data: Interaction[] = [];
  let ts = 1;
  for (let u = 0; u < 20; u++) {
    const group = u % 2 === 0 ? 'A' : 'B';
    for (let i = 1; i <= 5; i++) {
      if ((u + i) % 5 === 0) continue;
      data.push({ userId: `u${u}`, itemId: `${group}${i}`, weight: 3, ts: ts++ });
    }
  }
  return data;
}

describe('InteractionMatrix', () => {
  it('сумує повторні взаємодії та обмежує вагу', () => {
    const m = InteractionMatrix.build([
      { userId: 'u', itemId: 'i', weight: 1, ts: 1 },
      { userId: 'u', itemId: 'i', weight: 3, ts: 2 },
      { userId: 'u', itemId: 'j', weight: 20, ts: 3 }
    ]);
    expect(m.nUsers).toBe(1);
    expect(m.nItems).toBe(2);
    expect(m.weight(0, m.itemIndex.get('i')!)).toBe(4);
    expect(m.weight(0, m.itemIndex.get('j')!)).toBe(10);
  });
});

describe.each([
  ['item_cf', () => new ItemBasedCF()],
  ['user_cf', () => new UserBasedCF()],
  ['mf', () => new MatrixFactorization({ factors: 4, lambda: 1, alpha: 5, iterations: 15 })]
])('%s', (name, make) => {
  const data = clusters();
  const rec = make();
  rec.train(data);

  it('рекомендує товари зі «смаку» користувача та не повторює побачене', () => {
    const list = rec.recommend('u0', 3);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].itemId).toBe('A5');
    expect(list.every((l) => !l.itemId.startsWith('B') || l.score <= list[0].score)).toBe(true);
    const seen = new Set(data.filter((d) => d.userId === 'u0').map((d) => d.itemId));
    expect(list.every((l) => !seen.has(l.itemId))).toBe(true);
  });

  it('поважає множину exclude', () => {
    const list = rec.recommend('u0', 5, { exclude: new Set(['A5']) });
    expect(list.find((l) => l.itemId === 'A5')).toBeUndefined();
  });

  it('повертає порожній список для невідомого користувача', () => {
    expect(rec.recommend('nobody', 5)).toEqual([]);
    expect(rec.hasUser('nobody')).toBe(false);
  });

  it('знаходить схожі товари з того ж «смаку»', () => {
    const sim = rec.similarItems('A1', 2);
    expect(sim.length).toBe(2);
    expect(sim.every((s) => s.itemId.startsWith('A'))).toBe(true);
  });

  it('відновлюється зі знімка (передача з worker-потоку)', () => {
    const copy = restoreRecommender(name as any, structuredClone(rec.snapshot()));
    expect(copy.recommend('u0', 3).map((x) => x.itemId)).toEqual(rec.recommend('u0', 3).map((x) => x.itemId));
  });

  it('додає причину рекомендації', () => {
    const [first] = rec.recommend('u0', 1);
    expect(['viewed', 'together', 'similar-users', 'taste']).toContain(first.reason.type);
  });
});

describe('PopularityRecommender (холодний старт)', () => {
  const items = [
    { id: 'x', category: '1', rating: 4 },
    { id: 'y', category: '2', rating: 4 },
    { id: 'z', category: '2', rating: 4 }
  ];
  const pop = new PopularityRecommender(items);
  pop.train([
    { userId: 'a', itemId: 'x', weight: 10, ts: 1 },
    { userId: 'b', itemId: 'y', weight: 3, ts: 2 },
    { userId: 'c', itemId: 'z', weight: 1, ts: 3 }
  ]);

  it('впорядковує за популярністю без історії користувача', () => {
    expect(pop.recommend('new', 3).map((r) => r.itemId)).toEqual(['x', 'y', 'z']);
  });

  it('враховує уподобані категорії', () => {
    const r = pop.recommend('new', 3, { categoryWeights: new Map([['2', 10]]) });
    expect(r[0].itemId).toBe('y');
    expect(r[0].reason.type).toBe('category');
  });
});

describe('evaluator', () => {
  it('ділить дані за часом і не залишає тест без навчальної частини', () => {
    const { train, test } = splitByTime(clusters(), 0.2);
    expect(test.length).toBeGreaterThan(0);
    const lastTrain = Math.max(...train.filter((d) => d.userId === 'u0').map((d) => d.ts));
    const firstTest = Math.min(...test.filter((d) => d.userId === 'u0').map((d) => d.ts));
    expect(lastTrain).toBeLessThan(firstTest);
  });

  it('визначає сегмент історії', () => {
    expect([segmentOf(1), segmentOf(4), segmentOf(8), segmentOf(30)]).toEqual(['1-2', '3-5', '6-10', '11+']);
  });

  it('рахує precision@k та recall@k у межах [0, 1]', () => {
    const { train, test } = splitByTime(clusters(), 0.25);
    const rec = new ItemBasedCF();
    rec.train(train);
    const r = evaluate(rec, train, test, 3);
    expect(r.precision).toBeGreaterThan(0);
    expect(r.precision).toBeLessThanOrEqual(1);
    expect(r.recall).toBeGreaterThan(0);
    expect(r.recall).toBeLessThanOrEqual(1);
  });

  it('алгоритм з урахуванням смаків перевершує випадкову «зворотну» рекомендацію', () => {
    const { train, test } = splitByTime(clusters(), 0.25);
    const good = new ItemBasedCF();
    good.train(train);
    const bad = { ...good, hasUser: () => true, recommend: () => [{ itemId: 'nothing', score: 1, reason: { type: 'popular' as const } }] } as any;
    expect(evaluate(good, train, test, 3).precision).toBeGreaterThan(evaluate(bad, train, test, 3).precision);
  });
});
