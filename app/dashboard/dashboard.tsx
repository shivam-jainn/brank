"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  Check,
  CircleIcon,
  Copy,
  GaugeIcon,
  LogsIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  SquareIcon,
  Terminal,
  X
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "../components/app-sidebar";
import { FilterBar } from "./components/filter-bar";
import { ProviderMetricsList } from "./components/provider-metrics-list";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

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
  requestId?: string | null;
  traceId?: string | null;
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
    perRange: TimePoint[];
    perHour: TimePoint[];
  };
  byProvider: ProviderMetric[];
  recent: RecentEvent[];
  recentRuns: RecentRun[];
  availableProviders?: string[];
  availableModels?: string[];
};

export function Dashboard() {
  const [timeRange, setTimeRange] = useState<string>("24h");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeDetail, setActiveDetail] = useState<{ type: "run" | "event" | "grouped-request"; data: any } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      range: timeRange,
      provider: providerFilter,
      model: modelFilter,
      status: statusFilter,
    });
    const eventSource = new EventSource(`/api/metrics?${params.toString()}`);

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
  }, [timeRange, providerFilter, modelFilter, statusFilter]);

  const recentFailures = useMemo(
    () => metrics?.recent.filter((event) => event.status === "failed").slice(0, 6) ?? [],
    [metrics],
  );
  const activeProvider = metrics?.byProvider[0];
  const successRate = 1 - (metrics?.totals.errorRate ?? 0);
  const rangeLabel = useMemo(() => {
    switch (timeRange) {
      case "1h": return "1 hour";
      case "3h": return "3 hours";
      case "6h": return "6 hours";
      case "12h": return "12 hours";
      case "24h": return "24 hours";
      case "7d": return "7 days";
      case "30d": return "30 days";
      default: return "selected range";
    }
  }, [timeRange]);
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
            <div className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-2 md:px-6 lg:px-8">


              {/* Filter Bar */}
              <FilterBar
                timeRange={timeRange}
                setTimeRange={setTimeRange}
                providerFilter={providerFilter}
                setProviderFilter={setProviderFilter}
                modelFilter={modelFilter}
                setModelFilter={setModelFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                availableProviders={metrics?.availableProviders}
                availableModels={metrics?.availableModels}
                successRate={successRate}
              />

              {error && (
                <div className="rounded-md border border-[#ff6b57]/35 bg-[#3a1714] px-4 py-3 text-sm text-[#ffd7d0]">
                  {error}
                </div>
              )}

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Stat label="LLM calls" value={(metrics?.totals.totalRuns ?? 0).toLocaleString()} detail={`total over last ${rangeLabel}`} icon={<ActivityIcon className="size-4" />} />
                <Stat label="Chat messages" value={(metrics?.totals.totalMessages ?? 0).toLocaleString()} detail={`total over last ${rangeLabel}`} icon={<MessageSquareIcon className="size-4" />} />
                <Stat label="Latency" value={formatMs(metrics?.totals.avgLatencyMs)} detail={`p95 ${formatMs(metrics?.totals.p95LatencyMs)} on completed calls`} icon={<GaugeIcon className="size-4" />} />
                <Stat label="Cancelled streams" value={(metrics?.totals.cancelledRuns ?? 0).toLocaleString()} detail={`${formatPercent(metrics?.totals.cancellationRate)} cancellation rate`} icon={<SquareIcon className="size-4" />} intent="warn" />
                <Stat label="Failed calls" value={(metrics?.totals.failedRuns ?? 0).toLocaleString()} detail={`${formatPercent(metrics?.totals.errorRate)} error rate`} icon={<AlertTriangleIcon className="size-4" />} intent="bad" />
              </section>


              <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Panel
                  kicker={
                    timeRange === "1h" ? "last hour" :
                      timeRange === "3h" ? "last 3 hours" :
                        timeRange === "6h" ? "last 6 hours" :
                          timeRange === "12h" ? "last 12 hours" :
                            timeRange === "24h" ? "last 24 hours" :
                              timeRange === "7d" ? "last 7 days" : "last 30 days"
                  }
                  title="LLM calls over time"
                  action={`${metrics?.totals.completedRuns ?? 0} completed runs`}
                >
                  <TrafficChart data={metrics?.series.perRange ?? []} timeRange={timeRange} />
                </Panel>

                <div className="grid gap-5">
                  <Panel kicker="provider metrics" title="Provider health">
                    <ProviderMetricsList items={metrics?.byProvider ?? []} />
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
                  <div className="max-h-[260px] overflow-y-auto pr-1">
                    <ErrorList events={recentFailures} onSelectEvent={(event) => setActiveDetail({ type: "event", data: event })} />
                  </div>
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
                  <LogList
                    events={metrics?.recent ?? []}
                    onSelectEvent={(event) => setActiveDetail({ type: "event", data: event })}
                    onSelectRequest={(request) => setActiveDetail({ type: "grouped-request", data: request })}
                  />
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
    <div className="rounded-lg border border-white/8 bg-[#191a1b] p-3 md:p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#a9aaa7]">{label}</p>
        <div className={`flex size-8 items-center justify-center rounded-md ${iconClass}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3.5 text-[28px] font-semibold leading-none tracking-normal">{value}</p>
      <p className="mt-1.5 text-xs text-[#7d7f79]">{detail}</p>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-[#252525] px-3.5 py-2.5">
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
  className,
}: {
  kicker: string;
  title: string;
  action?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-lg border border-white/8 bg-[#191a1b] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ${className || ""}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#7d7f79]">{kicker}</p>
          <h2 className="mt-1 text-base font-semibold text-[#f3f1ea]">{title}</h2>
        </div>
        {action && <span className="rounded-md bg-white/6 px-2 py-1 text-xs text-[#bfc0bc]">{action}</span>}
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </section>
  );
}

const trafficChartConfig = {
  completed: {
    label: "Completed Runs",
    color: "#74a742",
  },
  failed: {
    label: "Failed Runs",
    color: "#ff6b57",
  },
  cancelled: {
    label: "Cancelled Runs",
    color: "#ffbf69",
  },
  avgLatencyMs: {
    label: "Avg Latency (ms)",
    color: "#7db1ff",
  },
} satisfies ChartConfig;

function TrafficChart({ data, timeRange }: { data: TimePoint[]; timeRange: string }) {
  if (!data.length) return <EmptyState text="Waiting for model-call telemetry." />;

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <ChartContainer config={trafficChartConfig} className="aspect-auto flex-1 min-h-[320px] w-full bg-[#191a1b] p-4 rounded-md border border-white/8">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-white/[0.06]" />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => {
              const date = new Date(value);
              if (timeRange === "7d" || timeRange === "30d") {
                return date.toLocaleDateString([], { month: "short", day: "numeric" });
              }
              return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            }}
            className="text-[10px] fill-[#7d7f79]"
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[10px] fill-[#7d7f79]"
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-[10px] fill-[#7d7f79]"
            tickFormatter={(value) => `${Math.round(value)}ms`}
          />
          <ChartTooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    return payload[0].payload.label || new Date(payload[0].payload.timestamp).toLocaleTimeString();
                  }
                  return label;
                }}
              />
            }
          />
          <Bar yAxisId="left" dataKey="completed" stackId="a" fill="var(--color-completed)" radius={[0, 0, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="left" dataKey="cancelled" stackId="a" fill="var(--color-cancelled)" radius={[0, 0, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="left" dataKey="failed" stackId="a" fill="var(--color-failed)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgLatencyMs"
            stroke="var(--color-avgLatencyMs)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </ComposedChart>
      </ChartContainer>
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

const compactChartConfig = {
  runs: {
    label: "Total Runs",
    color: "#74a742",
  },
  failed: {
    label: "Failed Runs",
    color: "#ff6b57",
  },
} satisfies ChartConfig;

function CompactBars({ data }: { data: TimePoint[] }) {
  if (!data.length) return <EmptyState text="Waiting for hourly run data." />;

  return (
    <div className="w-full flex-1 min-h-[180px] flex flex-col">
      <ChartContainer config={compactChartConfig} className="aspect-auto h-full w-full bg-[#191a1b] p-3 rounded-md border border-white/8">
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-white/[0.06]" />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit" })}
            className="text-[9px] fill-[#7d7f79]"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            className="text-[9px] fill-[#7d7f79]"
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    return payload[0].payload.label || new Date(payload[0].payload.timestamp).toLocaleTimeString();
                  }
                  return label;
                }}
              />
            }
          />
          <Bar dataKey="runs" fill="var(--color-runs)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
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
    <div className="grid gap-2 w-full min-w-0 overflow-hidden">
      {events.map((event) => (
        <div
          onClick={() => onSelectEvent(event)}
          className="w-full min-w-0 rounded-md border border-[#ff6b57]/25 bg-[#2a1412] p-3 cursor-pointer hover:bg-[#341816] transition-colors"
          key={event.id}
        >
          <div className="flex items-center justify-between gap-3 min-w-0 w-full">
            <p className="min-w-0 truncate text-sm font-medium text-[#f3f1ea]">
              {event.provider} / {event.model}
            </p>
            <span className="shrink-0 text-[10px] font-mono text-[#a9aaa7]">
              {new Date(event.emittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-[#ffb8ad] whitespace-normal break-words leading-relaxed line-clamp-2">
            {describeError(event.error)}
          </p>
        </div>
      ))}
    </div>
  );
}

type GroupedRequest = {
  requestId: string;
  provider: string;
  model: string;
  status: string;
  latencyMs: number | null;
  emittedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: any;
  events: RecentEvent[];
};

function LogList({
  events,
  onSelectEvent,
  onSelectRequest,
}: {
  events: RecentEvent[];
  onSelectEvent: (event: RecentEvent) => void;
  onSelectRequest: (request: GroupedRequest) => void;
}) {
  const groupedRequests = useMemo(() => {
    const groups: Record<string, GroupedRequest> = {};

    // Sort events ascending so timeline flows chronologically
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.emittedAt).getTime() - new Date(b.emittedAt).getTime()
    );

    for (const event of sortedEvents) {
      const reqId = event.requestId || event.traceId || event.id;
      if (!groups[reqId]) {
        groups[reqId] = {
          requestId: reqId,
          provider: event.provider,
          model: event.model,
          status: event.status,
          latencyMs: event.latencyMs,
          emittedAt: event.emittedAt,
          startedAt: event.eventType === "started" ? event.emittedAt : null,
          completedAt: (event.status === "completed" || event.status === "failed" || event.status === "cancelled") ? event.emittedAt : null,
          error: event.error,
          events: [],
        };
      }

      groups[reqId].events.push(event);
      groups[reqId].status = event.status;
      if (event.latencyMs !== null) {
        groups[reqId].latencyMs = event.latencyMs;
      }
      if (event.error) {
        groups[reqId].error = event.error;
      }
      if (event.eventType === "started") {
        groups[reqId].startedAt = event.emittedAt;
      }
      if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
        groups[reqId].completedAt = event.emittedAt;
      }
      groups[reqId].emittedAt = event.emittedAt;
    }

    return Object.values(groups).sort(
      (a, b) => new Date(b.emittedAt).getTime() - new Date(a.emittedAt).getTime()
    );
  }, [events]);

  if (!groupedRequests.length) {
    return <EmptyState text="No telemetry logs have been recorded in the last hour." />;
  }

  return (
    <div className="space-y-3">
      {groupedRequests.map((request) => {
        const durationMs = request.latencyMs ?? (request.startedAt && request.completedAt
          ? new Date(request.completedAt).getTime() - new Date(request.startedAt).getTime()
          : null);

        return (
          <div
            key={request.requestId}
            onClick={() => onSelectRequest(request)}
            className="rounded-lg border border-white/8 bg-[#191a1b] p-3.5 transition-all shadow-sm hover:border-white/15 min-w-0 w-full flex flex-col gap-3 cursor-pointer hover:bg-[#1f2022]"
          >
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0 w-full">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${request.status === "completed" ? "bg-[#74a742] shadow-[0_0_8px_rgba(116,167,66,0.4)]" :
                    request.status === "failed" ? "bg-[#ff6b57] shadow-[0_0_8px_rgba(255,107,87,0.4)]" :
                      request.status === "cancelled" ? "bg-[#ffbf69] shadow-[0_0_8px_rgba(255,191,105,0.4)]" :
                        "bg-[#7db1ff] animate-pulse"
                    }`}
                />
                <span className="font-mono text-xs font-semibold text-[#f3f1ea] shrink-0">
                  {request.requestId.slice(0, 8)}
                </span>
                <span className="text-[#555] shrink-0">|</span>
                <span className="truncate text-xs font-medium text-[#a9aaa7]">
                  {request.provider} / {request.model}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                {durationMs !== null && (
                  <span className="font-mono text-[11px] text-[#7db1ff]">
                    {durationMs.toLocaleString()} ms
                  </span>
                )}
                <StatusPill status={request.status} />
                <span className="text-[10px] font-mono text-[#7d7f79]">
                  {new Date(request.emittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Timeline/Span visual graph */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.04] pt-2.5 min-w-0 w-full">
              <span className="text-[10px] uppercase tracking-wider text-[#7d7f79] mr-1 shrink-0 font-medium">Timeline:</span>
              <div className="flex items-center min-w-0 flex-wrap gap-y-1.5">
                {request.events.map((evt, idx) => {
                  const isLast = idx === request.events.length - 1;
                  let nodeColor = "bg-white/20";
                  if (evt.status === "completed") nodeColor = "bg-[#74a742] shadow-[0_0_6px_rgba(116,167,66,0.4)]";
                  else if (evt.status === "failed") nodeColor = "bg-[#ff6b57] shadow-[0_0_6px_rgba(255,107,87,0.4)]";
                  else if (evt.status === "cancelled") nodeColor = "bg-[#ffbf69] shadow-[0_0_6px_rgba(255,191,105,0.4)]";
                  else if (evt.eventType === "started" || evt.status === "started") nodeColor = "bg-[#7db1ff] shadow-[0_0_6px_rgba(125,177,255,0.4)]";
                  else if (evt.eventType === "progress" || evt.status === "progress") nodeColor = "bg-[#bfc0bc]";

                  let stepDuration = "";
                  if (!isLast) {
                    const nextEvt = request.events[idx + 1];
                    const diff = new Date(nextEvt.emittedAt).getTime() - new Date(evt.emittedAt).getTime();
                    stepDuration = diff > 0 ? `${diff}ms` : "";
                  }

                  return (
                    <div key={evt.id} className="flex items-center min-w-0 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(evt);
                        }}
                        title={`Inspect event: ${evt.eventType} (${evt.status})`}
                        className="group relative flex items-center gap-1.5 rounded-full border border-white/5 bg-[#212121] py-1 px-2.5 transition hover:bg-white/10 hover:border-white/15"
                      >
                        <span className={`h-2 w-2 rounded-full ${nodeColor}`} />
                        <span className="text-[#bfc0bc] font-mono text-[9px] capitalize">{evt.eventType}</span>
                      </button>

                      {!isLast && (
                        <div className="flex items-center px-1 justify-center relative w-10 sm:w-12">
                          <div className="h-[1px] w-full bg-white/10" />
                          {stepDuration && (
                            <span className="absolute bg-[#191a1b] px-0.5 text-[8px] font-mono text-[#7d7f79] scale-90">
                              {stepDuration}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
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

function parsePreviews(event: any): { input?: string; output?: string; disabled?: boolean; redactionCount?: number } | null {
  if (!event) return null;
  let previews = event.previews;
  if (typeof previews === "string") {
    try {
      previews = JSON.parse(previews);
    } catch (_) { }
  }
  if (!previews && event.rawEvent) {
    let raw = event.rawEvent;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch (_) { }
    }
    previews = raw?.previews;
  }
  if (typeof previews === "string") {
    try {
      previews = JSON.parse(previews);
    } catch (_) { }
  }
  return previews || null;
}

function OTelSpanGraph({ request }: { request: GroupedRequest }) {
  const sortedEvents = useMemo(() => {
    return [...request.events].sort(
      (a, b) => new Date(a.emittedAt).getTime() - new Date(b.emittedAt).getTime()
    );
  }, [request.events]);

  const [hoveredSpan, setHoveredSpan] = useState<{
    name: string;
    durationMs: number;
    left: number;
    width: number;
    startOffsetMs: number;
    status?: string;
  } | null>(null);

  if (sortedEvents.length < 2) {
    return (
      <div className="text-xs text-[#a9aaa7] italic p-4 bg-[#191a1b] rounded-xl border border-white/[0.05]">
        Not enough telemetry events to construct a span graph (requires at least 2 events).
      </div>
    );
  }

  const traceStart = new Date(sortedEvents[0].emittedAt).getTime();
  const traceEnd = new Date(sortedEvents[sortedEvents.length - 1].emittedAt).getTime();
  const totalDurationMs = Math.max(1, traceEnd - traceStart);

  const formatTime = (ms: number) => {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${ms.toFixed(1)}ms`;
  };

  const getSpanStyle = (name: string, status?: string) => {
    // Explicit states
    if (status === "failed") return { bg: "bg-[#ff6b57]/20", border: "border-[#ff6b57]/30", text: "text-[#ffb8ad]" };
    if (status === "cancelled") return { bg: "bg-[#ffbf69]/20", border: "border-[#ffbf69]/30", text: "text-[#ffd699]" };
    
    const lower = name.toLowerCase();
    if (lower.includes("completed") || lower.includes("success")) return { bg: "bg-[#74a742]/10", border: "border-[#74a742]/20", text: "text-[#a7e370]" };
    if (lower.includes("overall")) return { bg: "bg-[#7db1ff]/10", border: "border-[#7db1ff]/20", text: "text-[#adcfff]" };

    // Semantic engineering colors
    if (lower.includes("db") || lower.includes("query") || lower.includes("prisma") || lower.includes("sql")) {
      return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" };
    }
    if (lower.includes("fetch") || lower.includes("http") || lower.includes("request") || lower.includes("api") || lower.includes("route")) {
      return { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-300" };
    }
    if (lower.includes("llm") || lower.includes("model") || lower.includes("generate") || lower.includes("inference") || lower.includes("prompt")) {
      return { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300" };
    }
    if (lower.includes("embed") || lower.includes("vector") || lower.includes("pinecone") || lower.includes("search")) {
      return { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-300" };
    }
    if (lower.includes("cache") || lower.includes("redis")) {
      return { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-300" };
    }
    if (lower.includes("parse") || lower.includes("validate") || lower.includes("transform")) {
      return { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-300" };
    }

    // Default hash-based vibrant colors for unknown events
    const colors = [
      { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-300" },
      { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", text: "text-fuchsia-300" },
      { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-300" },
      { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-300" },
      { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-300" },
      { bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-300" },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const mainSpan = {
    name: `${request.provider} / ${request.model}`,
    left: 0,
    width: 100,
    durationMs: totalDurationMs,
    startOffsetMs: 0,
    status: request.status,
    ...getSpanStyle("overall", request.status),
  };

  const childSpans = [];
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const startEvt = sortedEvents[i];
    const endEvt = sortedEvents[i + 1];
    const startMs = new Date(startEvt.emittedAt).getTime() - traceStart;
    const durationMs = Math.max(1, new Date(endEvt.emittedAt).getTime() - new Date(startEvt.emittedAt).getTime());

    const leftPercent = (startMs / totalDurationMs) * 100;
    const widthPercent = (durationMs / totalDurationMs) * 100;

    let name = `${startEvt.eventType} → ${endEvt.eventType}`;

    childSpans.push({
      name,
      left: leftPercent,
      width: Math.max(0.5, widthPercent),
      durationMs,
      startOffsetMs: startMs,
      status: endEvt.status,
      ...getSpanStyle(name, endEvt.status),
    });
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * totalDurationMs);

  return (
    <div className="flex flex-col gap-3 w-full animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-1">
        <h4 className="font-semibold text-xs text-[#a9aaa7] uppercase tracking-widest flex items-center gap-2">
          Trace Timeline
        </h4>
        <span className="font-mono text-xs text-[#7d7f79]">{formatTime(totalDurationMs)}</span>
      </div>

      <div className="relative rounded-xl border border-white/5 bg-[#121314] p-5 shadow-sm overflow-hidden select-none">
        {/* Ticks & Grid */}
        <div className="absolute inset-x-5 top-8 bottom-5 pointer-events-none">
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-dashed border-white/10"
              style={{ left: `${(tick / totalDurationMs) * 100}%` }}
            >
              <span className="absolute -top-6 -translate-x-1/2 text-[9px] font-mono text-[#7d7f79] opacity-70">
                {formatTime(tick)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 relative z-10 min-w-[400px]">
          {/* Main Span */}
          <div className="relative h-8 w-full flex items-center">
            <div
              className={`absolute inset-y-0 rounded-md border ${mainSpan.bg} ${mainSpan.border} flex items-center px-2.5 transition-all hover:brightness-125 hover:z-20 cursor-default group overflow-hidden`}
              style={{ left: `${mainSpan.left}%`, width: `${mainSpan.width}%` }}
              onMouseEnter={() => setHoveredSpan(mainSpan)}
              onMouseLeave={() => setHoveredSpan(null)}
            >
              <span className={`text-[10px] font-semibold truncate ${mainSpan.text}`}>
                Overall Phase
              </span>
            </div>
          </div>

          {/* Child Spans */}
          <div className="relative h-6 w-full flex items-center mt-1">
            {childSpans.map((span, idx) => (
              <div
                key={idx}
                className={`absolute inset-y-0 rounded-md border ${span.bg} ${span.border} flex items-center px-1.5 transition-all hover:brightness-125 hover:scale-y-110 hover:z-20 cursor-default shadow-sm overflow-hidden`}
                style={{ left: `${span.left}%`, width: `${span.width}%` }}
                onMouseEnter={() => setHoveredSpan(span)}
                onMouseLeave={() => setHoveredSpan(null)}
              >
                {span.width > 12 && (
                  <span className={`text-[9px] font-mono truncate ${span.text} mx-auto opacity-80 font-medium`}>
                    {formatTime(span.durationMs)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Hover Tooltip */}
        {hoveredSpan && (
          <div className="absolute bottom-4 right-4 z-30 pointer-events-none">
            <div className="bg-[#191a1b]/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl inline-block max-w-[300px] animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex flex-col gap-2.5 text-xs font-mono">
                <div className="flex flex-col gap-1">
                  <span className="text-[#7d7f79] text-[9px] uppercase tracking-wider font-sans">Stage</span>
                  <span className={`${hoveredSpan.status === "failed" ? "text-[#ffb8ad]" : hoveredSpan.status === "cancelled" ? "text-[#ffd699]" : "text-white"} font-medium truncate`}>
                    {hoveredSpan.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[#7d7f79] text-[9px] uppercase tracking-wider font-sans">Duration</span>
                    <span className="text-[#74a742] font-semibold">{formatTime(hoveredSpan.durationMs)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#7d7f79] text-[9px] uppercase tracking-wider font-sans">Offset</span>
                    <span className="text-sky-400">+{formatTime(hoveredSpan.startOffsetMs)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailDrawer({
  detail,
  onClose,
}: {
  detail: { type: "run" | "event" | "grouped-request"; data: any } | null;
  onClose: () => void;
}) {
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCopiedInput(false);
    setCopiedOutput(false);
    setExpandedEvents({});
  }, [detail]);

  if (!detail) return null;

  const data = detail.data;

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

  const toggleEventExpand = (evtId: string) => {
    setExpandedEvents((prev) => ({ ...prev, [evtId]: !prev[evtId] }));
  };

  // Grouped Request Detail View
  if (detail.type === "grouped-request") {
    const request = data as GroupedRequest;
    const durationMs = request.latencyMs ?? (request.startedAt && request.completedAt
      ? new Date(request.completedAt).getTime() - new Date(request.startedAt).getTime()
      : null);

    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md transition-opacity duration-300"
        />

        {/* Drawer */}
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-white/10 bg-[#0a0a0a] shadow-2xl transition-transform duration-300 transform translate-x-0">
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7db1ff] flex items-center gap-1.5">
                Live Telemetry Trace
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                {request.provider} <span className="text-white/20">/</span> {request.model}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2.5 text-[#8b8b8b] hover:bg-white/10 hover:text-white transition-colors ring-1 ring-white/5"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 text-sm custom-scrollbar">
            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-1.5 shadow-sm">
                <span className="text-[10px] uppercase tracking-wider text-[#7d7f79] font-medium">Status</span>
                <div><StatusPill status={request.status} /></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-1.5 shadow-sm">
                <span className="text-[10px] uppercase tracking-wider text-[#7d7f79] font-medium">Latency</span>
                <p className="font-mono text-lg font-medium text-white drop-shadow-sm">
                  {durationMs !== null ? `${durationMs.toLocaleString()} ms` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-1.5 col-span-2 shadow-sm">
                <span className="text-[10px] uppercase tracking-wider text-[#7d7f79] font-medium">Request ID</span>
                <p className="font-mono text-sm text-[#bfc0bc] truncate opacity-90" title={request.requestId}>
                  {request.requestId}
                </p>
              </div>
            </div>

            {/* OTel Span Graph */}
            <OTelSpanGraph request={request} />

            {/* Vertical Flow Timeline */}
            <div className="rounded-xl border border-white/10 bg-[#121314] overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01]">
                <h4 className="font-semibold text-xs text-[#a9aaa7] uppercase tracking-widest flex items-center gap-2">
                  Execution Timeline
                </h4>
              </div>

              <div className="p-6 relative max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
                {/* Continuous Timeline Line */}
                <div className="absolute left-[31px] top-8 bottom-8 w-[2px] bg-gradient-to-b from-white/10 via-white/5 to-transparent rounded-full" />

                <div className="space-y-8">
                  {request.events.map((evt, idx) => {
                    const isLast = idx === request.events.length - 1;
                    let nodeColor = "bg-white/20 ring-white/10";
                    let glowColor = "";
                    if (evt.status === "completed") {
                      nodeColor = "bg-[#74a742] ring-[#74a742]/30";
                      glowColor = "shadow-[0_0_12px_rgba(116,167,66,0.6)]";
                    } else if (evt.status === "failed") {
                      nodeColor = "bg-[#ff6b57] ring-[#ff6b57]/30";
                      glowColor = "shadow-[0_0_12px_rgba(255,107,87,0.6)]";
                    } else if (evt.status === "cancelled") {
                      nodeColor = "bg-[#ffbf69] ring-[#ffbf69]/30";
                      glowColor = "shadow-[0_0_12px_rgba(255,191,105,0.6)]";
                    } else if (evt.eventType === "started" || evt.status === "started") {
                      nodeColor = "bg-[#7db1ff] ring-[#7db1ff]/30";
                      glowColor = "shadow-[0_0_12px_rgba(125,177,255,0.6)]";
                    } else if (evt.eventType === "progress" || evt.status === "progress") {
                      nodeColor = "bg-[#bfc0bc] ring-white/20";
                    }

                    let stepDuration = "";
                    if (!isLast) {
                      const nextEvt = request.events[idx + 1];
                      const diff = new Date(nextEvt.emittedAt).getTime() - new Date(evt.emittedAt).getTime();
                      stepDuration = diff > 0 ? `+${diff}ms` : "";
                    }

                    return (
                      <div key={evt.id} className="relative flex gap-6 group">
                        {/* Timeline Node */}
                        <div className="relative flex flex-col items-center w-4 shrink-0 justify-center">
                          <div className={`z-10 h-4 w-4 rounded-full ring-4 ${nodeColor} ${glowColor} border-2 border-[#121314] transition-all duration-300 group-hover:scale-110`} />
                        </div>

                        {/* Timeline Content */}
                        <div className="flex-1 pb-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white capitalize tracking-wide text-[13px]">
                                {evt.eventType}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-white/5 text-[#a9aaa7] border border-white/5">
                                {evt.status}
                              </span>
                            </div>
                            <span className="font-mono text-xs text-[#7d7f79]">
                              {new Date(evt.emittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}
                            </span>
                          </div>

                          {stepDuration && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#7db1ff]/10 text-[#7db1ff] text-[10px] font-mono ring-1 ring-[#7db1ff]/20">
                              <span className="text-[#7db1ff]/70 text-[9px]">delay:</span> {stepDuration}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Individual Event Logs / Previews */}
            <div className="space-y-4">
              <h4 className="font-semibold text-xs text-[#a9aaa7] uppercase tracking-widest pl-1">Event Payloads</h4>

              <div className="flex flex-col gap-3">
                {request.events.map((evt) => {
                  const isExpanded = expandedEvents[evt.id] ?? false;
                  const p = parsePreviews(evt);
                  const evtInput = p?.input ?? "";
                  const evtOutput = p?.output ?? "";
                  const evtDisabled = p?.disabled ?? false;

                  return (
                    <div key={evt.id} className="rounded-xl border border-white/10 bg-[#121314] overflow-hidden transition-all duration-200">
                      <button
                        onClick={() => toggleEventExpand(evt.id)}
                        className="w-full flex items-center justify-between px-5 py-3.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left focus:outline-none"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-[#ececec] capitalize">
                            {evt.eventType}
                          </span>
                          <StatusPill status={evt.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#7d7f79]">
                          <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-[10px] hidden sm:block">
                            {evt.id.slice(0, 12)}...
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-wider">{isExpanded ? "Collapse" : "Expand"}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-5 space-y-5 border-t border-white/5 text-[13px] font-mono bg-black/20">
                          {evt.latencyMs !== null && (
                            <div className="flex items-center gap-2">
                              <span className="text-[#7d7f79]">Latency:</span>
                              <span className="text-[#7db1ff] bg-[#7db1ff]/10 px-1.5 py-0.5 rounded">{evt.latencyMs} ms</span>
                            </div>
                          )}
                          {!!evt.error && (
                            <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-4 relative overflow-hidden shadow-inner">
                              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
                              <span className="text-red-400 font-bold block mb-2 uppercase text-[10px] tracking-wider">Error Details</span>
                              <pre className="text-red-300/90 whitespace-pre-wrap leading-relaxed font-sans text-sm">
                                {describeError(evt.error)}
                              </pre>
                            </div>
                          )}
                          {evtDisabled ? (
                            <div className="italic text-[#7d7f79] flex items-center gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
                              Telemetry previews disabled for this event.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {evtInput && (
                                <div className="space-y-2">
                                  <span className="text-[#7d7f79] uppercase text-[10px] tracking-wider font-semibold">Redacted Input</span>
                                  <div className="p-3.5 rounded-lg bg-[#0a0a0a] text-[#a9aaa7] max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans border border-white/5 ring-1 ring-inset ring-white/5 custom-scrollbar shadow-inner">
                                    {evtInput}
                                  </div>
                                </div>
                              )}
                              {evtOutput && (
                                <div className="space-y-2">
                                  <span className="text-[#7d7f79] uppercase text-[10px] tracking-wider font-semibold">Redacted Output</span>
                                  <div className="p-3.5 rounded-lg bg-[#0a0a0a] text-[#a9aaa7] max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans border border-white/5 ring-1 ring-inset ring-white/5 custom-scrollbar shadow-inner">
                                    {evtOutput}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Fallback / Standard Detail View (for run or event)
  const isRun = detail.type === "run";
  const p = parsePreviews(data);
  const previewInput = p?.input ?? "";
  const previewOutput = p?.output ?? "";
  const isDisabled = p?.disabled ?? false;
  const redactionCount = p?.redactionCount ?? 0;

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
          {!!data.error && (
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

