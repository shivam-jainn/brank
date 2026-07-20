import { getPrismaClient } from "@/lib/db";
import { getIngestionService } from "@/lib/ingestion-service";
import { withLogging } from "@/lib/logger";

function getRangeConfig(range: string) {
  const now = new Date();
  switch (range) {
    case "1h":
      return {
        startDate: new Date(now.getTime() - 60 * 60 * 1000),
        bucketCount: 60,
      };
    case "3h":
      return {
        startDate: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        bucketCount: 60,
      };
    case "6h":
      return {
        startDate: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        bucketCount: 60,
      };
    case "12h":
      return {
        startDate: new Date(now.getTime() - 12 * 60 * 60 * 1000),
        bucketCount: 60,
      };
    case "24h":
    case "1d":
      return {
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        bucketCount: 24,
      };
    case "7d":
    case "1w":
      return {
        startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        bucketCount: 28, // 4 buckets per day
      };
    case "30d":
    case "1m":
      return {
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        bucketCount: 30, // 1 bucket per day
      };
    default:
      return {
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        bucketCount: 24,
      };
  }
}

export async function getMetricsData(
  range: string = "24h",
  provider: string = "all",
  model: string = "all",
  status: string = "all"
) {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL is required");
  }

  const now = new Date();
  const { startDate, bucketCount } = getRangeConfig(range);
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // We query from whichever is earlier: the start of selected range or 24 hours ago (needed for lastDay trend)
  const queryStartDate = startDate < lastDay ? startDate : lastDay;

  // Build prisma filter conditions
  const eventWhere: any = { emittedAt: { gte: queryStartDate } };
  if (provider && provider !== "all") {
    eventWhere.provider = provider;
  }
  if (model && model !== "all") {
    eventWhere.model = model;
  }
  if (status && status !== "all") {
    eventWhere.status = status;
  }

  const messageWhere: any = {};
  if (provider && provider !== "all") {
    messageWhere.provider = provider;
  }
  if (model && model !== "all") {
    messageWhere.model = model;
  }

  const conversationWhere: any = {};
  if (provider && provider !== "all") {
    conversationWhere.inferenceEvents = {
      some: { provider }
    };
  }
  if (model && model !== "all") {
    conversationWhere.inferenceEvents = {
      ...conversationWhere.inferenceEvents,
      some: {
        ...(conversationWhere.inferenceEvents?.some || {}),
        model
      }
    };
  }
  if (status && status !== "all") {
    conversationWhere.inferenceEvents = {
      ...conversationWhere.inferenceEvents,
      some: {
        ...(conversationWhere.inferenceEvents?.some || {}),
        status
      }
    };
  }

  const recentWhere: any = { emittedAt: { gte: lastHour } };
  if (provider && provider !== "all") {
    recentWhere.provider = provider;
  }
  if (model && model !== "all") {
    recentWhere.model = model;
  }
  if (status && status !== "all") {
    recentWhere.status = status;
  }

  const providerQueryWhere: any = {};
  if (model && model !== "all") {
    providerQueryWhere.model = model;
  }

  const modelQueryWhere: any = {};
  if (provider && provider !== "all") {
    modelQueryWhere.provider = provider;
  }

  const [
    totalEvents,
    completed,
    failed,
    cancelled,
    totalMessages,
    lastHourMessages,
    totalConversations,
    events,
    recent,
    providersList,
    modelsList,
  ] = await Promise.all([
    prisma.inferenceEvent.count({ where: eventWhere }),
    prisma.inferenceEvent.count({ where: { ...eventWhere, status: "completed" } }),
    prisma.inferenceEvent.count({ where: { ...eventWhere, status: "failed" } }),
    prisma.inferenceEvent.count({ where: { ...eventWhere, status: "cancelled" } }),
    prisma.chatMessage.count({ where: messageWhere }),
    prisma.chatMessage.count({ where: { ...messageWhere, createdAt: { gte: lastHour } } }),
    prisma.conversation.count({ where: conversationWhere }),
    prisma.inferenceEvent.findMany({
      where: eventWhere,
      orderBy: { emittedAt: "asc" },
      take: 5000,
      select: {
        provider: true,
        model: true,
        requestId: true,
        traceId: true,
        conversationId: true,
        status: true,
        eventType: true,
        startedAt: true,
        completedAt: true,
        latencyMs: true,
        emittedAt: true,
        receivedAt: true,
        persistedAt: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        previews: true,
        error: true,
        rawEvent: true,
      },
    }),
    prisma.inferenceEvent.findMany({
      where: recentWhere,
      orderBy: { emittedAt: "desc" },
      take: 100,
      select: {
        id: true,
        provider: true,
        model: true,
        requestId: true,
        traceId: true,
        conversationId: true,
        status: true,
        eventType: true,
        startedAt: true,
        completedAt: true,
        latencyMs: true,
        emittedAt: true,
        receivedAt: true,
        persistedAt: true,
        previews: true,
        error: true,
        rawEvent: true,
      },
    }),
    prisma.inferenceEvent.findMany({
      where: providerQueryWhere,
      distinct: ['provider'],
      select: { provider: true },
    }),
    prisma.inferenceEvent.findMany({
      where: modelQueryWhere,
      distinct: ['model'],
      select: { model: true },
    }),
  ]);

  const availableProviders = providersList.map((p) => p.provider);
  const availableModels = modelsList.map((m) => m.model);

  const runs = deriveRuns(events);
  const recentRuns = runs.filter((run) => run.lastEventAt >= lastHour);
  const completedRuns = runs.filter((run) => run.status === "completed");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const cancelledRuns = runs.filter((run) => run.status === "cancelled");
  const activeRuns = runs.filter((run) => run.status === "started");
  const lastHourCompleted = recentRuns.filter((run) => run.status === "completed");
  const lastHourFailed = recentRuns.filter((run) => run.status === "failed");
  const lastHourCancelled = recentRuns.filter((run) => run.status === "cancelled");
  const completedWithLatency = runs.filter((run) => run.latencyMs !== null);
  const avgLatencyMs = completedWithLatency.length
    ? Math.round(
        completedWithLatency.reduce((sum, run) => sum + (run.latencyMs ?? 0), 0) /
          completedWithLatency.length,
      )
    : 0;
  const sortedLatencies = completedWithLatency
    .map((run) => run.latencyMs ?? 0)
    .sort((a, b) => a - b);
  const p95LatencyMs = percentile(sortedLatencies, 0.95);
  const totalTokens = runs.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0);
  const lastHourTokens = recentRuns.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0);
  const runsWithUsage = runs.filter((run) => run.totalTokens !== null).length;
  const lastHourRunsWithUsage = recentRuns.filter((run) => run.totalTokens !== null).length;
  const estimatedTokenRuns = runs.filter((run) => run.usageEstimated).length;
  const exactTokenRuns = runsWithUsage - estimatedTokenRuns;
  const lastHourEstimatedTokenRuns = recentRuns.filter((run) => run.usageEstimated).length;
  const lastHourExactTokenRuns = lastHourRunsWithUsage - lastHourEstimatedTokenRuns;
  const persistedEvents = events.filter((event) => event.receivedAt && event.persistedAt);
  const avgIngestionLagMs = persistedEvents.length
    ? Math.round(
        persistedEvents.reduce(
          (sum, event) => sum + Math.max(0, event.persistedAt.getTime() - event.receivedAt.getTime()),
          0,
        ) / persistedEvents.length,
      )
    : 0;
  const providerMap = new Map<
    string,
    { provider: string; model: string; runs: number; completed: number; failed: number; cancelled: number; active: number; avgLatencyMs: number; tokens: number }
  >();
  const latencySums = new Map<string, number>();
  const latencyCounts = new Map<string, number>();

  for (const run of runs) {
    const key = `${run.provider}:${run.model}`;
    const current =
      providerMap.get(key) ??
      {
        provider: run.provider,
        model: run.model,
        runs: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        active: 0,
        avgLatencyMs: 0,
        tokens: 0,
      };
    current.runs += 1;
    current.completed += run.status === "completed" ? 1 : 0;
    current.failed += run.status === "failed" ? 1 : 0;
    current.cancelled += run.status === "cancelled" ? 1 : 0;
    current.active += run.status === "started" ? 1 : 0;
    current.tokens += run.totalTokens ?? 0;
    providerMap.set(key, current);
    if (run.latencyMs !== null) {
      latencySums.set(key, (latencySums.get(key) ?? 0) + run.latencyMs);
      latencyCounts.set(key, (latencyCounts.get(key) ?? 0) + 1);
    }
  }

  const byProvider = Array.from(providerMap.values())
    .map((item) => {
      const key = `${item.provider}:${item.model}`;
      const count = latencyCounts.get(key) ?? 0;
      return {
        ...item,
        avgLatencyMs: count ? Math.round((latencySums.get(key) ?? 0) / count) : 0,
        errorRate: item.runs ? item.failed / item.runs : 0,
      };
    })
    .sort((a, b) => b.runs - a.runs);

  return {
    pipeline: {
      ...getIngestionService().metrics(),
      persistedEvents: totalEvents,
      avgIngestionLagMs,
    },
    totals: {
      totalRuns: runs.length,
      totalEvents,
      totalMessages,
      totalConversations,
      completedRuns: completedRuns.length,
      failedRuns: failedRuns.length,
      cancelledRuns: cancelledRuns.length,
      activeRuns: activeRuns.length,
      rawCompletedEvents: completed,
      rawFailedEvents: failed,
      rawCancelledEvents: cancelled,
      errorRate: runs.length ? failedRuns.length / runs.length : 0,
      cancellationRate: runs.length ? cancelledRuns.length / runs.length : 0,
      throughputPerMinute: recentRuns.length / 60,
      messageThroughputPerMinute: lastHourMessages / 60,
      tokenThroughputPerMinute: lastHourTokens / 60,
      avgLatencyMs,
      p95LatencyMs,
      totalTokens,
      runsWithUsage,
      exactTokenRuns,
      estimatedTokenRuns,
      lastHour: {
        runs: recentRuns.length,
        messages: lastHourMessages,
        completed: lastHourCompleted.length,
        failed: lastHourFailed.length,
        cancelled: lastHourCancelled.length,
        errorRate: recentRuns.length ? lastHourFailed.length / recentRuns.length : 0,
        cancellationRate: recentRuns.length ? lastHourCancelled.length / recentRuns.length : 0,
        tokens: lastHourTokens,
        runsWithUsage: lastHourRunsWithUsage,
        exactTokenRuns: lastHourExactTokenRuns,
        estimatedTokenRuns: lastHourEstimatedTokenRuns,
      },
    },
    series: {
      perRange: buildTimeSeries(startDate, now, bucketCount, runs),
      perHour: buildTimeSeries(lastDay, now, 24, runs),
    },
    byProvider,
    recent,
    recentRuns: recentRuns
      .sort((a, b) => b.lastEventAt.getTime() - a.lastEventAt.getTime())
      .slice(0, 25),
    availableProviders,
    availableModels,
  };
}

