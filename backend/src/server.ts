import { createApp } from './app';
import { config } from './config';
import { migrate, pool, query } from './db';
import { seedDatabase } from './seed';
import { loadOrTrain } from './services/trainer';

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      console.log(`[db] очікую PostgreSQL (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error('PostgreSQL недоступна');
}

async function main() {
  if (config.env === 'production' && config.jwtSecret === 'dev-secret-change-me') {
    console.warn('[security] Увага: JWT_SECRET має значення за замовчуванням. Змініть його у .env!');
  }
  await waitForDb();
  await migrate();
  if (config.seedOnStart) {
    const has = (await query('SELECT count(*)::int AS n FROM products'))[0].n > 0;
    if (!has) {
      console.log('[seed] база порожня — заповнюю демонстраційними даними...');
      await seedDatabase();
    }
  }
  const app = createApp();
  app.listen(config.port, () => console.log(`[api] RecoShop API: http://localhost:${config.port}  (docs: /api/docs)`));
  if (config.trainOnStart) {
    const t0 = Date.now();
    loadOrTrain()
      .then(() => console.log(`[train] моделі готові за ${Date.now() - t0} мс`))
      .catch((e) => console.error('[train] не вдалося навчити моделі:', e.message));
  }
  console.log(`[events] режим подій: ${config.kafkaBrokers.length ? 'Kafka (' + config.kafkaBrokers.join(',') + ')' : 'прямий запис у PostgreSQL'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
