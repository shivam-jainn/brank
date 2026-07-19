import { describe, expect, test } from "bun:test";
import {
  batchingTransport,
  bufferedTransport,
  buildEvent,
  createHttpTransport,
  createMemoryTransport,
  fanOutTransport,
  filterTransport,
  redactPreview,
  retryTransport,
  withInference,
  withStreamingInference,
} from "../src";

const metadata = {
  provider: "openai",
  model: "gpt-test",
  conversationId: "conv",
  sessionId: "sess",
  traceId: "trace",
  requestId: "req",
};

function clockFactory(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe("redaction", () => {
  test("redacts PII, secrets, sensitive keys, custom rules, and truncates", () => {
    const result = redactPreview({
      email: "ada@example.com",
      phone: "+1 (415) 555-2671",
      card: "4242 4242 4242 4242",
      authorization: "Bearer abcdefghijklmnop",
      apiKey: "sk_abcdefghijklmnopqrstuvwxyz",
      tenant: "tenant-123",
      long: "x".repeat(40),
    }, {
      maxPreviewChars: 180,
      customRules: [{ name: "tenant", pattern: /tenant-\d+/g }],
    });

    expect(result.value).not.toContain("ada@example.com");
    expect(result.value).not.toContain("4242 4242 4242 4242");
    expect(result.value).not.toContain("sk_abcdefghijklmnopqrstuvwxyz");
    expect(result.value).not.toContain("tenant-123");
    expect(result.redactionCount).toBeGreaterThanOrEqual(5);
    expect(result.truncated).toBe(true);
  });

  test("can disable previews completely", () => {
    const event = buildEvent({
      metadata,
      input: "secret@example.com",
      startedAtMs: 1_000,
      sequence: 0,
      clock: () => 1_100,
      idFactory: () => "id",
      redaction: { previewEnabled: false },
    }, "completed", { output: "raw", completed: true });

    expect(event.previews.disabled).toBe(true);
    expect(event.previews.input).toBeUndefined();
  });
});

describe("events and wrappers", () => {
  test("builds deterministic final events with latency, ids, usage, and dedupe id", async () => {
    const transport = createMemoryTransport();
    const response = await withInference(
      "hello jane@example.com",
      async () => ({ response: { ok: true }, output: "hi 555-555-5555", usage: { input: 2, output: 1, total: 3 } }),
      {
        metadata,
        transport,
        clock: clockFactory(1_000, 1_010, 1_250),
        idFactory: () => "unused",
      },
    );

    expect(response).toEqual({ ok: true });
    expect(transport.events.map((event) => event.eventType)).toEqual(["started", "completed"]);
    const final = transport.events.at(-1)!;
    expect(final.eventId).toBe("trace:req:sess:conv:openai:gpt-test:1:completed");
    expect(final.latencyMs).toBe(250);
    expect(final.usage).toEqual({ input: 2, output: 1, total: 3 });
    expect(final.ids.traceId).toBe("trace");
    expect(final.previews.input).not.toContain("jane@example.com");
    expect(final.previews.output).not.toContain("555-555-5555");
  });

  test("preserves thrown errors and emits failed", async () => {
    const transport = createMemoryTransport();
    const failure = new Error("provider down");

    await expect(withInference("input", async () => {
      throw failure;
    }, {
      metadata,
      transport,
      clock: clockFactory(1_000, 1_005, 1_100),
      idFactory: () => "id",
    })).rejects.toThrow("provider down");

    expect(transport.events.map((event) => event.eventType)).toEqual(["started", "failed"]);
    expect(transport.events[1].error?.message).toBe("provider down");
  });

  test("orders streaming events and throttles progress by chunk count", async () => {
    const transport = createMemoryTransport();
    async function* stream() {
      yield "a ";
      yield "b ";
      yield "c ";
    }

    const chunks: string[] = [];
    for await (const chunk of withStreamingInference("input", stream, {
      metadata,
      transport,
      progress: { chunkCount: 2 },
      clock: clockFactory(1_000, 1_001, 1_002, 1_003, 1_004, 1_100),
      idFactory: () => "id",
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe("a b c ");
    expect(transport.events.map((event) => event.eventType)).toEqual([
      "started",
      "first_token",
      "progress",
      "completed",
    ]);
    expect(transport.events.at(-1)?.status).toBe("completed");
  });

  test("always emits final completed when streaming progress is disabled", async () => {
    const transport = createMemoryTransport();
    async function* stream() {
      yield "one ";
      yield "two ";
    }

    for await (const _chunk of withStreamingInference("input", stream, {
      metadata,
      transport,
      clock: clockFactory(1_000, 1_001, 1_002, 1_100),
      idFactory: () => "id",
    })) {
      // Consume the stream to completion.
    }

    expect(transport.events.map((event) => event.eventType)).toEqual([
      "started",
      "first_token",
      "completed",
    ]);
  });

  test("emits cancelled when the wrapped call aborts", async () => {
    const transport = createMemoryTransport();
    const controller = new AbortController();
    controller.abort();

    await expect(withInference("input", async () => {
      throw new DOMException("aborted", "AbortError");
    }, {
      metadata,
      transport,
      signal: controller.signal,
      clock: clockFactory(1_000, 1_010, 1_020),
      idFactory: () => "id",
    })).rejects.toThrow("aborted");

    expect(transport.events.map((event) => event.eventType)).toEqual(["started", "cancelled"]);
    expect(transport.events.at(-1)?.status).toBe("cancelled");
  });
});

describe("example integration", () => {
  test("streams fake JSON LLM chunks through HTTP ingestion with redacted previews", async () => {
    type FakeLlmChunk = {
      delta: string;
      usage?: {
        input?: number;
        output?: number;
        total?: number;
      };
    };

    const delivered: unknown[] = [];
    const httpTransport = createHttpTransport({
      endpoint: "https://ingest.example.test/events",
      retries: 0,
      fetchFn: async (_url, init) => {
        delivered.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 202 });
      },
    });

    const fakeInput = {
      messages: [
        {
          role: "user",
          content: "Summarize account for Taylor taylor@example.com using card 4242 4242 4242 4242",
        },
      ],
      headers: {
        authorization: "Bearer fake-production-token",
      },
      apiKey: "sk_fakefakefakefakefakefakefake",
    };

    async function* fakeStreamingLlm(): AsyncIterable<FakeLlmChunk> {
      yield {
        delta: "{\"summary\":\"Taylor at taylor@example.com has ",
        usage: { input: 18, output: 6, total: 24 },
      };
      yield {
        delta: "phone +1 415 555 1212 and token sk_responsefakefakefake\"}",
        usage: { input: 18, output: 16, total: 34 },
      };
    }

    const chunks: FakeLlmChunk[] = [];
    for await (const chunk of withStreamingInference(fakeInput, fakeStreamingLlm, {
      metadata: {
        ...metadata,
        provider: "fake-json-provider",
        model: "fake-json-streamer",
        attributes: { environment: "test" },
      },
      transport: httpTransport,
      progress: { tokenThreshold: 5 },
      chunkToText: (chunk) => chunk.delta,
      usageFromChunk: (chunk) => chunk.usage,
      clock: clockFactory(10_000, 10_001, 10_002, 10_003, 10_004, 10_500),
      idFactory: () => "id",
    })) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk) => chunk.delta).join("")).toContain("\"summary\"");

    const events = delivered as Array<{
      eventType: string;
      usage?: { input?: number; output?: number; total?: number };
      previews: { input?: string; output?: string };
      provider: string;
      model: string;
    }>;

    expect(events.map((event) => event.eventType)).toEqual([
      "started",
      "first_token",
      "progress",
      "completed",
    ]);
    expect(events.at(-1)?.provider).toBe("fake-json-provider");
    expect(events.at(-1)?.model).toBe("fake-json-streamer");
    expect(events.at(-1)?.usage).toEqual({ input: 18, output: 16, total: 34 });

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("taylor@example.com");
    expect(serializedEvents).not.toContain("4242 4242 4242 4242");
    expect(serializedEvents).not.toContain("Bearer fake-production-token");
    expect(serializedEvents).not.toContain("sk_fakefakefakefakefakefakefake");
    expect(serializedEvents).not.toContain("sk_responsefakefakefake");
  });
});

