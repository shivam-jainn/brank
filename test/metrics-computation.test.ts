import { describe, expect, test, mock, beforeEach } from "bun:test";
import { getMetricsData } from "@/app/api/metrics/route";

function makeEvent(overrides: Partial<{
  id: string;
  requestId: string | null;
  traceId: string | null;
  conversationId: string | null;
  userId: string | null;
  provider: string;
  model: string;
  status: string;
  eventType: string;
  startedAt: Date;
  emittedAt: Date;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  rawEvent: any;
}> = {}) {
  const now = new Date();
  return {
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    conversationId: overrides.conversationId ?? null,
    sessionId: "sess-1",
    userId: overrides.userId ?? null,
    traceId: overrides.traceId ?? null,
    requestId: overrides.requestId ?? null,
    eventType: overrides.eventType ?? "completed",
    status: overrides.status ?? "completed",
    sequence: 1,
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o",
    startedAt: overrides.startedAt ?? new Date(now.getTime() - 5_000),
    emittedAt: overrides.emittedAt ?? now,
    completedAt: now,
    latencyMs: overrides.latencyMs ?? null,
    inputTokens: overrides.inputTokens ?? null,
    outputTokens: overrides.outputTokens ?? null,
    totalTokens: overrides.totalTokens ?? null,
    metadata: {},
    previews: {},
    rawEvent: overrides.rawEvent ?? {},
    receivedAt: now,
    queuedAt: now,
    persistedAt: now,
  };
}

let events: ReturnType<typeof makeEvent>[];
let mockPrisma: any;
let chatMessageRows: any[] = [];

function setupMocks(eventList: ReturnType<typeof makeEvent>[], messages?: any[]) {
  events = eventList;
  chatMessageRows = messages ?? [];

  mockPrisma = {
    inferenceEvent: {
      count: mock((args?: any) => {
        const filtered = applyEventFilters(events, args?.where || {});
        return Promise.resolve(filtered.length);
      }),
      findMany: mock((args?: any) => {
        if (args?.distinct) {
          const key = args.distinct[0];
          const values = Array.from(new Set(events.map((e: any) => e[key as keyof typeof e])));
          return Promise.resolve(values.map((val) => ({ [key]: val })));
        }
        const filtered = applyEventFilters(events, args?.where || {});
        return Promise.resolve(filtered);
      }),
    },
    chatMessage: {
      count: mock((args?: any) => {
        const filtered = applyMessageFilters(chatMessageRows, args?.where || {});
        return Promise.resolve(filtered.length);
      }),
      findMany: mock((args?: any) => {
        const filtered = applyMessageFilters(chatMessageRows, args?.where || {});
        return Promise.resolve(filtered);
      }),
    },
    conversation: {
      count: mock(() => Promise.resolve(0)),
    },
  };

  mock.module("@/lib/db", () => ({
    getPrismaClient: () => mockPrisma,
  }));

  mock.module("@/lib/auth", () => ({
    auth: {
      api: {
        getSession: () => Promise.resolve(null),
      },
    },
  }));

  mock.module("@/lib/ingestion-service", () => ({
    getIngestionService: () => ({
      metrics: () => ({
        received: 0,
        processed: 0,
        failed: 0,
        queued: 0,
        retries: 0,
      }),
    }),
  }));
}

function applyEventFilters(eventList: any[], where: any) {
  return eventList.filter((e) => {
    if (where.emittedAt?.gte && e.emittedAt < where.emittedAt.gte) return false;
    if (where.userId && e.userId !== where.userId) return false;
    if (where.provider && e.provider !== where.provider) return false;
    if (where.model && e.model !== where.model) return false;
    if (where.status && e.status !== where.status) return false;
    return true;
  });
}

function applyMessageFilters(messageList: any[], where: any) {
  return messageList.filter((m) => {
    if (where.createdAt?.gte && m.createdAt < where.createdAt.gte) return false;
    if (where.conversationId && typeof where.conversationId === "object" && where.conversationId.in) {
      if (!where.conversationId.in.includes(m.conversationId)) return false;
    } else if (where.conversationId && m.conversationId !== where.conversationId) {
      return false;
    }
    return true;
  });
}

