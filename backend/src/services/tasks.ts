import { AB_ALGORITHMS, Algorithm, createRecommender } from '../recsys/factory';
import { EvalResult, evaluate, splitByTime } from '../recsys/evaluator';
import { Interaction, ItemInfo } from '../recsys/types';

export type Task =
  | { kind: 'train'; algorithm: Algorithm; params?: Record<string, unknown>; interactions: Interaction[]; items: ItemInfo[] }
  | { kind: 'evaluate'; interactions: Interaction[]; items: ItemInfo[]; k: number; testRatio: number };

export type TaskResult =
  | { kind: 'train'; algorithm: Algorithm; snapshot: unknown; ms: number }
  | { kind: 'evaluate'; results: Record<string, EvalResult>; trainSize: number; testSize: number };

export function runTask(task: Task): TaskResult {
  if (task.kind === 'train') {
    const t0 = Date.now();
    const rec = createRecommender(task.algorithm, task.items, task.params);
    rec.train(task.interactions);
    return { kind: 'train', algorithm: task.algorithm, snapshot: rec.snapshot(), ms: Date.now() - t0 };
  }
  const { train, test } = splitByTime(task.interactions, task.testRatio);
  const pop = createRecommender('popularity', task.items);
  pop.train(train);
  const results: Record<string, EvalResult> = {};
  for (const alg of [...AB_ALGORITHMS, 'popularity'] as Algorithm[]) {
    const rec = alg === 'popularity' ? pop : createRecommender(alg, task.items);
    if (alg !== 'popularity') rec.train(train);
    results[alg] = evaluate(rec, train, test, task.k);
  }
  return { kind: 'evaluate', results, trainSize: train.length, testSize: test.length };
}
