import { redactPreview } from "@brank/inferhence";
import type { InferenceEvent } from "@brank/inferhence";

export type PipelineTimestamps = {
  receivedAt: string;
  queuedAt: string;
  processingStartedAt?: string;
  persistedAt?: string;
};

export type QueuedInferenceEvent = InferenceEvent & PipelineTimestamps & {
  attempts: number;
};

export type EventQueueMessage = {
  event: QueuedInferenceEvent;
  ack(): Promise<void> | void;
  nack(requeue: boolean): Promise<void> | void;
};

export type EventQueueSubscription = {
  close(): Promise<void> | void;
};

export type EventQueue = {
  publish(event: QueuedInferenceEvent): Promise<void>;
  subscribe(consumer: (message: EventQueueMessage) => Promise<void>): EventQueueSubscription;
  depth(): number;
};

export type EventStore = {
  bulkInsert(events: QueuedInferenceEvent[]): Promise<void>;
};

export type PipelineMetrics = {
  queueDepth: number;
  pendingBatchSize: number;
  recentAccepted: number;
  recentProcessed: number;
  recentRetried: number;
  recentFailed: number;
  totalAccepted: number;
  totalProcessed: number;
  totalRetried: number;
  totalFailed: number;
  lastFlushAt?: string;
  lastBatchDurationMs?: number;
  lastBatchSize: number;
  throughputPerSecond: number;
  ingestionDelayMs?: number;
  queueDelayMs?: number;
  processingTimeMs?: number;
  endToEndLagMs?: number;
};

type MetricName = "accepted" | "processed" | "retried" | "failed";

export type PipelineState = {
  metrics(): PipelineMetrics;
  subscribe(listener: (metrics: PipelineMetrics) => void): () => void;
  markAccepted(event: QueuedInferenceEvent): void;
  setPendingBatchSize(size: number): void;
  markProcessed(events: QueuedInferenceEvent[], durationMs: number): void;
  markRetried(event: QueuedInferenceEvent): void;
  markFailed(event: QueuedInferenceEvent): void;
};

export type MicroBatchConsumerOptions = {
  maxBatchSize?: number;
  maxBatchWaitMs?: number;
  maxRetries?: number;
};

export function prepareEventForIngestion(
  candidate: unknown,
  now: () => number = () => Date.now(),
): QueuedInferenceEvent {
  const event = normalizeInferenceEvent(candidate);
  const receivedAt = new Date(now()).toISOString();
  const queuedAt = new Date(now()).toISOString();

  return {
    ...event,
    previews: redactPreviews(event),
    receivedAt,
    queuedAt,
    attempts: Number((candidate as { attempts?: unknown }).attempts ?? 0),
  };
}

export function createInMemoryEventQueue(options: {
  capacity?: number;
} = {}): EventQueue {
  const capacity = options.capacity ?? 10_000;
  const queue: EventQueueMessage[] = [];
  const consumers = new Set<(message: EventQueueMessage) => Promise<void>>();
  let draining = false;

  function scheduleDrain() {
    if (draining) return;
    draining = true;
    queueMicrotask(() => {
      try {
        while (queue.length > 0 && consumers.size > 0) {
          const message = queue.shift();
          const consumer = consumers.values().next().value;
          if (message && consumer) void consumer(message);
        }
      } finally {
        draining = false;
        if (queue.length > 0 && consumers.size > 0) scheduleDrain();
      }
    });
  }

  return {
    async publish(event) {
      if (queue.length >= capacity) {
        throw new Error("Ingestion event queue overflow");
      }

      queue.push(createMemoryMessage(event, queue, scheduleDrain));
      scheduleDrain();
    },
    subscribe(consumer) {
      consumers.add(consumer);
      scheduleDrain();
      return {
        close() {
          consumers.delete(consumer);
        },
      };
    },
    depth() {
      return queue.length;
    },
  };
}

export function createMemoryEventStore(): EventStore & {
  events: QueuedInferenceEvent[];
} {
  const events: QueuedInferenceEvent[] = [];

  return {
    events,
    async bulkInsert(batch) {
      events.push(...batch);
    },
  };
}

export function createTransactionalBulkInsertStore(
  transaction: (events: QueuedInferenceEvent[]) => Promise<void>,
): EventStore {
  return {
    bulkInsert: transaction,
  };
}

