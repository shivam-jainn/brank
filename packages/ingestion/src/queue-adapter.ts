/**
 * Queue Adapter
 *
 * A thin factory that returns an `EventQueue` implementation based on the
 * broker configuration supplied. This keeps the consumer / producer code
 * entirely decoupled from the broker technology.
 *
 * Supported adapters:
 *   - "memory"   — in-process queue (dev / tests / single-replica deploys)
 *   - "rabbitmq" — durable AMQP queue via `createRabbitMqEventQueue`
 *
 * Adding Kafka (future):
 *   1. Implement `createKafkaEventQueue(options)` adhering to `EventQueue`.
 *   2. Add a `"kafka"` branch here.
 *   3. No other code changes required.
 */

import { createInMemoryEventQueue, type EventQueue } from "./pipeline";
import {
  createRabbitMqEventQueue,
  type RabbitMqChannel,
  type RabbitMqEventQueueOptions,
} from "./rabbitmq";

// ---------------------------------------------------------------------------
// Adapter config types
// ---------------------------------------------------------------------------

export type MemoryQueueConfig = {
  type: "memory";
  capacity?: number;
};

export type RabbitMqQueueConfig = {
  type: "rabbitmq";
  channel: RabbitMqChannel;
  queueName?: string;
  deadLetterQueueName?: string;
  prefetch?: number;
  publishOptions?: Record<string, unknown>;
};

/**
 * Extend this union when you add a new adapter (e.g. Kafka).
 */
export type QueueAdapterConfig = MemoryQueueConfig | RabbitMqQueueConfig;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createQueueAdapter(config: QueueAdapterConfig): EventQueue {
  switch (config.type) {
    case "memory":
      return createInMemoryEventQueue({ capacity: config.capacity });

    case "rabbitmq": {
      const opts: RabbitMqEventQueueOptions = {
        channel: config.channel,
        queueName: config.queueName ?? "brank.inference.events",
        deadLetterQueueName: config.deadLetterQueueName ?? "brank.inference.dlq",
        prefetch: config.prefetch,
        publishOptions: config.publishOptions,
      };
      return createRabbitMqEventQueue(opts);
    }

    default:
      throw new Error(`Unknown queue adapter type: ${(config as { type: string }).type}`);
  }
}
