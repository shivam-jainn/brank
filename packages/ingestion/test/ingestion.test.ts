import { describe, expect, test } from "bun:test";
import {
  createInMemoryEventQueue,
  createIngestionService,
  createMemoryEventStore,
  createPrismaEventStore,
  createPipelineState,
  prepareEventForIngestion,
  startMicroBatchConsumer,
} from "../src";
import type { InferenceEvent } from "@brank/inferhence";

const baseEvent: InferenceEvent = {
  schemaVersion: "inferhence.event.v1",
  eventId: "event-1",
  eventType: "completed",
  sequence: 1,
  provider: " openai ",
  model: " gpt-test ",
  status: "completed",
  startedAt: "2026-07-19T00:00:00.000Z",
  emittedAt: "2026-07-19T00:00:00.100Z",
  completedAt: "2026-07-19T00:00:00.100Z",
  latencyMs: 100,
  ids: {
    traceId: "trace",
  },
  metadata: {},
  previews: {
    input: "hello ada@example.com",
    output: "call me at 415-555-1212",
    disabled: false,
    redactionCount: 0,
    truncated: false,
  },
};

describe("ingestion pipeline", () => {
  test("validates, normalizes, redacts, publishes, and returns 202", async () => {
    const service = createIngestionService({ maxBatchWaitMs: 20 });
    const response = await service.accept(baseEvent);
    const body = await response.json() as { accepted: boolean; eventId: string };

    expect(response.status).toBe(202);
    expect(body).toEqual(expect.objectContaining({ accepted: true, eventId: "event-1" }));
    expect(service.metrics().totalAccepted).toBe(1);
  });

  test("flushes low volume events after max batch wait", async () => {
    const queue = createInMemoryEventQueue();
    const store = createMemoryEventStore();
    const state = createPipelineState(queue);
    startMicroBatchConsumer(queue, store, state, {
      maxBatchSize: 10,
      maxBatchWaitMs: 20,
    });

    const event = prepareEventForIngestion(baseEvent);
    await queue.publish(event);
    state.markAccepted(event);
    await sleep(40);

    expect(store.events).toHaveLength(1);
    expect(store.events[0].processingStartedAt).toBeDefined();
    expect(state.metrics().lastBatchSize).toBe(1);
  });

  test("flushes immediately when max batch size is reached", async () => {
    const queue = createInMemoryEventQueue();
    const store = createMemoryEventStore();
    const state = createPipelineState(queue);
    startMicroBatchConsumer(queue, store, state, {
      maxBatchSize: 2,
      maxBatchWaitMs: 10_000,
    });

    await queue.publish(prepareEventForIngestion({ ...baseEvent, eventId: "event-1" }));
    await queue.publish(prepareEventForIngestion({ ...baseEvent, eventId: "event-2" }));
    await sleep(10);

    expect(store.events.map((event) => event.eventId)).toEqual(["event-1", "event-2"]);
    expect(state.metrics().lastBatchSize).toBe(2);
  });

  test("retries bounded failures then records dead-letter failures", async () => {
    const queue = createInMemoryEventQueue();
    const state = createPipelineState(queue);
    let writes = 0;
    startMicroBatchConsumer(
      queue,
      {
        async bulkInsert() {
          writes += 1;
          throw new Error("database unavailable");
        },
      },
      state,
      {
        maxBatchSize: 1,
        maxBatchWaitMs: 5,
        maxRetries: 1,
      },
    );

    await queue.publish(prepareEventForIngestion(baseEvent));
    await sleep(40);

    expect(writes).toBe(2);
    expect(state.metrics().totalRetried).toBe(1);
    expect(state.metrics().totalFailed).toBe(1);
  });

  test("redacts previews again on the server side", () => {
    const event = prepareEventForIngestion(baseEvent);

    expect(event.provider).toBe("openai");
    expect(event.model).toBe("gpt-test");
    expect(event.previews.input).not.toContain("ada@example.com");
    expect(event.previews.output).not.toContain("415-555-1212");
    expect(event.receivedAt).toBeDefined();
    expect(event.queuedAt).toBeDefined();
  });

  test("maps queued inference events to database rows", async () => {
    let rows: unknown[] = [];
    const store = createPrismaEventStore({
      inferenceEvent: {
        async createMany(args: { data: unknown[] }) {
          rows = args.data;
        },
      },
    } as never);

    await store.bulkInsert([
      prepareEventForIngestion({
        ...baseEvent,
        ids: {
          conversationId: "conversation-1",
          requestId: "request-1",
          traceId: "trace-1",
        },
        usage: {
          input: 10,
          output: 20,
          total: 30,
        },
        metadata: {
          route: "/api/chat",
        },
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: "event-1",
      conversationId: "conversation-1",
      requestId: "request-1",
      traceId: "trace-1",
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      provider: "openai",
      model: "gpt-test",
    }));
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
