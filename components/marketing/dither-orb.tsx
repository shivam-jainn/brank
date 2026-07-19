import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const stages = [
  { label: "Request", value: "0 ms", x: "8%", y: "62%" },
  { label: "First token", value: "184 ms", x: "33%", y: "45%" },
  { label: "Streaming", value: "1,240 tok", x: "62%", y: "35%" },
  { label: "Complete", value: "1.86 s", x: "86%", y: "55%", active: true },
];

const metrics = [
  ["Model", "GPT-4.1"],
  ["Cost", "$0.018"],
  ["Status", "OK"],
];

export function DitherOrb({ className }: { className?: string }) {
  return (
    <div
      aria-label="A readable preview of an LLM inference trace"
      className={cn(
        "relative grid h-[360px] w-full grid-rows-[auto_1fr_auto] overflow-hidden border-y border-black/10 bg-[#f3f1ea] sm:h-[400px] lg:h-[430px]",
        className,
      )}
      role="img"
    >
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(17,17,17,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.08)_1px,transparent_1px)] [background-size:120px_100%,100%_96px]" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8 sm:py-7">
        <div>
          <p className="font-mono text-[11px] uppercase text-black/50">Trace 01HZX7A8F</p>
          <p className="mt-1 text-lg font-semibold text-black sm:text-2xl">Chat completion timeline</p>
        </div>

        <div className="flex gap-2">
          {metrics.map(([label, value]) => (
            <div className="border border-black/10 bg-[#f3f1ea] px-3 py-2" key={label}>
              <p className="font-mono text-[9px] uppercase text-black/45">{label}</p>
              <p className="text-sm font-semibold text-black">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 min-h-0 px-6 sm:px-10">
        <div className="absolute inset-x-6 top-1/2 h-2 bg-black/10 sm:inset-x-10">
          <div className="h-full w-[86%] bg-black" />
          <div className="absolute left-[34%] top-1/2 h-8 w-px -translate-y-1/2 bg-black/25" />
          <div className="absolute left-[63%] top-1/2 h-8 w-px -translate-y-1/2 bg-black/25" />
        </div>

        {stages.map((stage) => (
          <EventMarker
            active={stage.active}
            key={stage.label}
            label={stage.label}
            style={{ left: stage.x, top: stage.y }}
            value={stage.value}
          />
        ))}
      </div>

      <div className="relative z-10 grid gap-3 border-t border-black/10 bg-[#f3f1ea]/95 px-5 py-4 sm:grid-cols-3 sm:px-8">
        <InfoLine label="Latency" value="Time to first token: 184 ms" />
        <InfoLine label="Usage" value="1,240 output tokens" />
        <InfoLine label="Events" value="Request, stream, complete" />
      </div>
    </div>
  );
}

function EventMarker({
  active = false,
  label,
  style,
  value,
}: {
  active?: boolean;
  style: CSSProperties;
  label: string;
  value: string;
}) {
  return (
    <div className="absolute z-10 -translate-x-1/2 border border-black/10 bg-[#f3f1ea] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)]" style={style}>
      <div className="mb-1 flex items-center gap-2">
        <span className={cn("size-2.5 rounded-full bg-black", active && "bg-[#d7ff73] ring-4 ring-[#d7ff73]/25")} />
        <span className="font-mono text-[10px] uppercase text-black/55">{label}</span>
      </div>
      <span className="text-base font-semibold text-black sm:text-lg">{value}</span>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-black/15 pl-3">
      <p className="font-mono text-[9px] uppercase text-black/45">{label}</p>
      <p className="text-sm font-medium text-black">{value}</p>
    </div>
  );
}
