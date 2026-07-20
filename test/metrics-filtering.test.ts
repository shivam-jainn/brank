import { describe, expect, test, mock, beforeEach } from "bun:test";
import { getMetricsData } from "@/app/api/metrics/route";

// Setup dynamic fake data generator
function generateFakeEvents(count: number) {
  const providers = ["openai", "anthropic", "groq"];
  const models = ["gpt-4o", "claude-3-5-sonnet", "llama-3-70b"];
  const statuses = ["completed", "failed", "cancelled", "started"];

  return Array.from({ length: count }, (_, idx) => {
    const provider = providers[idx % providers.length];
    const model = models[idx % models.length];
    const status = statuses[idx % statuses.length];
    return {
      id: `evt-${idx}`,
      conversationId: `conv-${idx % 5}`,
      sessionId: `sess-${idx % 5}`,
      traceId: `trace-${idx}`,
      requestId: `req-${idx}`,
      eventType: "completed",
      status,
      sequence: 1,
      provider,
      model,
      startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
      emittedAt: new Date(Date.now() - 30 * 60 * 1000 + idx * 1000),
      completedAt: new Date(Date.now() - 29 * 60 * 1000),
      latencyMs: 100 + idx * 10,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      metadata: {},
      previews: {},
      rawEvent: { usage: { estimated: false } },
      receivedAt: new Date(),
      queuedAt: new Date(),
      persistedAt: new Date(),
    };
  });
}

const fakeEvents = generateFakeEvents(100);

// Helper to filter fake data using prisma-like where clause
function applyFilters(events: any[], where: any) {
  return events.filter(e => {
    if (where.emittedAt?.gte && e.emittedAt < where.emittedAt.gte) return false;
    if (where.provider && e.provider !== where.provider) return false;
    if (where.model && e.model !== where.model) return false;
    if (where.status && e.status !== where.status) return false;
    return true;
  });
}

// Mock Prisma
const mockPrisma = {
  inferenceEvent: {
    count: mock((args?: any) => {
      const filtered = applyFilters(fakeEvents, args?.where || {});
      return Promise.resolve(filtered.length);
    }),
    findMany: mock((args?: any) => {
      if (args?.distinct) {
        const key = args.distinct[0];
        const values = Array.from(new Set(fakeEvents.map(e => e[key as keyof typeof e])));
        return Promise.resolve(values.map(val => ({ [key]: val })));
      }
      const filtered = applyFilters(fakeEvents, args?.where || {});
      return Promise.resolve(filtered);
    }),
  },
  chatMessage: {
    count: mock(() => Promise.resolve(10)),
  },
  conversation: {
    count: mock(() => Promise.resolve(5)),
  },
};

mock.module("@/lib/db", () => ({
  getPrismaClient: () => mockPrisma,
}));

mock.module("@/lib/ingestion-service", () => ({
  getIngestionService: () => ({
    metrics: () => ({
      received: 120,
      processed: 100,
      failed: 10,
      queued: 5,
      retries: 5,
    }),
  }),
}));

describe("Dashboard Metrics API Filtering", () => {
  beforeEach(() => {
    mockPrisma.inferenceEvent.count.mockClear();
    mockPrisma.inferenceEvent.findMany.mockClear();
  });

  test("returns all data when filters are 'all'", async () => {
    const data = await getMetricsData("24h", "all", "all", "all");

    expect(data.totals.totalRuns).toBe(100);
    expect(data.availableProviders).toContain("openai");
    expect(data.availableProviders).toContain("anthropic");
    expect(data.availableProviders).toContain("groq");
    expect(data.availableModels).toContain("gpt-4o");
  });

  test("filters data by provider correctly", async () => {
    // 100 events, 3 providers distributed evenly: index % 3
    // openai: 0, 3, 6 ... -> 34 items
    const data = await getMetricsData("24h", "openai", "all", "all");

    expect(data.totals.totalRuns).toBe(34);
    // Verify that every derived run is for openai
    expect(data.recentRuns.every(run => run.provider === "openai")).toBe(true);
  });

  test("filters data by model correctly", async () => {
    // 100 events, 3 models distributed evenly: index % 3
    // claude-3-5-sonnet: 1, 4, 7 ... -> 33 items
    const data = await getMetricsData("24h", "all", "claude-3-5-sonnet", "all");

    expect(data.totals.totalRuns).toBe(33);
    expect(data.recentRuns.every(run => run.model === "claude-3-5-sonnet")).toBe(true);
  });

  test("filters data by status correctly", async () => {
    // 100 events, 4 statuses distributed evenly: index % 4
    // failed: 1, 5, 9 ... -> 25 items
    const data = await getMetricsData("24h", "all", "all", "failed");

    expect(data.totals.totalRuns).toBe(25);
    expect(data.recentRuns.every(run => run.status === "failed")).toBe(true);
  });
});
