import { createIngestionService, createPrismaEventStore } from "@brank/ingestion";
import { appConfig } from "@/lib/config";
import { getPrismaClient } from "@/lib/db";

const globalForIngestion = globalThis as typeof globalThis & {
  ingestionService?: ReturnType<typeof createIngestionService>;
};

export function getIngestionService() {
  if (globalForIngestion.ingestionService) {
    return globalForIngestion.ingestionService;
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL is required for ingestion storage.");
  }

  globalForIngestion.ingestionService = createIngestionService({
    store: createPrismaEventStore(prisma),
    maxBatchSize: appConfig.ingestion.maxBatchSize,
    maxBatchWaitMs: appConfig.ingestion.maxBatchWaitMs,
    maxRetries: appConfig.ingestion.maxRetries,
    queueCapacity: appConfig.ingestion.queueCapacity,
  });

  return globalForIngestion.ingestionService;
}