describe("deriveRuns - grouping logic", () => {
  beforeEach(() => {
    mockPrisma?.inferenceEvent?.count?.mockClear?.();
    mockPrisma?.inferenceEvent?.findMany?.mockClear?.();
  });

  test("groups events with the same requestId into a single run", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "started", latencyMs: null }),
      makeEvent({ id: "e2", requestId: "req-1", status: "completed", latencyMs: 150 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.totalRuns).toBe(1);
  });

  test("groups events with the same traceId when requestId is null", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: null, traceId: "trace-1", status: "started", latencyMs: null }),
      makeEvent({ id: "e2", requestId: null, traceId: "trace-1", status: "completed", latencyMs: 200 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.totalRuns).toBe(1);
    expect(data.totals.avgLatencyMs).toBe(200);
  });

  test("falls back to provider:model:startedAt when both requestId and traceId are null", async () => {
    const startedAt = new Date("2026-07-20T10:00:00.000Z");
    setupMocks([
      makeEvent({ id: "e1", requestId: null, traceId: null, provider: "openai", model: "gpt-4o", startedAt, status: "started", latencyMs: null }),
      makeEvent({ id: "e2", requestId: null, traceId: null, provider: "openai", model: "gpt-4o", startedAt, status: "completed", latencyMs: 100 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.totalRuns).toBe(1);
  });

  test("separates events into different runs when requestId differs", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", requestId: "req-2", status: "completed", latencyMs: 200 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.totalRuns).toBe(2);
    expect(data.totals.avgLatencyMs).toBe(150);
  });

  test("derives status correctly: completed > started", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "started", latencyMs: null }),
      makeEvent({ id: "e2", requestId: "req-1", status: "completed", latencyMs: 100 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.completedRuns).toBe(1);
    expect(data.totals.activeRuns).toBe(0);
  });

  test("derives status correctly: failed > completed", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", requestId: "req-1", status: "failed", latencyMs: null }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.failedRuns).toBe(1);
    expect(data.totals.completedRuns).toBe(0);
  });

  test("takes latencyMs from the latest event that has it", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "started", latencyMs: null }),
      makeEvent({ id: "e2", requestId: "req-1", status: "completed", latencyMs: 300 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.avgLatencyMs).toBe(300);
  });

  test("picks up token usage from completed events", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "started", totalTokens: null }),
      makeEvent({ id: "e2", requestId: "req-1", status: "completed", totalTokens: 500, latencyMs: 100 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.totalTokens).toBe(500);
  });
});

