"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CircleIcon,
  GaugeIcon,
  LogsIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Terminal, PanelLeftIcon, X, Copy, Check } from "lucide-react";
import { motion } from "motion/react";
import { AppSidebar } from "../components/app-sidebar";

type TimePoint = {
  timestamp: string;
  label: string;
  runs: number;
  completed: number;
  failed: number;
  cancelled: number;
  avgLatencyMs: number;
  tokens: number;
  errorRate: number;
};

type ProviderMetric = {
  provider: string;
  model: string;
  runs: number;
  completed: number;
  failed: number;
  cancelled: number;
  active: number;
  avgLatencyMs: number;
  tokens: number;
  errorRate: number;
};

type RecentEvent = {
  id: string;
  provider: string;
  model: string;
  status: string;
  eventType: string;
  latencyMs: number | null;
  emittedAt: string;
  previews?: any;
  error: unknown;
  rawEvent?: any;
};

type RecentRun = {
  id: string;
  provider: string;
  model: string;
  conversationId: string | null;
  status: string;
  startedAt: string;
  lastEventAt: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageEstimated: boolean;
  previews?: any;
  eventCount: number;
  error?: unknown;
};

type MetricsResponse = {
  pipeline: {
    received: number;
    processed: number;
    failed: number;
    queued: number;
    retries: number;
    persistedEvents: number;
    avgIngestionLagMs: number;
  };
  totals: {
    totalRuns: number;
    totalEvents: number;
    totalMessages: number;
    totalConversations: number;
    completedRuns: number;
    failedRuns: number;
    cancelledRuns: number;
    activeRuns: number;
    errorRate: number;
    cancellationRate: number;
    throughputPerMinute: number;
    messageThroughputPerMinute: number;
    tokenThroughputPerMinute: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    totalTokens: number;
    runsWithUsage: number;
    exactTokenRuns: number;
    estimatedTokenRuns: number;
    lastHour: {
      runs: number;
      messages: number;
      completed: number;
      failed: number;
      cancelled: number;
      errorRate: number;
      cancellationRate: number;
      tokens: number;
      runsWithUsage: number;
      exactTokenRuns: number;
      estimatedTokenRuns: number;
    };
  };
  series: {
    perMinute: TimePoint[];
    perHour: TimePoint[];
  };
  byProvider: ProviderMetric[];
  recent: RecentEvent[];
  recentRuns: RecentRun[];
};

