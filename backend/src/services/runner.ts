import path from 'path';
import { Worker } from 'worker_threads';
import { config } from '../config';
import { runTask, Task, TaskResult } from './tasks';

export function runHeavy(task: Task): Promise<TaskResult> {
  if (!config.trainInWorker) return Promise.resolve(runTask(task));
  return new Promise((resolve, reject) => {
    const isTs = __filename.endsWith('.ts');
    const file = path.join(__dirname, isTs ? 'trainWorker.ts' : 'trainWorker.js');
    const worker = new Worker(file, { workerData: task, execArgv: isTs ? ['--import', 'tsx'] : [] });
    worker.once('message', (m: { ok: boolean; result?: TaskResult; error?: string }) =>
      m.ok ? resolve(m.result!) : reject(new Error(m.error))
    );
    worker.once('error', reject);
    worker.once('exit', (code) => code !== 0 && reject(new Error(`worker exited with code ${code}`)));
  });
}
