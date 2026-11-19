import { parentPort, workerData } from 'worker_threads';
import { runTask, Task } from './tasks';

try {
  parentPort!.postMessage({ ok: true, result: runTask(workerData as Task) });
} catch (e) {
  parentPort!.postMessage({ ok: false, error: (e as Error).message });
}
