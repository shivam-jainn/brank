import type { InferenceEvent, InferenceTransport } from "./types";

export type HttpTransportOptions = {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  fetchFn?: typeof fetch;
};

export function createHttpTransport(options: HttpTransportOptions): InferenceTransport {
  const fetchFn = options.fetchFn ?? fetch;
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async send(event) {
      const body = JSON.stringify(event);
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          const response = await fetchFn(options.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": event.eventId,
              ...options.headers,
            },
            body,
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (response.ok) return;
        } catch {
          // Telemetry is best-effort; retry below and swallow final failure.
        }
      }
    },
  };
}

export function createMemoryTransport(events: InferenceEvent[] = []): InferenceTransport & {
  events: InferenceEvent[];
} {
  return {
    events,
    async send(event) {
      events.push(event);
    },
  };
}

export function fanOutTransport(transports: InferenceTransport[]): InferenceTransport {
  return {
    async send(event) {
      await Promise.allSettled(transports.map((transport) => transport.send(event)));
    },
    async flush() {
      await Promise.allSettled(transports.map((transport) => flushTransport(transport)));
    },
    async close() {
      await Promise.allSettled(transports.map((transport) => closeTransport(transport)));
    },
  };
}

export function filterTransport(
  transport: InferenceTransport,
  predicate: (event: InferenceEvent) => boolean,
): InferenceTransport {
  return {
    async send(event) {
      if (predicate(event)) {
        await transport.send(event);
      }
    },
    flush: () => flushTransport(transport),
    close: () => closeTransport(transport),
  };
}

export function retryTransport(
  transport: InferenceTransport,
  options: { retries?: number; delayMs?: number } = {},
): InferenceTransport {
  return {
    async send(event) {
      for (let attempt = 0; attempt <= (options.retries ?? 2); attempt += 1) {
        try {
          await transport.send(event);
          return;
        } catch {
          if (attempt < (options.retries ?? 2) && options.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.delayMs));
          }
        }
      }
    },
    flush: () => flushTransport(transport),
    close: () => closeTransport(transport),
  };
}

export function bufferedTransport(
  transport: InferenceTransport,
  options: { capacity?: number; overflow?: "drop_oldest" | "drop_newest" | "throw" } = {},
): InferenceTransport & { size(): number } {
  const capacity = options.capacity ?? 1000;
  const overflow = options.overflow ?? "drop_oldest";
  const queue: InferenceEvent[] = [];
  let draining = false;

  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length > 0) {
      const event = queue.shift();
      if (event) await transport.send(event);
    }
    draining = false;
  }

  return {
    async send(event) {
      if (queue.length >= capacity) {
        if (overflow === "throw") throw new Error("Inferhence transport queue overflow");
        if (overflow === "drop_newest") return;
        queue.shift();
      }
      queue.push(event);
      void drain();
    },
    async flush() {
      await drain();
      await flushTransport(transport);
    },
    async close() {
      await drain();
      await closeTransport(transport);
    },
    size() {
      return queue.length;
    },
  };
}

export function batchingTransport(
  sendBatch: (events: InferenceEvent[]) => Promise<void>,
  options: { maxBatchSize?: number; maxWaitMs?: number } = {},
): InferenceTransport {
  const maxBatchSize = options.maxBatchSize ?? 25;
  let queue: InferenceEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const batch = queue;
    queue = [];
    if (batch.length) await sendBatch(batch);
  }

  return {
    async send(event) {
      queue.push(event);
      if (queue.length >= maxBatchSize) {
        await flush();
        return;
      }
      timer ??= setTimeout(() => void flush(), options.maxWaitMs ?? 250);
    },
    flush,
    close: flush,
  };
}

export type BrokerPublisher = (event: InferenceEvent) => Promise<void>;

export function brokerAdapter(publish: BrokerPublisher): InferenceTransport {
  return {
    send: publish,
  };
}

async function flushTransport(transport: InferenceTransport): Promise<void> {
  if (typeof transport.flush === "function") {
    await transport.flush();
  }
}

async function closeTransport(transport: InferenceTransport): Promise<void> {
  if (typeof transport.close === "function") {
    await transport.close();
  }
}