export const GET = withLogging(async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "24h";
  const provider = searchParams.get("provider") || "all";
  const model = searchParams.get("model") || "all";
  const status = searchParams.get("status") || "all";

  const encoder = new TextEncoder();
  const customReadable = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendMetrics = async () => {
        if (isClosed) return;
        try {
          const data = await getMetricsData(range, provider, model, status);
          if (isClosed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          console.error("Error fetching metrics:", error);
          if (!isClosed) {
            controller.enqueue(encoder.encode(`data: {"error": "Failed to fetch metrics"}\n\n`));
          }
        }
      };

      // Send initial data immediately
      await sendMetrics();
      
      const intervalId = setInterval(sendMetrics, 5000);

      request.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(intervalId);
      });
    }
  });

  return new Response(customReadable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

type MetricEvent = {
  provider: string;
  model: string;
  requestId: string | null;
  traceId: string | null;
  conversationId: string | null;
  eventType: string;
  startedAt: Date;
  completedAt: Date | null;
  emittedAt: Date;
  receivedAt: Date;
  persistedAt: Date;
  status: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  rawEvent: JsonValue;
  previews: JsonValue;
  error?: unknown;
};

type InferenceRun = {
  id: string;
  provider: string;
  model: string;
  conversationId: string | null;
  status: string;
  startedAt: Date;
  lastEventAt: Date;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageEstimated: boolean;
  previews?: any;
  eventCount: number;
  error?: unknown;
};

function deriveRuns(events: MetricEvent[]): InferenceRun[] {
  const runs = new Map<string, InferenceRun>();
  const statusRank: Record<string, number> = {
    started: 0,
    completed: 1,
    cancelled: 2,
    failed: 3,
  };

  for (const event of events) {
    const id = event.requestId ?? event.traceId ?? `${event.provider}:${event.model}:${event.startedAt.toISOString()}`;
    const current =
      runs.get(id) ??
      {
        id,
        provider: event.provider,
        model: event.model,
        conversationId: event.conversationId,
        status: "started",
        startedAt: event.startedAt,
        lastEventAt: event.emittedAt,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        usageEstimated: false,
        eventCount: 0,
      };

    current.eventCount += 1;
    current.startedAt = event.startedAt < current.startedAt ? event.startedAt : current.startedAt;
    current.lastEventAt = event.emittedAt > current.lastEventAt ? event.emittedAt : current.lastEventAt;
    current.status =
      (statusRank[event.status] ?? 0) > (statusRank[current.status] ?? 0) ? event.status : current.status;
    current.latencyMs = event.latencyMs ?? current.latencyMs;
    current.inputTokens = event.inputTokens ?? current.inputTokens;
    current.outputTokens = event.outputTokens ?? current.outputTokens;
    current.totalTokens = event.totalTokens ?? current.totalTokens;
    current.usageEstimated = usageIsEstimated(event.rawEvent) || current.usageEstimated;
    current.previews = event.previews ?? current.previews;
    current.error = event.error ?? current.error;
    runs.set(id, current);
  }

  return Array.from(runs.values());
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function usageIsEstimated(rawEvent: JsonValue): boolean {
  if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent) || !("usage" in rawEvent)) {
    return false;
  }

  const usage = rawEvent.usage;
  return Boolean(
    usage &&
      typeof usage === "object" &&
      !Array.isArray(usage) &&
      "estimated" in usage &&
      usage.estimated === true,
  );
}

