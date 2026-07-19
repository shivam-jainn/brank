import {
  createInMemoryEventQueue,
  createMemoryEventStore,
  createPipelineState,
  prepareEventForIngestion,
  startMicroBatchConsumer,
} from "./pipeline";
import type {
  EventQueue,
  EventQueueSubscription,
  EventStore,
  MicroBatchConsumerOptions,
  PipelineMetrics,
  PipelineState,
} from "./pipeline";

export type IngestionService = {
  queue: EventQueue;
  store: EventStore;
  state: PipelineState;
  accept(payload: unknown): Promise<Response>;
  metrics(): PipelineMetrics;
  metricsSseStream(): ReadableStream<Uint8Array>;
  close(): Promise<void>;
};

export type IngestionServiceOptions = MicroBatchConsumerOptions & {
  queue?: EventQueue;
  store?: EventStore;
  queueCapacity?: number;
};

export function createIngestionService(options: IngestionServiceOptions = {}): IngestionService {
  const queue = options.queue ?? createInMemoryEventQueue({ capacity: options.queueCapacity });
  const store = options.store ?? createMemoryEventStore();
  const state = createPipelineState(queue);
  const subscription = startMicroBatchConsumer(queue, store, state, options);

  return {
    queue,
    store,
    state,
    async accept(payload) {
      try {
        const event = prepareEventForIngestion(payload);
        await queue.publish(event);
        state.markAccepted(event);

        return Response.json(
          {
            accepted: true,
            eventId: event.eventId,
            receivedAt: event.receivedAt,
            queuedAt: event.queuedAt,
          },
          { status: 202 },
        );
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 400 });
      }
    },
    metrics() {
      return state.metrics();
    },
    metricsSseStream() {
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      return new ReadableStream<Uint8Array>({
        start(controller) {
          unsubscribe = state.subscribe((metrics) => {
            controller.enqueue(encoder.encode(`event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`));
          });
          heartbeat = setInterval(() => {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }, 15_000);
        },
        cancel() {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
        },
      });
    },
    async close() {
      await closeSubscription(subscription);
    },
  };
}

async function closeSubscription(subscription: EventQueueSubscription): Promise<void> {
  await subscription.close();
}
