import { closeDb, migrate, query } from './db';
import { seedDatabase } from './seed';
import { evaluateOffline, loadOrTrain } from './services/trainer';

const cmd = process.argv[2];

async function main() {
  await migrate();
  if (cmd === 'migrate') console.log('Міграції застосовано.');
  else if (cmd === 'seed') {
    const n = (await query('SELECT count(*)::int AS n FROM products'))[0].n;
    if (n > 0 && !process.argv.includes('--force')) console.log('База вже містить дані (додайте --force, щоб заповнити повторно).');
    else {
      await seedDatabase(process.argv.includes('--force'));
      console.log('Демонстраційні дані створено.');
    }
  } else if (cmd === 'train') {
    await loadOrTrain();
    console.log('Моделі навчено, метрики збережено.');
  } else if (cmd === 'evaluate') {
    await evaluateOffline();
    console.log('Офлайн-оцінювання виконано.');
  } else console.log('Використання: tsx src/cli.ts <migrate|seed [--force]|train|evaluate>');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
