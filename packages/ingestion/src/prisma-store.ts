import type { Prisma, PrismaClient } from "../../../app/generated/prisma/client";
import type { QueuedInferenceEvent } from "./pipeline";

export function createPrismaEventStore(prisma: PrismaClient) {
  return {
    async bulkInsert(events: QueuedInferenceEvent[]) {
      await prisma.inferenceEvent.createMany({
        data: events.map((event) => ({
          id: event.eventId,
          conversationId: event.ids.conversationId,
          sessionId: event.ids.sessionId,
          traceId: event.ids.traceId,
          requestId: event.ids.requestId,
          eventType: event.eventType,
          status: event.status,
          sequence: event.sequence,
          provider: event.provider,
          model: event.model,
          operation: typeof event.metadata.operation === "string" ? event.metadata.operation : undefined,
          startedAt: new Date(event.startedAt),
          emittedAt: new Date(event.emittedAt),
          completedAt: event.completedAt ? new Date(event.completedAt) : undefined,
          latencyMs: event.latencyMs,
          inputTokens: event.usage?.input,
          outputTokens: event.usage?.output,
          totalTokens: event.usage?.total,
          metadata: event.metadata as Prisma.InputJsonValue,
          previews: event.previews as Prisma.InputJsonValue,
          error: event.error as Prisma.InputJsonValue | undefined,
          rawEvent: event as Prisma.InputJsonValue,
          receivedAt: new Date(event.receivedAt),
          queuedAt: new Date(event.queuedAt),
          processingStartedAt: event.processingStartedAt ? new Date(event.processingStartedAt) : undefined,
          persistedAt: event.persistedAt ? new Date(event.persistedAt) : new Date(),
          attempts: event.attempts,
        })),
        skipDuplicates: true,
      });
    },
  };
}
