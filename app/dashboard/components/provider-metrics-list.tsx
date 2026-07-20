import React from "react";

export type ProviderMetric = {
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

interface ProviderMetricsListProps {
  items: ProviderMetric[];
}

export function ProviderMetricsList({ items }: ProviderMetricsListProps) {
  if (!items.length) {
    return (
      <div className="flex min-h-[150px] items-center justify-center rounded-md border border-white/8 bg-[#212121] text-xs text-[#7d7f79]">
        No provider activity yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
      {items.map((item, idx) => (
        <div key={`${item.provider}-${item.model}-${idx}`} className="rounded-md border border-white/8 bg-[#212121] p-3 hover:border-white/15 transition-all">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="inline-block rounded bg-[#232a1d] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#74a742] mb-1">
                {item.provider}
              </span>
              <p className="truncate text-xs font-medium text-[#ececec]">{item.model}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-semibold text-[#74a742] bg-[#74a742]/10 px-2 py-0.5 rounded-full">{item.runs} runs</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 border-t border-white/5 pt-2 text-[10px]">
            <div>
              <span className="text-[#8b8b8b] block text-[9px] uppercase tracking-wider font-semibold">Latency</span>
              <span className="text-[#ececec] font-medium">{formatMs(item.avgLatencyMs)}</span>
            </div>
            <div>
              <span className="text-[#8b8b8b] block text-[9px] uppercase tracking-wider font-semibold">Errors</span>
              <span className={`font-medium ${item.errorRate > 0 ? "text-[#ff6b57]" : "text-[#74a742]"}`}>
                {formatPercent(item.errorRate)}
              </span>
            </div>
            <div>
              <span className="text-[#8b8b8b] block text-[9px] uppercase tracking-wider font-semibold">Cancelled</span>
              <span className="text-[#ececec] font-medium">{item.cancelled}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
