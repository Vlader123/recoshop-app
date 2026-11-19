process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://recoshop:recoshop@localhost:5432/recoshop_test';
process.env.TRAIN_IN_WORKER = 'false';
process.env.JWT_SECRET = 'test-secret';
process.env.KAFKA_BROKERS = '';
