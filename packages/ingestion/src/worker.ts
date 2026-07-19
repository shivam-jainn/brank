/**
 * Ingestion Worker — standalone Bun process
 *
 * Connects to RabbitMQ, subscribes to the inference event queue, and
 * micro-batch writes events to PostgreSQL.  Handles graceful SIGTERM shutdown.
 *
 * Usage:
 *   RABBITMQ_URL=amqp://... DATABASE_URL=postgresql://... bun packages/ingestion/src/worker.ts
 *
 * Environment variables (all optional, have defaults):
 *   RABBITMQ_URL              amqp://guest:guest@localhost:5672
 *   RABBITMQ_QUEUE            brank.inference.events
 *   RABBITMQ_DLQ              brank.inference.dlq
 *   RABBITMQ_PREFETCH         50
 *   INGESTION_MAX_BATCH_SIZE  100
 *   INGESTION_MAX_BATCH_WAIT_MS 250
 *   INGESTION_MAX_RETRIES     3
 */

import amqplib from "amqplib";
import { PrismaClient } from "../../../app/generated/prisma/client";
import { createRabbitMqEventQueue } from "./rabbitmq";
import { createPrismaEventStore } from "./prisma-store";
import { createIngestionService } from "./service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rabbitUrl = readEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672");
  const queueName = readEnv("RABBITMQ_QUEUE", "brank.inference.events");
  const dlqName = readEnv("RABBITMQ_DLQ", "brank.inference.dlq");
  const prefetch = readInt("RABBITMQ_PREFETCH", 50);
  const maxBatchSize = readInt("INGESTION_MAX_BATCH_SIZE", 100);
  const maxBatchWaitMs = readInt("INGESTION_MAX_BATCH_WAIT_MS", 250);
  const maxRetries = readInt("INGESTION_MAX_RETRIES", 3);

  console.info("[worker] connecting to RabbitMQ …");
  const connection = await amqplib.connect(rabbitUrl);
  const channel = await connection.createChannel();
  console.info("[worker] connected to RabbitMQ");

  const prisma = new PrismaClient();
  const store = createPrismaEventStore(prisma);
  const queue = createRabbitMqEventQueue({
    // RabbitMQ channel satisfies RabbitMqChannel without casting because
    // amqplib's Channel has the same method signatures.
    channel: channel as unknown as Parameters<typeof createRabbitMqEventQueue>[0]["channel"],
    queueName,
    deadLetterQueueName: dlqName,
    prefetch,
  });

  const service = createIngestionService({
    queue,
    store,
    maxBatchSize,
    maxBatchWaitMs,
    maxRetries,
  });

  console.info("[worker] consuming from queue '%s' …", queueName);

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[worker] ${signal} received — draining …`);
    try {
      await service.close();
      await channel.close();
      await connection.close();
      await prisma.$disconnect();
      console.info("[worker] shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[worker] error during shutdown:", error);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Print queue health every 30 s
  setInterval(() => {
    const metrics = service.metrics();
    console.info(
      "[worker] depth=%d pending=%d processed=%d failed=%d tps=%.2f",
      metrics.queueDepth,
      metrics.pendingBatchSize,
      metrics.totalProcessed,
      metrics.totalFailed,
      metrics.throughputPerSecond,
    );
  }, 30_000).unref();

  console.info("[worker] ready");
}

main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
