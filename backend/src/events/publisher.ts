import { Kafka, Producer } from 'kafkajs';
import { config } from '../config';
import { persistEvent, UserEvent } from './handler';

export interface EventPublisher {
  readonly mode: 'kafka' | 'db';
  publish(e: UserEvent): Promise<void>;
}

export class DbPublisher implements EventPublisher {
  readonly mode = 'db' as const;
  publish(e: UserEvent) {
    return persistEvent(e);
  }
}

export class KafkaPublisher implements EventPublisher {
  readonly mode = 'kafka' as const;
  private producer: Producer | null = null;
  private connecting: Promise<Producer> | null = null;
  private fallback = new DbPublisher();

  private async getProducer(): Promise<Producer> {
    if (this.producer) return this.producer;
    if (!this.connecting) {
      const kafka = new Kafka({ clientId: 'recoshop-api', brokers: config.kafkaBrokers, retry: { retries: 2 } });
      const p = kafka.producer({ allowAutoTopicCreation: true });
      this.connecting = p.connect().then(() => (this.producer = p));
      this.connecting.catch(() => (this.connecting = null));
    }
    return this.connecting;
  }

  async publish(e: UserEvent): Promise<void> {
    try {
      const p = await this.getProducer();
      await p.send({ topic: config.kafkaTopic, messages: [{ key: e.userId, value: JSON.stringify(e) }] });
    } catch (err) {
      console.warn('[events] Kafka недоступна, подію записано напряму в БД:', (err as Error).message);
      await this.fallback.publish(e);
    }
  }
}

let instance: EventPublisher | null = null;

export function getPublisher(): EventPublisher {
  if (!instance) instance = config.kafkaBrokers.length ? new KafkaPublisher() : new DbPublisher();
  return instance;
}
