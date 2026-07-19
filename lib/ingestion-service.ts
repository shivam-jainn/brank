/**
 * Ingestion service singleton for the Next.js application.
 *
 * Mode selection:
 *   - If RABBITMQ_URL is set → producer-only mode.
 *     The app publishes events to RabbitMQ but does NOT run the micro-batch
 *     consumer.  A separate worker process runs the consumer.
 *   - Otherwise → in-process mode (default for dev / single-process deploys).
 *     The micro-batch consumer runs inside the Next.js server process, writing
 *     directly to Postgres.  No external broker required.
 *
 * Extending to other brokers:
 *   Add a new branch that calls `createQueueAdapter({ type: "kafka", … })`.
 */

import amqplib from "amqplib";
import { createIngestionService, createPrismaEventStore } from "@brank/ingestion";
import { createQueueAdapter } from "@brank/ingestion/queue-adapter";
import { createRabbitMqEventQueue } from "@brank/ingestion/rabbitmq";
import { appConfig } from "@/lib/config";
import { getPrismaClient } from "@/lib/db";

type IngestionServiceType = ReturnType<typeof createIngestionService>;

const globalForIngestion = globalThis as typeof globalThis & {
  ingestionService?: IngestionServiceType;
};

export function getIngestionService(): IngestionServiceType {
  if (globalForIngestion.ingestionService) {
    return globalForIngestion.ingestionService;
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL is required for ingestion storage.");
  }

  const store = createPrismaEventStore(prisma);

  // -------------------------------------------------------------------------
  // Producer-only mode: RabbitMQ is the queue broker
  // -------------------------------------------------------------------------
  if (appConfig.rabbitmqUrl) {
    // Bootstrap the RabbitMQ connection asynchronously and swap the service
    // once the connection is ready.  During the brief startup window the
    // placeholder (in-memory) absorbs any early events.
    void (async () => {
      try {
        const connection = await amqplib.connect(appConfig.rabbitmqUrl!);
        const channel = await connection.createChannel();

        // amqplib Channel is structurally compatible with RabbitMqChannel.
        const queue = createRabbitMqEventQueue({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          channel: channel as any,
          queueName: "brank.inference.events",
          deadLetterQueueName: "brank.inference.dlq",
        });

        globalForIngestion.ingestionService = createIngestionService({
          queue,
          store,
          maxBatchSize: appConfig.ingestion.maxBatchSize,
          maxBatchWaitMs: appConfig.ingestion.maxBatchWaitMs,
          maxRetries: appConfig.ingestion.maxRetries,
        });
      } catch (error) {
        console.error("[ingestion] RabbitMQ connection failed, staying on in-memory queue:", error);
      }
    })();
  }

  // -------------------------------------------------------------------------
  // In-process mode (dev / single-replica, or fallback before RabbitMQ connects)
  // -------------------------------------------------------------------------
  globalForIngestion.ingestionService = createIngestionService({
    store,
    queue: createQueueAdapter({ type: "memory", capacity: appConfig.ingestion.queueCapacity }),
    maxBatchSize: appConfig.ingestion.maxBatchSize,
    maxBatchWaitMs: appConfig.ingestion.maxBatchWaitMs,
    maxRetries: appConfig.ingestion.maxRetries,
    queueCapacity: appConfig.ingestion.queueCapacity,
  });

  return globalForIngestion.ingestionService;
}