function buildTimeSeries(start: Date, end: Date, bucketCount: number, runs: InferenceRun[]) {
  const bucketMs = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / bucketCount));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * bucketMs);
    return {
      timestamp: bucketStart.toISOString(),
      label: bucketStart.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }),
      runs: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      avgLatencyMs: 0,
      tokens: 0,
    };
  });
  const latencySums = Array(bucketCount).fill(0) as number[];
  const latencyCounts = Array(bucketCount).fill(0) as number[];

  for (const run of runs) {
    if (run.lastEventAt < start || run.lastEventAt > end) continue;
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((run.lastEventAt.getTime() - start.getTime()) / bucketMs)),
    );
    buckets[index].runs += 1;
    buckets[index].completed += run.status === "completed" ? 1 : 0;
    buckets[index].failed += run.status === "failed" ? 1 : 0;
    buckets[index].cancelled += run.status === "cancelled" ? 1 : 0;
    buckets[index].tokens += run.totalTokens ?? 0;
    if (run.latencyMs !== null) {
      latencySums[index] += run.latencyMs;
      latencyCounts[index] += 1;
    }
  }

  return buckets.map((bucket, index) => ({
    ...bucket,
    avgLatencyMs: latencyCounts[index] ? Math.round(latencySums[index] / latencyCounts[index]) : 0,
    errorRate: bucket.runs ? bucket.failed / bucket.runs : 0,
  }));
}

function percentile(values: number[], target: number) {
  if (values.length === 0) return 0;
  const index = Math.ceil(values.length * target) - 1;
  return values[Math.min(values.length - 1, Math.max(0, index))];
}
