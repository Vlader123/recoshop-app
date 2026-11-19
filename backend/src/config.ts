import 'dotenv/config';

const bool = (v: string | undefined, def: boolean) => (v === undefined ? def : v === 'true' || v === '1');

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://recoshop:recoshop@localhost:5432/recoshop',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  kafkaTopic: process.env.KAFKA_TOPIC ?? 'user-events',
  seedOnStart: bool(process.env.SEED_ON_START, false),
  trainOnStart: bool(process.env.TRAIN_ON_START, true),
  trainInWorker: bool(process.env.TRAIN_IN_WORKER, true),
  minInteractions: Number(process.env.MIN_INTERACTIONS ?? 5),
  recoTtlMinutes: Number(process.env.RECO_TTL_MINUTES ?? 30),
  evalK: Number(process.env.EVAL_K ?? 10)
};

export const isTest = config.env === 'test';
