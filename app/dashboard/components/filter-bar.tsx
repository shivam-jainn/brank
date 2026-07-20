import React from "react";
import { CircleIcon } from "lucide-react";

interface FilterBarProps {
  timeRange: string;
  setTimeRange: (val: string) => void;
  providerFilter: string;
  setProviderFilter: (val: string) => void;
  modelFilter: string;
  setModelFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  availableProviders?: string[];
  availableModels?: string[];
  successRate: number;
}

export function FilterBar({
  timeRange,
  setTimeRange,
  providerFilter,
  setProviderFilter,
  modelFilter,
  setModelFilter,
  statusFilter,
  setStatusFilter,
  availableProviders = [],
  availableModels = [],
  successRate,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/8 bg-[#171717] px-4 py-3">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-[#8b8b8b]">Time Range</label>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="h-9 rounded-md border border-white/10 bg-[#101112] px-3 text-xs text-[#d9d8d2] focus:outline-none focus:ring-1 focus:ring-[#74a742] cursor-pointer shadow-sm hover:border-white/20 transition-all font-medium min-w-[120px]"
        >
          <option value="1h">1 Hour</option>
          <option value="3h">3 Hours</option>
          <option value="6h">6 Hours</option>
          <option value="12h">12 Hours</option>
          <option value="24h">1 Day</option>
          <option value="7d">1 Week</option>
          <option value="30d">1 Month</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-[#8b8b8b]">Provider</label>
        <select
          value={providerFilter}
          onChange={(e) => {
            setProviderFilter(e.target.value);
            setModelFilter("all");
          }}
          className="h-9 rounded-md border border-white/10 bg-[#101112] px-3 text-xs text-[#d9d8d2] focus:outline-none focus:ring-1 focus:ring-[#74a742] cursor-pointer shadow-sm hover:border-white/20 transition-all font-medium min-w-[140px]"
        >
          <option value="all">All Providers</option>
          {availableProviders.map((prov) => (
            <option key={prov} value={prov} className="capitalize">
              {prov}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-[#8b8b8b]">Model</label>
        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          className="h-9 rounded-md border border-white/10 bg-[#101112] px-3 text-xs text-[#d9d8d2] focus:outline-none focus:ring-1 focus:ring-[#74a742] cursor-pointer shadow-sm hover:border-white/20 transition-all font-medium max-w-[200px]"
        >
          <option value="all">All Models</option>
          {availableModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-[#8b8b8b]">Status</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-white/10 bg-[#101112] px-3 text-xs text-[#d9d8d2] focus:outline-none focus:ring-1 focus:ring-[#74a742] cursor-pointer shadow-sm hover:border-white/20 transition-all font-medium min-w-[120px]"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="started">Started</option>
        </select>
      </div>

      <div className="ml-auto mt-auto flex items-center gap-2">
        <button
          onClick={() => {
            setProviderFilter("all");
            setModelFilter("all");
            setStatusFilter("all");
            setTimeRange("24h");
          }}
          className="h-9 rounded-md border border-white/5 bg-white/5 hover:bg-white/10 px-3 text-xs text-[#b4b4b4] hover:text-white transition-all font-medium"
        >
          Reset Filters
        </button>
        <HealthBadge value={successRate} />
      </div>
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

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