export function createPipelineState(queue: Pick<EventQueue, "depth">): PipelineState {
  const recentWindowMs = 60_000;
  const marks: Record<MetricName, number[]> = {
    accepted: [],
    processed: [],
    retried: [],
    failed: [],
  };
  const totals: Record<MetricName, number> = {
    accepted: 0,
    processed: 0,
    retried: 0,
    failed: 0,
  };
  const listeners = new Set<(metrics: PipelineMetrics) => void>();
  let pendingBatchSize = 0;
  let lastFlushAt: string | undefined;
  let lastBatchDurationMs: number | undefined;
  let lastBatchSize = 0;
  let ingestionDelayMs: number | undefined;
  let queueDelayMs: number | undefined;
  let processingTimeMs: number | undefined;
  let endToEndLagMs: number | undefined;

  function mark(name: MetricName, count = 1) {
    const now = Date.now();
    totals[name] += count;
    for (let index = 0; index < count; index += 1) marks[name].push(now);
    prune(now);
  }

  function prune(now = Date.now()) {
    for (const name of Object.keys(marks) as MetricName[]) {
      while (marks[name][0] && now - marks[name][0] > recentWindowMs) {
        marks[name].shift();
      }
    }
  }

  function snapshot(): PipelineMetrics {
    prune();
    return {
      queueDepth: queue.depth(),
      pendingBatchSize,
      recentAccepted: marks.accepted.length,
      recentProcessed: marks.processed.length,
      recentRetried: marks.retried.length,
      recentFailed: marks.failed.length,
      totalAccepted: totals.accepted,
      totalProcessed: totals.processed,
      totalRetried: totals.retried,
      totalFailed: totals.failed,
      lastFlushAt,
      lastBatchDurationMs,
      lastBatchSize,
      throughputPerSecond: marks.processed.length / (recentWindowMs / 1000),
      ingestionDelayMs,
      queueDelayMs,
      processingTimeMs,
      endToEndLagMs,
    };
  }

  function emit() {
    const next = snapshot();
    for (const listener of listeners) listener(next);
  }

  return {
    metrics: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    markAccepted(event) {
      mark("accepted");
      ingestionDelayMs = Date.parse(event.queuedAt) - Date.parse(event.receivedAt);
      emit();
    },
    setPendingBatchSize(size) {
      pendingBatchSize = size;
      emit();
    },
    markProcessed(events, durationMs) {
      const persistedAtMs = Date.now();
      mark("processed", events.length);
      lastFlushAt = new Date(persistedAtMs).toISOString();
      lastBatchDurationMs = durationMs;
      lastBatchSize = events.length;

      const latest = events.at(-1);
      if (latest?.processingStartedAt) {
        queueDelayMs = Date.parse(latest.processingStartedAt) - Date.parse(latest.queuedAt);
        processingTimeMs = persistedAtMs - Date.parse(latest.processingStartedAt);
        endToEndLagMs = persistedAtMs - Date.parse(latest.receivedAt);
      }
      emit();
    },
    markRetried(event) {
      mark("retried");
      queueDelayMs = Date.now() - Date.parse(event.queuedAt);
      emit();
    },
    markFailed(event) {
      mark("failed");
      endToEndLagMs = Date.now() - Date.parse(event.receivedAt);
      emit();
    },
  };
}

export function startMicroBatchConsumer(
  queue: EventQueue,
  store: EventStore,
  state: PipelineState,
  options: MicroBatchConsumerOptions = {},
): EventQueueSubscription {
  const maxBatchSize = options.maxBatchSize ?? 100;
  const maxBatchWaitMs = options.maxBatchWaitMs ?? 250;
  const maxRetries = options.maxRetries ?? 3;
  let batch: EventQueueMessage[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  async function flush() {
    if (flushing || batch.length === 0) return;
    flushing = true;
    if (timer) clearTimeout(timer);
    timer = undefined;

    const messages = batch;
    batch = [];
    state.setPendingBatchSize(0);
    const processingStartedAt = new Date().toISOString();
    const events = messages.map((message) => ({
      ...message.event,
      processingStartedAt,
    }));
    const started = Date.now();

    try {
      await store.bulkInsert(events);
      const persistedAt = new Date().toISOString();
      const persistedEvents = events.map((event) => ({ ...event, persistedAt }));
      await Promise.all(messages.map((message) => message.ack()));
      state.markProcessed(persistedEvents, Date.now() - started);
    } catch {
      for (const message of messages) {
        message.event.attempts += 1;
        if (message.event.attempts > maxRetries) {
          state.markFailed(message.event);
          await message.nack(false);
        } else {
          state.markRetried(message.event);
          await message.nack(true);
        }
      }
    } finally {
      flushing = false;
      if (batch.length >= maxBatchSize) void flush();
    }
  }

  return queue.subscribe(async (message) => {
    batch.push(message);
    state.setPendingBatchSize(batch.length);

    if (batch.length >= maxBatchSize) {
      await flush();
      return;
    }

    if (!timer) {
      timer = setTimeout(() => {
        if (batch.length > 0) {
          void flush();
        }
        timer = undefined;
      }, maxBatchWaitMs);
    }
  });
}

function createMemoryMessage(
  event: QueuedInferenceEvent,
  queue: EventQueueMessage[],
  scheduleDrain: () => void,
): EventQueueMessage {
  return {
    event,
    ack() {},
    nack(requeue) {
      if (requeue) {
        queue.push(createMemoryMessage(event, queue, scheduleDrain));
        scheduleDrain();
      }
    },
  };
}

function normalizeInferenceEvent(candidate: unknown): InferenceEvent {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Expected JSON event object");
  }

  const event = candidate as Partial<InferenceEvent>;
  const previews = event.previews ?? {
    disabled: true,
    redactionCount: 0,
    truncated: false,
  };
  const ids = event.ids ?? {};

  requireString(event.schemaVersion, "schemaVersion");
  requireString(event.eventId, "eventId");
  requireString(event.eventType, "eventType");
  requireString(event.provider, "provider");
  requireString(event.model, "model");
  requireString(event.status, "status");
  requireString(event.startedAt, "startedAt");
  requireString(event.emittedAt, "emittedAt");

  return {
    schemaVersion: "inferhence.event.v1",
    eventId: event.eventId.trim(),
    eventType: event.eventType,
    sequence: Number(event.sequence ?? 0),
    provider: event.provider.trim(),
    model: event.model.trim(),
    status: event.status,
    startedAt: event.startedAt,
    emittedAt: event.emittedAt,
    completedAt: event.completedAt,
    latencyMs: event.latencyMs,
    usage: event.usage,
    ids,
    metadata: event.metadata ?? {},
    previews,
    error: event.error,
  } as InferenceEvent;
}

function redactPreviews(event: InferenceEvent): InferenceEvent["previews"] {
  if (event.previews.disabled) return event.previews;

  const input = redactPreview(event.previews.input);
  const output = redactPreview(event.previews.output);
  return {
    input: input.value,
    output: output.value,
    disabled: false,
    redactionCount: event.previews.redactionCount + input.redactionCount + output.redactionCount,
    truncated: event.previews.truncated || input.truncated || output.truncated,
  };
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${field}`);
  }
}