export function Dashboard() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeDetail, setActiveDetail] = useState<{ type: "run" | "event"; data: any } | null>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/metrics");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
        } else {
          setMetrics(data);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to parse metrics SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      setError("Lost connection to metrics stream.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const recentFailures = useMemo(
    () => metrics?.recent.filter((event) => event.status === "failed").slice(0, 6) ?? [],
    [metrics],
  );
  const activeProvider = metrics?.byProvider[0];
  const successRate = 1 - (metrics?.totals.lastHour.errorRate ?? 0);
  const usageAvailable = Boolean(metrics?.totals.lastHour.runsWithUsage);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[#212121]">
      <AppSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <motion.main 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        <header className="z-20 flex h-14 shrink-0 items-center justify-between px-3 md:px-4 border-b border-white/10 bg-[#212121]">
          <div className="flex items-center gap-1">
            {!sidebarOpen && (
              <button
                aria-label="Expand sidebar"
                className="rounded-lg p-2 text-[#b4b4b4] transition-colors hover:bg-white/10 hover:text-white md:hidden"
                onClick={() => setSidebarOpen(true)}
                type="button"
              >
                <PanelLeftIcon className="size-4" />
              </button>
            )}
            <h1 className="text-sm font-semibold text-[#ececec]">Dashboard</h1>
          </div>
        </header>

        <div className="h-full min-h-0 overflow-y-auto text-[#ececec]">
          <section className="min-h-0">
            <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-4 md:px-6 lg:px-8">
              <header className="flex flex-col gap-4 rounded-lg border border-white/8 bg-[#171717] px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-1 hidden size-2 rounded-full bg-[#74a742] shadow-[0_0_20px_rgba(116,167,66,0.65)] md:block" />
                  <div>
                    <p className="text-xs text-[#8b8b8b]">Each LLM run is one streamed model call. Telemetry events are the SDK logs emitted during that run.</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-normal text-[#ececec] md:text-[32px]">
                      Inference operations dashboard
                    </h1>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HealthBadge value={successRate} />
                </div>
              </header>

              {error && (
                <div className="rounded-md border border-[#ff6b57]/35 bg-[#3a1714] px-4 py-3 text-sm text-[#ffd7d0]">
                  {error}
                </div>
              )}

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Stat label="LLM calls" value={(metrics?.totals.lastHour.runs ?? 0).toLocaleString()} detail={`${(metrics?.totals.throughputPerMinute ?? 0).toFixed(2)} calls/min over 60m`} icon={<ActivityIcon className="size-4" />} />
                <Stat label="Chat messages" value={(metrics?.totals.lastHour.messages ?? 0).toLocaleString()} detail={`${(metrics?.totals.messageThroughputPerMinute ?? 0).toFixed(2)} messages/min`} icon={<MessageSquareIcon className="size-4" />} />
                <Stat label="Latency" value={formatMs(metrics?.totals.avgLatencyMs)} detail={`p95 ${formatMs(metrics?.totals.p95LatencyMs)} on completed calls`} icon={<GaugeIcon className="size-4" />} />
                <Stat label="Cancelled streams" value={(metrics?.totals.lastHour.cancelled ?? 0).toLocaleString()} detail={`${formatPercent(metrics?.totals.lastHour.cancellationRate)} stopped mid-stream`} icon={<SquareIcon className="size-4" />} intent="warn" />
                <Stat label="Failed calls" value={formatPercent(metrics?.totals.lastHour.errorRate)} detail={`${metrics?.totals.failedRuns ?? 0} failed calls total`} icon={<AlertTriangleIcon className="size-4" />} intent="bad" />
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Definition label="LLM calls/min" value="Completed, failed, cancelled, and in-flight model invocations per minute." />
                <Definition label="Messages/min" value="Persisted chat messages, separate from provider calls." />
                <Definition label="Tokens/min" value={usageAvailable ? `${(metrics?.totals.tokenThroughputPerMinute ?? 0).toFixed(1)} tokens/min; ${metrics?.totals.lastHour.exactTokenRuns ?? 0} exact, ${metrics?.totals.lastHour.estimatedTokenRuns ?? 0} estimated runs.` : "Estimated fallback will appear after the next completed or cancelled stream."} />
                <Definition label="Pipeline count" value={`${metrics?.pipeline.persistedEvents ?? 0} persisted telemetry events, ${metrics?.totals.totalRuns ?? 0} derived LLM runs.`} />
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Panel
                  kicker="last 60 minutes"
                  title="LLM calls over time"
                  action={`${metrics?.totals.lastHour.completed ?? 0} completed runs`}
                >
                  <TrafficChart data={metrics?.series.perMinute ?? []} />
                </Panel>

                <div className="grid gap-5">
                  <Panel kicker="top model" title="Provider health">
                    {activeProvider ? <ProviderHero item={activeProvider} /> : <EmptyState text="No provider activity yet." />}
                  </Panel>
                  <Panel kicker="ingestion" title="Pipeline">
                    <div className="grid grid-cols-2 gap-2">
                      <MiniMetric label="Telemetry events" value={metrics?.pipeline.persistedEvents ?? 0} />
                      <MiniMetric label="Derived runs" value={metrics?.totals.totalRuns ?? 0} />
                      <MiniMetric label="Chat messages" value={metrics?.totals.totalMessages ?? 0} />
                      <MiniMetric label="Conversations" value={metrics?.totals.totalConversations ?? 0} />
                      <MiniMetric label="Avg ingest lag" value={formatMs(metrics?.pipeline.avgIngestionLagMs)} />
                      <MiniMetric label="Queue / retries" value={`${metrics?.pipeline.queued ?? 0} / ${metrics?.pipeline.retries ?? 0}`} />
                    </div>
                  </Panel>
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel kicker="24 hours" title="Run volume trend">
                  <CompactBars data={metrics?.series.perHour ?? []} />
                </Panel>
                <Panel kicker="recent runs" title="Latest model calls">
                  <RunList runs={metrics?.recentRuns ?? []} onSelectRun={(run) => setActiveDetail({ type: "run", data: run })} />
                </Panel>
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel kicker="token usage" title="Provider usage accounting">
                  <UsagePanel metrics={metrics} />
                </Panel>
                <Panel kicker="failures" title="Failed model calls">
                  <ErrorList events={recentFailures} onSelectEvent={(event) => setActiveDetail({ type: "event", data: event })} />
                </Panel>
              </section>

              <section className="mt-8 border-t border-white/10 pt-8">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-[#ececec]">Live Ingestion Console</h3>
                    <p className="text-xs text-[#8b8b8b] mt-1">Real-time telemetry written to pipeline</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#171717] px-2.5 py-1 text-xs text-[#8b8b8b] shadow-sm">
                    <Terminal className="size-3.5" />
                    <span>{metrics?.recent.length ?? 0} events</span>
                  </span>
                </div>
                <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2">
                  <LogList events={metrics?.recent ?? []} onSelectEvent={(event) => setActiveDetail({ type: "event", data: event })} />
                </div>
              </section>
            </div>
          </section>
        </div>

        <DetailDrawer detail={activeDetail} onClose={() => setActiveDetail(null)} />
      </motion.main>
    </div>
  );
}

function HealthBadge({ value }: { value: number }) {
  const healthy = value >= 0.99;
  return (
    <div className="hidden h-9 items-center gap-2 rounded-md border border-white/10 bg-[#101112] px-3 text-sm text-[#d9d8d2] md:inline-flex">
      <CircleIcon className={`size-2 fill-current ${healthy ? "text-[#74a742]" : "text-[#ffb85c]"}`} />
      {formatPercent(value)} success
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
  intent = "default",
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  intent?: "default" | "bad" | "warn";
}) {
  const iconClass =
    intent === "bad"
      ? "bg-[#3a1714] text-[#ff8a7a]"
      : intent === "warn"
        ? "bg-[#33240f] text-[#ffbf69]"
        : "bg-[#232a1d] text-[#74a742]";

  return (
    <div className="rounded-lg border border-white/8 bg-[#191a1b] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#a9aaa7]">{label}</p>
        <div className={`flex size-8 items-center justify-center rounded-md ${iconClass}`}>
          {icon}
        </div>
      </div>
      <p className="mt-5 text-[28px] font-semibold leading-none tracking-normal">{value}</p>
      <p className="mt-2 text-xs text-[#7d7f79]">{detail}</p>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-[#252525] px-4 py-3">
      <p className="text-xs font-medium text-[#74a742]">{label}</p>
      <p className="mt-1 text-sm leading-5 text-[#bfc0bc]">{value}</p>
    </div>
  );
}

function Panel({
  kicker,
  title,
  action,
  children,
}: {
  kicker: string;
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/8 bg-[#191a1b] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#7d7f79]">{kicker}</p>
          <h2 className="mt-1 text-base font-semibold text-[#f3f1ea]">{title}</h2>
        </div>
        {action && <span className="rounded-md bg-white/6 px-2 py-1 text-xs text-[#bfc0bc]">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function TrafficChart({ data }: { data: TimePoint[] }) {
  const maxRuns = Math.max(1, ...data.map((point) => point.runs));
  const maxLatency = Math.max(1, ...data.map((point) => point.avgLatencyMs));
  const linePoints = data
    .map((point, index) => {
      const x = (index / Math.max(1, data.length - 1)) * 100;
      const y = 34 - (point.avgLatencyMs / maxLatency) * 28;
      return `${x},${y}`;
    })
    .join(" ");

  if (!data.length) return <EmptyState text="Waiting for model-call telemetry." />;

  return (
    <div className="grid gap-4">
      <div className="relative h-[320px] rounded-md border border-white/8 bg-[#212121] p-4">
        <div className="absolute inset-x-4 top-4 bottom-10 grid grid-rows-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="border-t border-white/[0.06]" key={index} />
          ))}
        </div>
        <div className="absolute inset-x-4 bottom-10 top-4 flex items-end gap-1">
          {data.map((point) => (
            <div className="group relative flex h-full min-w-0 flex-1 items-end" key={point.timestamp}>
              <div
                className="w-full rounded-t-[2px] bg-[#74a742]/70 transition group-hover:bg-[#74a742]"
                style={{ height: `${point.runs ? Math.max(3, (point.runs / maxRuns) * 100) : 1}%` }}
              />
              {point.failed > 0 && (
                <div
                  className="absolute bottom-0 w-full rounded-t-[2px] bg-[#ff6b57]"
                  style={{ height: `${Math.max(4, (point.failed / maxRuns) * 100)}%` }}
                />
              )}
              <Tooltip point={point} />
            </div>
          ))}
        </div>
        <svg className="absolute inset-x-4 bottom-10 top-4 h-[calc(100%-56px)] w-[calc(100%-32px)] overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 36">
          <polyline
            fill="none"
            points={linePoints}
            stroke="#7db1ff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="absolute inset-x-4 bottom-3 flex items-center justify-between text-xs text-[#7d7f79]">
          <span>{new Date(data[0]?.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <div className="flex items-center gap-4">
            <Legend color="#d7ff73" label="Runs" />
            <Legend color="#7db1ff" label="Latency" />
            <Legend color="#ff6b57" label="Errors" />
          </div>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}

function Tooltip({ point }: { point: TimePoint }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-md border border-white/10 bg-[#0b0c0d] p-2 text-xs text-[#d9d8d2] shadow-xl group-hover:block">
      <p className="font-medium text-white">{point.label}</p>
      <p>Model calls: {point.runs}</p>
      <p>Completed: {point.completed}</p>
      <p>Failed: {point.failed}</p>
      <p>Avg latency: {formatMs(point.avgLatencyMs)}</p>
    </div>
  );
}

function ProviderHero({ item }: { item: ProviderMetric }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-white/8 bg-[#212121] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold capitalize">{item.provider}</p>
            <p className="mt-1 truncate text-sm text-[#a9aaa7]">{item.model}</p>
          </div>
          <span className="rounded-md bg-[#74a742] px-2 py-1 text-xs font-medium text-[#10140d]">
            {item.runs} runs
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Avg latency" value={formatMs(item.avgLatencyMs)} />
        <MiniMetric label="Failure rate" value={formatPercent(item.errorRate)} />
        <MiniMetric label="Cancelled" value={item.cancelled.toLocaleString()} />
      </div>
    </div>
  );
}

function RunList({ runs, onSelectRun }: { runs: RecentRun[]; onSelectRun: (run: RecentRun) => void }) {
  if (!runs.length) {
    return (
      <div className="flex min-h-[184px] items-center justify-center rounded-md border border-white/8 bg-[#212121] text-sm text-[#7d7f79]">
        No model calls have been recorded in the last hour.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-white/8">
      <div className="grid grid-cols-[1fr_92px_92px_80px] bg-[#212121] px-3 py-2 text-xs text-[#7d7f79]">
        <span>Provider / model</span>
        <span>Status</span>
        <span>Latency</span>
        <span>Tokens</span>
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {runs.map((run) => (
          <div
            onClick={() => onSelectRun(run)}
            className="grid grid-cols-[1fr_92px_92px_80px] items-center border-t border-white/8 px-3 py-2 text-sm hover:bg-white/5 cursor-pointer transition-colors"
            key={run.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{run.provider}</p>
              <p className="truncate text-xs text-[#7d7f79]">{run.model}</p>
            </div>
            <StatusPill status={run.status} />
            <span className="text-[#bfc0bc]">{run.latencyMs === null ? "-" : formatMs(run.latencyMs)}</span>
            <span className="text-[#bfc0bc]">
              {run.totalTokens === null ? "-" : `${run.totalTokens.toLocaleString()}${run.usageEstimated ? "*" : ""}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === "completed"
      ? "bg-[#1f2d17] text-[#74a742]"
      : status === "cancelled"
        ? "bg-[#33240f] text-[#ffbf69]"
        : status === "failed"
          ? "bg-[#3a1714] text-[#ff8a7a]"
          : "bg-white/8 text-[#bfc0bc]";

  return <span className={`w-fit rounded-md px-2 py-1 text-xs ${className}`}>{status}</span>;
}

function UsagePanel({ metrics }: { metrics: MetricsResponse | null }) {
  const totalRuns = metrics?.totals.totalRuns ?? 0;
  const runsWithUsage = metrics?.totals.runsWithUsage ?? 0;
  const coverage = totalRuns ? runsWithUsage / totalRuns : 0;
  const usageAvailable = runsWithUsage > 0;
  const exact = metrics?.totals.exactTokenRuns ?? 0;
  const estimated = metrics?.totals.estimatedTokenRuns ?? 0;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Total tokens" value={usageAvailable ? (metrics?.totals.totalTokens ?? 0).toLocaleString() : "pending"} />
        <MiniMetric label="Tokens/min" value={usageAvailable ? (metrics?.totals.tokenThroughputPerMinute ?? 0).toFixed(1) : "pending"} />
        <MiniMetric label="Usage coverage" value={formatPercent(coverage)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Provider exact runs" value={exact.toLocaleString()} />
        <MiniMetric label="Estimated runs" value={estimated.toLocaleString()} />
      </div>
      <div className="rounded-md border border-white/8 bg-[#212121] p-3 text-sm leading-5 text-[#bfc0bc]">
        {usageAvailable
          ? "Token metrics use provider-reported usage when available. If a provider omits usage, the SDK estimates input/output tokens from the prompt and streamed text; estimated rows are marked with *."
          : "Token accounting starts after the next completed or cancelled stream. Provider usage is preferred; fallback estimates are recorded when usage is missing."}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/8 bg-[#212121] p-3">
      <p className="text-xs text-[#7d7f79]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#f3f1ea]">{value}</p>
    </div>
  );
}

function CompactBars({ data }: { data: TimePoint[] }) {
  const maxRuns = Math.max(1, ...data.map((point) => point.runs));

  if (!data.length) return <EmptyState text="Waiting for hourly run data." />;

  return (
    <div className="flex h-[184px] items-end gap-2 rounded-md border border-white/8 bg-[#212121] p-4">
      {data.map((point) => (
        <div className="group relative flex h-full flex-1 items-end" key={point.timestamp}>
          <div
            className="w-full rounded-t-sm bg-[#74a742]/55 group-hover:bg-[#74a742]"
            style={{ height: `${point.runs ? Math.max(3, (point.runs / maxRuns) * 100) : 1}%` }}
          />
          {point.failed > 0 && <div className="absolute bottom-0 h-1.5 w-full rounded-t-sm bg-[#ff6b57]" />}
          <Tooltip point={point} />
        </div>
      ))}
    </div>
  );
}

function ErrorList({ events, onSelectEvent }: { events: RecentEvent[]; onSelectEvent: (event: RecentEvent) => void }) {
  if (!events.length) {
    return (
      <div className="flex min-h-[184px] items-center justify-center rounded-md border border-white/8 bg-[#212121] text-sm text-[#7d7f79]">
        No failed model calls in the recent window.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {events.map((event) => (
        <div
          onClick={() => onSelectEvent(event)}
          className="rounded-md border border-[#ff6b57]/25 bg-[#2a1412] p-3 cursor-pointer hover:bg-[#341816] transition-colors"
          key={event.id}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">
              {event.provider} / {event.model}
            </p>
            <span className="shrink-0 text-xs text-[#a9aaa7]">
              {new Date(event.emittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[#ffb8ad]">{describeError(event.error)}</p>
        </div>
      ))}
    </div>
  );
}

function LogList({ events, onSelectEvent }: { events: RecentEvent[]; onSelectEvent: (event: RecentEvent) => void }) {
  if (!events.length) {
    return <EmptyState text="No telemetry logs have been recorded in the last hour." />;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          onClick={() => onSelectEvent(event)}
          className="flex flex-col md:flex-row md:items-center justify-between rounded border border-white/10 bg-[#191a1b] p-3 font-mono text-xs transition-all shadow-sm hover:border-white/20 hover:bg-[#1f2022] gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 shrink-0 rounded-full ${event.provider === "openai" ? "bg-[#10a37f]" :
                event.provider === "anthropic" ? "bg-[#cc9b7a]" :
                  event.provider === "groq" ? "bg-[#f55036]" :
                    event.provider === "gemini" ? "bg-[#4285f4]" : "bg-[#74a742]"
              }`} />
            <span className="font-semibold text-[#f3f1ea]">{event.id.slice(0, 8)}</span>
            <span className="text-[#7d7f79]">/</span>
            <span className="truncate text-[#a9aaa7]">{event.provider}:{event.model}</span>
          </div>

          <div className="flex items-center gap-4 text-[#bfc0bc]">
            <span className="inline-flex items-center gap-1.5">
              <LogsIcon className="size-3.5 text-[#7db1ff]" />
              {event.eventType}
            </span>
            <StatusPill status={event.status} />
            <span className="text-[10px] text-[#7d7f79] w-[60px] text-right">
              {new Date(event.emittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-white/10 bg-[#111213] p-6 text-center text-sm text-[#7d7f79]">
      {text}
    </div>
  );
}

function formatMs(value?: number) {
  return `${Math.round(value ?? 0).toLocaleString()} ms`;
}

function formatPercent(value?: number) {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function describeError(error: unknown) {
  if (!error) return "No error payload recorded";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return JSON.stringify(error);
}

function DetailDrawer({
  detail,
  onClose,
}: {
  detail: { type: "run" | "event"; data: any } | null;
  onClose: () => void;
}) {
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  useEffect(() => {
    setCopiedInput(false);
    setCopiedOutput(false);
  }, [detail]);

  if (!detail) return null;

  const data = detail.data;
  const isRun = detail.type === "run";

  const handleCopy = async (text: string, isInput: boolean) => {
    await navigator.clipboard.writeText(text);
    if (isInput) {
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 2000);
    } else {
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  const previewInput = data.previews?.input ?? (isRun ? "" : data.rawEvent?.previews?.input) ?? "";
  const previewOutput = data.previews?.output ?? (isRun ? "" : data.rawEvent?.previews?.output) ?? "";
  const isDisabled = data.previews?.disabled ?? false;
  const redactionCount = data.previews?.redactionCount ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/10 bg-[#161718]/95 p-6 shadow-2xl backdrop-blur-md transition-all duration-300">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#74a742]">
              {detail.type} telemetry details
            </span>
            <h2 className="text-lg font-bold text-[#ececec]">
              {data.provider} / {data.model}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-[#8b8b8b] hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 space-y-6 text-sm">
          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md border border-white/5 bg-white/5 p-3">
              <span className="text-xs text-[#8b8b8b]">Status</span>
              <div className="mt-1">
                <StatusPill status={data.status} />
              </div>
            </div>
            <div className="rounded-md border border-white/5 bg-white/5 p-3">
              <span className="text-xs text-[#8b8b8b]">Latency</span>
              <p className="mt-1 font-mono text-base font-semibold text-[#ececec]">
                {data.latencyMs !== null ? `${data.latencyMs} ms` : "-"}
              </p>
            </div>
            <div className="rounded-md border border-white/5 bg-white/5 p-3">
              <span className="text-xs text-[#8b8b8b]">Tokens (In / Out / Total)</span>
              <p className="mt-1 font-mono text-base font-semibold text-[#ececec]">
                {isRun
                  ? `${data.inputTokens ?? "-"} / ${data.outputTokens ?? "-"} / ${data.totalTokens ?? "-"}${data.usageEstimated ? "*" : ""}`
                  : `${data.rawEvent?.usage?.input ?? "-"} / ${data.rawEvent?.usage?.output ?? "-"} / ${data.rawEvent?.usage?.total ?? "-"}${data.rawEvent?.usage?.estimated ? "*" : ""}`}
              </p>
            </div>
            <div className="rounded-md border border-white/5 bg-white/5 p-3">
              <span className="text-xs text-[#8b8b8b]">Redactions Count</span>
              <p className="mt-1 font-mono text-base font-semibold text-[#ffbf69]">
                {redactionCount}
              </p>
            </div>
          </div>

          {/* Identifiers */}
          <div className="rounded-md border border-white/5 bg-white/5 p-4 space-y-2">
            <h4 className="font-semibold text-xs text-[#8b8b8b] uppercase tracking-wider">Identifiers</h4>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="truncate">
                <span className="text-[#8b8b8b]">ID:</span> <span className="text-[#bfc0bc]">{data.id}</span>
              </div>
              {data.conversationId && (
                <div className="truncate">
                  <span className="text-[#8b8b8b]">Conversation ID:</span> <span className="text-[#bfc0bc]">{data.conversationId}</span>
                </div>
              )}
              {data.requestId && (
                <div className="truncate">
                  <span className="text-[#8b8b8b]">Request ID:</span> <span className="text-[#bfc0bc]">{data.requestId}</span>
                </div>
              )}
              {data.traceId && (
                <div className="truncate">
                  <span className="text-[#8b8b8b]">Trace ID:</span> <span className="text-[#bfc0bc]">{data.traceId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Errors section */}
          {data.error && (
            <div className="rounded-md border border-red-500/20 bg-red-950/20 p-4">
              <h4 className="font-semibold text-xs text-red-400 uppercase tracking-wider mb-2">Error Payload</h4>
              <pre className="font-mono text-xs text-red-300 whitespace-pre-wrap">
                {describeError(data.error)}
              </pre>
            </div>
          )}

          {/* Input & Output Previews */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b8b8b]">Redacted Input Preview</h3>
                {previewInput && !isDisabled && (
                  <button
                    onClick={() => handleCopy(previewInput, true)}
                    className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-[#bfc0bc] hover:bg-white/10 hover:text-white"
                  >
                    {copiedInput ? <Check className="size-3" /> : <Copy className="size-3" />}
                    <span>{copiedInput ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>
              <div className="rounded-md border border-white/10 bg-[#101112] p-3 font-mono text-xs text-[#a9aaa7] whitespace-pre-wrap max-h-60 overflow-y-auto">
                {isDisabled ? (
                  <span className="italic text-[#7d7f79]">Telemetry previews disabled for this run.</span>
                ) : previewInput ? (
                  previewInput
                ) : (
                  <span className="italic text-[#7d7f79]">No input preview recorded.</span>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b8b8b]">Redacted Output Preview</h3>
                {previewOutput && !isDisabled && (
                  <button
                    onClick={() => handleCopy(previewOutput, false)}
                    className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-[#bfc0bc] hover:bg-white/10 hover:text-white"
                  >
                    {copiedOutput ? <Check className="size-3" /> : <Copy className="size-3" />}
                    <span>{copiedOutput ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>
              <div className="rounded-md border border-white/10 bg-[#101112] p-3 font-mono text-xs text-[#a9aaa7] whitespace-pre-wrap max-h-60 overflow-y-auto">
                {isDisabled ? (
                  <span className="italic text-[#7d7f79]">Telemetry previews disabled for this run.</span>
                ) : previewOutput ? (
                  previewOutput
                ) : (
                  <span className="italic text-[#7d7f79]">No output preview recorded.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

