"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  Check,
  ChevronDown,
  ChevronUp,
  CircleIcon,
  Copy,
  GaugeIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  ShieldAlertIcon,
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
  chatSpans: ChatSpanData[];
  availableProviders?: string[];
  availableModels?: string[];
  pii: {
    totalRedactions: number;
    redactedRuns: number;
    redactionRate: number;
  };
};

type ChatSpanData = {
  conversationId: string;
  startedAt: string;
  lastEventAt: string;
  requests: Array<{
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
    events: Array<{
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
    }>;
  }>;
  chatMessages: Array<{
    id: string;
    role: string;
    content: string;
    sequence: number;
    createdAt: string;
  }>;
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
  const [expandedChatSpans, setExpandedChatSpans] = useState<Record<string, boolean>>({});

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

        <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden text-[#ececec]">
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

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <Stat label="LLM calls" value={(metrics?.totals.totalRuns ?? 0).toLocaleString()} detail={`model invocations · last ${rangeLabel}`} icon={<ActivityIcon className="size-4" />} />
                <Stat label="Chat messages" value={(metrics?.totals.totalMessages ?? 0).toLocaleString()} detail={`total over last ${rangeLabel}`} icon={<MessageSquareIcon className="size-4" />} />
                <Stat label="Latency" value={formatMs(metrics?.totals.avgLatencyMs)} detail={`p95 ${formatMs(metrics?.totals.p95LatencyMs)} on completed calls`} icon={<GaugeIcon className="size-4" />} />
                <Stat label="Cancelled streams" value={(metrics?.totals.cancelledRuns ?? 0).toLocaleString()} detail={`${formatPercent(metrics?.totals.cancellationRate)} cancellation rate`} icon={<SquareIcon className="size-4" />} intent="warn" />
                <Stat label="Failed calls" value={(metrics?.totals.failedRuns ?? 0).toLocaleString()} detail={`${formatPercent(metrics?.totals.errorRate)} error rate`} icon={<AlertTriangleIcon className="size-4" />} intent="bad" />
                <Stat label="PII redacted" value={(metrics?.pii.totalRedactions ?? 0).toLocaleString()} detail={`${(metrics?.pii.redactedRuns ?? 0).toLocaleString()} runs · ${formatPercent(metrics?.pii.redactionRate)} redaction rate`} icon={<ShieldAlertIcon className="size-4" />} intent="warn" />
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
                      <MiniMetric label="Derived calls" value={metrics?.totals.totalRuns ?? 0} />
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

              <section className="mt-8 border-t border-white/10 pt-8 min-w-0">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-[#ececec]">Chat Spans</h3>
                    <p className="text-xs text-[#8b8b8b] mt-1">Full conversation history grouped by chat</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#171717] px-2.5 py-1 text-xs text-[#8b8b8b] shadow-sm">
                    <Terminal className="size-3.5" />
                    <span>{metrics?.chatSpans?.length ?? 0} chats</span>
                  </span>
                </div>
                <div className="max-h-[600px] overflow-y-auto overflow-x-hidden pr-2 space-y-4 w-full min-w-0">
                  <ChatSpanList
                    chatSpans={metrics?.chatSpans ?? []}
                    expandedSpans={expandedChatSpans}
                    onToggleSpan={(id) => setExpandedChatSpans(prev => ({ ...prev, [id]: !prev[id] }))}
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

function ChatSpanList({
  chatSpans,
  expandedSpans,
  onToggleSpan,
}: {
  chatSpans: ChatSpanData[];
  expandedSpans: Record<string, boolean>;
  onToggleSpan: (id: string) => void;
}) {
  const [expandedPairs, setExpandedPairs] = useState<Record<string, boolean>>({});

  if (!chatSpans.length) {
    return <EmptyState text="No chat activity recorded in the last hour." />;
  }

  const togglePair = (key: string) => setExpandedPairs(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4 w-full min-w-0">
      {chatSpans.map((span) => {
        const isExpanded = expandedSpans[span.conversationId] ?? false;
        const userMsgs = span.chatMessages.filter(m => m.role === "user");
        const assistantMsgs = span.chatMessages.filter(m => m.role === "assistant");
        const pairCount = Math.max(userMsgs.length, span.requests.length);
        const lastUserMsg = userMsgs[userMsgs.length - 1];

        // Compute total metrics for the chat
        const totalTokens = span.requests.reduce((acc, req) => acc + (req.totalTokens || 0), 0);
        const totalLatency = span.requests.reduce((acc, req) => acc + (req.latencyMs || 0), 0);

        return (
          <div key={span.conversationId} className="group w-full min-w-0 rounded-xl border border-white/10 bg-gradient-to-b from-[#1c1d1e] to-[#151617] shadow-sm overflow-hidden transition-all duration-200 hover:border-white/20">
            {/* Level 1: Chat accordion */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onToggleSpan(span.conversationId)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggleSpan(span.conversationId); }}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors min-w-0 cursor-pointer select-none"
            >
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquareIcon className="size-4 shrink-0 text-[#7d7f79]" />
                  <span className="font-mono text-xs font-medium text-[#e0e0e0] truncate">{span.conversationId}</span>
                  <div className="flex flex-wrap items-center gap-1.5 ml-2 shrink-0">
                    <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#a9aaa7] ring-1 ring-inset ring-white/10">
                      {pairCount} msg{pairCount !== 1 ? "s" : ""}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#a9aaa7] ring-1 ring-inset ring-white/10">
                      {span.requests.length} call{span.requests.length !== 1 ? "s" : ""}
                    </span>
                    {totalTokens > 0 && (
                      <span className="inline-flex items-center rounded-md bg-[#7db1ff]/10 px-2 py-0.5 text-[10px] font-medium text-[#7db1ff] ring-1 ring-inset ring-[#7db1ff]/20">
                        {totalTokens.toLocaleString()} tok
                      </span>
                    )}
                    {totalLatency > 0 && (
                      <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#a9aaa7] ring-1 ring-inset ring-white/10">
                        {formatMs(totalLatency)} total
                      </span>
                    )}
                  </div>
                </div>
                {lastUserMsg && !isExpanded && (
                  <p className="text-sm text-[#8b8b8b] truncate pl-6 max-w-full">
                    <span className="font-medium text-[#a9aaa7]">Latest: </span>
                    {lastUserMsg.content}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-[#7d7f79] hidden sm:block">{new Date(span.lastEventAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <div className="flex items-center justify-center size-6 rounded-full bg-white/5 transition-colors group-hover:bg-white/10 text-[#e0e0e0]">
                  {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </div>
              </div>
            </div>

            {/* Level 1 expanded: message pairs */}
            {isExpanded && (
              <div className="border-t border-white/5 bg-[#121314] w-full min-w-0">
                {span.requests.map((req, reqIdx) => {
                  const pairKey = `${span.conversationId}:${req.id}`;
                  const isPairExpanded = expandedPairs[pairKey] ?? false;
                  const userMsg = userMsgs[reqIdx];
                  const assistantMsg = assistantMsgs[reqIdx];
                  const p = parsePreviews(req);
                  const redactionCount = p?.redactionCount ?? 0;

                  return (
                    <div key={req.id} className="border-b border-white/[0.04] last:border-b-0 min-w-0 flex flex-col">
                      {/* Level 2: Message pair accordion */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => togglePair(pairKey)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") togglePair(pairKey); }}
                        className="w-full flex items-stretch gap-0 text-left hover:bg-white/[0.02] transition-colors relative min-w-0 cursor-pointer select-none"
                      >
                        {/* Status line left */}
                        <div className={`w-1 shrink-0 ${
                            req.status === "completed" ? "bg-[#74a742]" :
                            req.status === "failed" ? "bg-[#ff6b57]" :
                            req.status === "cancelled" ? "bg-[#ffbf69]" :
                            "bg-[#7db1ff] animate-pulse"
                          }`} 
                        />
                        
                        <div className="flex-1 flex flex-col py-3 px-4 gap-2 min-w-0 overflow-hidden">
                           {/* User msg row */}
                           <div className="flex items-start gap-3 min-w-0">
                             <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-[#7db1ff]/10 ring-1 ring-[#7db1ff]/20">
                               <span className="text-[10px] font-bold text-[#7db1ff]">U</span>
                             </div>
                             <p className="text-sm text-[#d4d4d4] truncate leading-relaxed">
                               {userMsg?.content || <span className="text-[#555] italic">Empty message</span>}
                             </p>
                           </div>
                           
                           {/* Assistant msg row */}
                           <div className="flex items-start gap-3 min-w-0">
                             <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-[#74a742]/10 ring-1 ring-[#74a742]/20">
                               <span className="text-[10px] font-bold text-[#74a742]">A</span>
                             </div>
                             <p className="text-sm text-[#a9aaa7] truncate leading-relaxed">
                               {assistantMsg?.content || <span className="text-[#555] italic">Empty response</span>}
                             </p>
                           </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 px-4">
                           {redactionCount > 0 && (
                             <span className="text-[10px] text-[#ffbf69] bg-[#ffbf69]/10 border border-[#ffbf69]/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1 shrink-0">
                               <AlertTriangleIcon className="size-2.5" />
                               {redactionCount}
                             </span>
                           )}
                            <div className="flex flex-col items-end gap-1">
                             <span className="text-xs font-mono text-[#e0e0e0]">
                               {req.latencyMs != null ? formatMs(req.latencyMs) : "—"}
                             </span>
                             <span className="text-[10px] text-[#7d7f79]">
                               {req.provider}/{req.model}
                             </span>
                           </div>
                           <div className="text-[#555] transition-colors hover:text-[#e0e0e0]">
                             {isPairExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                           </div>
                        </div>
                      </div>

                      {/* Level 2 expanded: span graph + details */}
                      {isPairExpanded && (
                        <div className="px-5 pb-5 pt-4 space-y-5 bg-[#0a0a0b] shadow-inner border-y border-white/[0.02] min-w-0">
                          {/* Span Bar Chart */}
                          <div className="space-y-2">
                             <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[#555]">Trace Timeline</h4>
                             <SpanBar events={req.events} totalLatencyMs={req.latencyMs} />
                          </div>

                          {/* Meta tags */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded bg-[#1e1f21] px-2 py-1 text-[10px] font-medium text-[#d4d4d4] ring-1 ring-inset ring-white/10">
                              <Terminal className="size-3 mr-1.5 text-[#8b8b8b]" />
                              {req.provider} / {req.model}
                            </span>
                            {req.totalTokens != null && (
                               <span className="inline-flex items-center rounded bg-[#1e1f21] px-2 py-1 text-[10px] font-medium text-[#d4d4d4] ring-1 ring-inset ring-white/10">
                                  <ActivityIcon className="size-3 mr-1.5 text-[#8b8b8b]" />
                                  {req.totalTokens.toLocaleString()} tokens
                               </span>
                            )}
                            {redactionCount > 0 && (
                               <span className="inline-flex items-center rounded bg-[#33240f] px-2 py-1 text-[10px] font-medium text-[#ffbf69] ring-1 ring-inset ring-[#ffbf69]/20">
                                  <AlertTriangleIcon className="size-3 mr-1.5 text-[#ffbf69]" />
                                  {redactionCount} Redacted PII
                               </span>
                            )}
                            {req.error && (
                               <span className="inline-flex items-center rounded bg-[#3a1714] px-2 py-1 text-[10px] font-medium text-[#ff8a7a] ring-1 ring-inset ring-[#ff6b57]/20">
                                  <AlertTriangleIcon className="size-3 mr-1.5" />
                                  Error occurred
                               </span>
                            )}
                          </div>

                          {/* Previews */}
                          {(() => {
                            if (!p || p.disabled) return null;
                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {p.input && (
                                  <div className="rounded-lg bg-[#141516] border border-white/5 overflow-hidden flex flex-col min-w-0">
                                    <div className="bg-[#1c1d1e] border-b border-white/5 px-3 py-2 flex justify-between items-center">
                                       <span className="text-[10px] font-medium uppercase tracking-wider text-[#a9aaa7]">Redacted Input Payload</span>
                                    </div>
                                    <div className="p-3 max-h-60 overflow-y-auto">
                                       <span className="text-[11px] font-mono text-[#d4d4d4] whitespace-pre-wrap leading-relaxed break-words">{p.input}</span>
                                    </div>
                                  </div>
                                )}
                                {p.output && (
                                  <div className="rounded-lg bg-[#141516] border border-white/5 overflow-hidden flex flex-col min-w-0">
                                    <div className="bg-[#1c1d1e] border-b border-white/5 px-3 py-2 flex justify-between items-center">
                                       <span className="text-[10px] font-medium uppercase tracking-wider text-[#a9aaa7]">Redacted Output Payload</span>
                                    </div>
                                    <div className="p-3 max-h-60 overflow-y-auto">
                                       <span className="text-xs font-mono text-[#d4d4d4] whitespace-pre-wrap leading-relaxed break-words">{p.output}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SpanBar({
  events,
  totalLatencyMs,
}: {
  events: Array<{ eventType: string; status: string; emittedAt: string }>;
  totalLatencyMs: number | null;
}) {
  const sorted = useMemo(() =>
    [...events].sort((a, b) => new Date(a.emittedAt).getTime() - new Date(b.emittedAt).getTime()),
    [events]
  );

  if (sorted.length < 2 || totalLatencyMs == null || totalLatencyMs <= 0) {
    return (
      <div className="h-8 rounded-md bg-white/[0.02] border border-white/5 flex items-center justify-center">
        <span className="text-[10px] text-[#555] font-mono">Insufficient span data</span>
      </div>
    );
  }

  const traceStart = new Date(sorted[0].emittedAt).getTime();
  const totalMs = totalLatencyMs;

  type Phase = { label: string; startPct: number; widthPct: number; color: string; duration: number };
  const phases: Phase[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const startMs = new Date(curr.emittedAt).getTime() - traceStart;
    const durMs = Math.max(1, new Date(next.emittedAt).getTime() - new Date(curr.emittedAt).getTime());
    const widthPct = (durMs / totalMs) * 100;
    const startPct = (startMs / totalMs) * 100;

    let label = "";
    let color = "";

    if (curr.eventType === "started" && next.eventType === "first_token") {
      label = "TTFT";
      color = "bg-[#7db1ff]";
    } else if (curr.eventType === "first_token" && (next.eventType === "progress" || next.eventType === "completed")) {
      label = "STREAM";
      color = "bg-[#b46aff]";
    } else if (next.eventType === "completed") {
      label = "FINISH";
      color = "bg-[#74a742]";
    } else if (next.eventType === "failed") {
      label = "FAIL";
      color = "bg-[#ff6b57]";
    } else if (next.eventType === "cancelled") {
      label = "CANCEL";
      color = "bg-[#ffbf69]";
    } else {
      label = curr.eventType.toUpperCase();
      color = "bg-white/15";
    }

    phases.push({ label, startPct, widthPct: Math.max(widthPct, 0.5), color, duration: durMs });
  }

  const formatTime = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;

  return (
    <div className="w-full flex flex-col gap-2 min-w-0">
      {/* Visual Timeline Bar */}
      <div className="relative h-6 w-full rounded bg-[#1c1d1e] border border-white/5 overflow-hidden shadow-inner flex">
        {phases.map((phase, i) => (
          <div
            key={i}
            className={`h-full ${phase.color} opacity-90 transition-opacity hover:opacity-100 flex items-center justify-center overflow-hidden border-r border-black/20 last:border-r-0`}
            style={{ width: `${phase.widthPct}%` }}
            title={`${phase.label}: ${formatTime(phase.duration)}`}
          >
             {phase.widthPct > 5 && (
                 <span className="text-[9px] font-bold text-black/60 truncate px-1">
                    {phase.label}
                 </span>
             )}
          </div>
        ))}
      </div>

      {/* Breakdown Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-1 bg-[#141516] p-2 rounded-md border border-white/[0.02]">
        {phases.map((phase, i) => (
          <div key={i} className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-2 h-2 rounded-sm shrink-0 ${phase.color}`} />
              <span className="text-[9px] font-bold tracking-wider text-[#a9aaa7] truncate">{phase.label}</span>
            </div>
            <span className="text-[11px] font-mono text-[#d4d4d4] pl-3.5 whitespace-nowrap">
              {formatTime(phase.duration)} <span className="text-[#555] text-[9px]">({Math.round(phase.widthPct)}%)</span>
            </span>
          </div>
        ))}
        <div className="flex flex-col ml-auto pl-4 border-l border-white/10 shrink-0">
           <span className="text-[9px] font-bold tracking-wider text-[#a9aaa7] mb-0.5">TOTAL</span>
           <span className="text-[11px] font-mono text-[#7db1ff]">{formatTime(totalMs)}</span>
        </div>
      </div>
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

function DetailDrawer({
  detail,
  onClose,
}: {
  detail: { type: "run" | "event"; data: any } | null;
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