describe("transports", () => {
  test("delivers HTTP with idempotency, headers, and retry", async () => {
    const attempts: RequestInit[] = [];
    const transport = createHttpTransport({
      endpoint: "https://ingest.example.test/events",
      headers: { "x-tenant": "acme" },
      retries: 1,
      fetchFn: async (_url, init) => {
        attempts.push(init ?? {});
        return new Response(null, { status: attempts.length === 1 ? 500 : 202 });
      },
    });
    const event = buildEvent({
      metadata,
      input: "input",
      startedAtMs: 1_000,
      sequence: 0,
      clock: () => 1_001,
      idFactory: () => "id",
    }, "started");

    await transport.send(event);

    expect(attempts).toHaveLength(2);
    expect((attempts[0].headers as Record<string, string>)["idempotency-key"]).toBe(event.eventId);
    expect((attempts[0].headers as Record<string, string>)["x-tenant"]).toBe("acme");
  });

  test("composes filtering, fan-out, retry, batching, overflow, and flushing", async () => {
    const primary = createMemoryTransport();
    let retryCalls = 0;
    const retried = retryTransport({
      async send(event) {
        retryCalls += 1;
        if (retryCalls === 1) throw new Error("temporary");
        await primary.send(event);
      },
    }, { retries: 2 });
    const secondary = createMemoryTransport();
    const composed = filterTransport(fanOutTransport([retried, secondary]), (event) => event.eventType !== "progress");
    const bounded = bufferedTransport(composed, { capacity: 1, overflow: "drop_oldest" });

    const started = buildEvent({ metadata, input: "", startedAtMs: 1, sequence: 0, clock: () => 2, idFactory: () => "id" }, "started");
    const progress = buildEvent({ metadata, input: "", startedAtMs: 1, sequence: 1, clock: () => 3, idFactory: () => "id" }, "progress");

    await bounded.send(progress);
    await bounded.send(started);
    await bounded.flush();

    expect(primary.events.map((event) => event.eventType)).toEqual(["started"]);
    expect(secondary.events.map((event) => event.eventType)).toEqual(["started"]);
    expect(retryCalls).toBe(2);

    const batches: string[][] = [];
    const batcher = batchingTransport(async (events) => {
      batches.push(events.map((event) => event.eventType));
    }, { maxBatchSize: 2 });
    await batcher.send(started);
    await batcher.send(progress);
    if (batcher.close) await batcher.close();
    expect(batches).toEqual([["started", "progress"]]);
  });
});