describe("metrics filtering by userId", () => {
  test("returns 0 runs when userId filter matches no events", async () => {
    setupMocks([
      makeEvent({ id: "e1", userId: null, requestId: "req-1", status: "completed", latencyMs: 100 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all", "nonexistent-user");
    expect(data.totals.totalRuns).toBe(0);
    expect(data.totals.totalEvents).toBe(0);
  });

  test("filters events by userId correctly", async () => {
    setupMocks([
      makeEvent({ id: "e1", userId: "user-1", requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", userId: "user-2", requestId: "req-2", status: "completed", latencyMs: 200 }),
      makeEvent({ id: "e3", userId: "user-1", requestId: "req-3", status: "completed", latencyMs: 300 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all", "user-1");
    expect(data.totals.totalRuns).toBe(2);
    expect(data.totals.avgLatencyMs).toBe(200);
  });

  test("returns events with null userId when filtering by null userId", async () => {
    setupMocks([
      makeEvent({ id: "e1", userId: null, requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", userId: "user-1", requestId: "req-2", status: "completed", latencyMs: 200 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.totalRuns).toBe(2);
  });
});

describe("latency computation", () => {
  test("computes average latency correctly", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", requestId: "req-2", status: "completed", latencyMs: 200 }),
      makeEvent({ id: "e3", requestId: "req-3", status: "completed", latencyMs: 300 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.avgLatencyMs).toBe(200);
  });

  test("computes p95 latency correctly", async () => {
    const eventList = Array.from({ length: 100 }, (_, i) =>
      makeEvent({ id: `e${i}`, requestId: `req-${i}`, status: "completed", latencyMs: i + 1 })
    );
    setupMocks(eventList);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.p95LatencyMs).toBe(95);
  });

  test("returns 0 latency when no completed runs have latency", async () => {
    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", status: "started", latencyMs: null }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.totals.avgLatencyMs).toBe(0);
    expect(data.totals.p95LatencyMs).toBe(0);
  });
});

describe("per-provider metrics", () => {
  test("groups runs by provider:model and computes correct counts", async () => {
    setupMocks([
      makeEvent({ id: "e1", provider: "openai", model: "gpt-4o", requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", provider: "openai", model: "gpt-4o", requestId: "req-2", status: "failed", latencyMs: null }),
      makeEvent({ id: "e3", provider: "anthropic", model: "claude-3", requestId: "req-3", status: "completed", latencyMs: 200 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.byProvider).toHaveLength(2);

    const openai = data.byProvider.find((p) => p.provider === "openai");
    expect(openai?.runs).toBe(2);
    expect(openai?.completed).toBe(1);
    expect(openai?.failed).toBe(1);
    expect(openai?.avgLatencyMs).toBe(100);

    const anthropic = data.byProvider.find((p) => p.provider === "anthropic");
    expect(anthropic?.runs).toBe(1);
    expect(anthropic?.completed).toBe(1);
    expect(anthropic?.avgLatencyMs).toBe(200);
  });
});

describe("time series computation", () => {
  test("places runs into correct time buckets", async () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    setupMocks([
      makeEvent({ id: "e1", requestId: "req-1", emittedAt: tenMinAgo, status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", requestId: "req-2", emittedAt: fiveMinAgo, status: "completed", latencyMs: 200 }),
    ]);

    const data = await getMetricsData("1h", "all", "all", "all");
    const nonEmptyBuckets = data.series.perRange.filter((b: any) => b.runs > 0);
    expect(nonEmptyBuckets.length).toBeGreaterThanOrEqual(1);
    expect(data.series.perRange.reduce((sum: number, b: any) => sum + b.runs, 0)).toBe(2);
  });
});

describe("chatSpans - grouping by conversationId", () => {
  beforeEach(() => {
    mockPrisma?.inferenceEvent?.count?.mockClear?.();
    mockPrisma?.inferenceEvent?.findMany?.mockClear?.();
    chatMessageRows = [];
  });

  test("groups multiple requests into a single chatSpan by conversationId", async () => {
    const now = new Date();
    const t1 = new Date(now.getTime() - 10_000);
    const t2 = new Date(now.getTime() - 5_000);

    setupMocks([
      makeEvent({ id: "e1", conversationId: "conv-1", requestId: "req-1", status: "completed", latencyMs: 100, emittedAt: t1, startedAt: t1 }),
      makeEvent({ id: "e2", conversationId: "conv-1", requestId: "req-1", status: "completed", latencyMs: 100, emittedAt: t2, startedAt: t1 }),
      makeEvent({ id: "e3", conversationId: "conv-1", requestId: "req-2", status: "completed", latencyMs: 200, emittedAt: t2, startedAt: t2 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.chatSpans).toBeDefined();
    expect(data.chatSpans).toHaveLength(1);
    expect(data.chatSpans[0].conversationId).toBe("conv-1");
    expect(data.chatSpans[0].requests).toHaveLength(2);
  });

  test("separates events into different chatSpans when conversationId differs", async () => {
    setupMocks([
      makeEvent({ id: "e1", conversationId: "conv-1", requestId: "req-1", status: "completed", latencyMs: 100 }),
      makeEvent({ id: "e2", conversationId: "conv-2", requestId: "req-2", status: "completed", latencyMs: 200 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.chatSpans).toHaveLength(2);
  });

  test("chatSpan includes request groups with correct status and latency", async () => {
    const now = new Date();
    const t1 = new Date(now.getTime() - 10_000);

    setupMocks([
      makeEvent({ id: "e1", conversationId: "conv-1", requestId: "req-1", status: "started", latencyMs: null, emittedAt: t1, startedAt: t1 }),
      makeEvent({ id: "e2", conversationId: "conv-1", requestId: "req-1", status: "completed", latencyMs: 150, emittedAt: now, startedAt: t1 }),
      makeEvent({ id: "e3", conversationId: "conv-1", requestId: "req-2", status: "failed", latencyMs: null, emittedAt: now, startedAt: now }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    const span = data.chatSpans[0];
    expect(span.requests).toHaveLength(2);

    const req1 = span.requests.find((r: any) => r.id === "req-1");
    expect(req1?.status).toBe("completed");
    expect(req1?.latencyMs).toBe(150);

    const req2 = span.requests.find((r: any) => r.id === "req-2");
    expect(req2?.status).toBe("failed");
  });

  test("chatSpan sorts requests by time and tracks overall start/end", async () => {
    const now = new Date();
    const t1 = new Date(now.getTime() - 20_000);
    const t2 = new Date(now.getTime() - 10_000);

    setupMocks([
      makeEvent({ id: "e1", conversationId: "conv-1", requestId: "req-1", status: "completed", latencyMs: 100, emittedAt: t1, startedAt: t1 }),
      makeEvent({ id: "e2", conversationId: "conv-1", requestId: "req-2", status: "completed", latencyMs: 200, emittedAt: t2, startedAt: t2 }),
    ]);

    const data = await getMetricsData("24h", "all", "all", "all");
    const span = data.chatSpans[0];
    expect(span.startedAt.getTime()).toBe(t1.getTime());
    expect(span.lastEventAt.getTime()).toBe(t2.getTime());
    expect(span.requests[0].id).toBe("req-1");
    expect(span.requests[1].id).toBe("req-2");
  });

  test("chatSpan includes chatMessages fetched from database", async () => {
    const now = new Date();

    const chatMessages = [
      { id: "msg-1", role: "user", content: "Hello", sequence: 0, createdAt: new Date(now.getTime() - 20_000), conversationId: "conv-1" },
      { id: "msg-2", role: "assistant", content: "Hi there", sequence: 1, createdAt: new Date(now.getTime() - 15_000), conversationId: "conv-1" },
    ];

    setupMocks(
      [makeEvent({ id: "e1", conversationId: "conv-1", requestId: "req-1", status: "completed", latencyMs: 100 })],
      chatMessages,
    );

    const data = await getMetricsData("24h", "all", "all", "all");
    expect(data.chatSpans).toHaveLength(1);
    expect(data.chatSpans[0].chatMessages).toHaveLength(2);
    expect(data.chatSpans[0].chatMessages[0].role).toBe("user");
    expect(data.chatSpans[0].chatMessages[0].content).toBe("Hello");
    expect(data.chatSpans[0].chatMessages[1].role).toBe("assistant");
    expect(data.chatSpans[0].chatMessages[1].content).toBe("Hi there");
  });
});
