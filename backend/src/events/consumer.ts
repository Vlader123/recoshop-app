import { Kafka } from 'kafkajs';
import { config } from '../config';
import { closeDb, migrate } from '../db';
import { persistEvent, UserEvent } from './handler';

async function main() {
  if (!config.kafkaBrokers.length) {
    console.error('KAFKA_BROKERS не задано — споживач не потрібен (події пишуться напряму в БД).');
    process.exit(1);
  }
  await migrate();
  const kafka = new Kafka({ clientId: 'recoshop-consumer', brokers: config.kafkaBrokers });
  const consumer = kafka.consumer({ groupId: 'recoshop-events' });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopic, fromBeginning: false });
  console.log(`[consumer] слухаю топік ${config.kafkaTopic} (${config.kafkaBrokers.join(',')})`);
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        await persistEvent(JSON.parse(message.value.toString()) as UserEvent);
      } catch (e) {
        console.error('[consumer] помилка обробки події:', (e as Error).message);
      }
    }
  });
  const stop = async () => {
    await consumer.disconnect();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
