"use client";

import Link from "next/link";
import { ArrowRightIcon, Terminal, Activity, Shield, Cpu, Layers } from "lucide-react";
import { useState, useEffect } from "react";

import { HeroDitheringRoot, HeroDitheringVisual } from "@/components/ui/hero-dithering";
import { LightboardFooter } from "./lightboard-footer";
import { useSession } from "@/lib/auth-client";

const sampleLogs = [
  { provider: "openai", model: "gpt-4.1", status: "200", duration: "184ms", tokens: "420", trace: "tr_8fx1a9" },
  { provider: "anthropic", model: "claude-3.5", status: "200", duration: "320ms", tokens: "812", trace: "tr_4k9z12" },
  { provider: "groq", model: "llama-3.3-70b", status: "200", duration: "84ms", tokens: "1,240", trace: "tr_0v5s29" },
  { provider: "gemini", model: "gemini-2.0-pro", status: "200", duration: "245ms", tokens: "602", trace: "tr_9m2d31" },
];

export function LandingPage() {
  const [activeLog, setActiveLog] = useState(0);
  const { data: session, isPending: isSessionPending } = useSession();

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveLog((prev) => (prev + 1) % sampleLogs.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-dvh bg-[#0f1011] text-[#f3f1ea] antialiased selection:bg-[#d7ff73]/50 selection:text-[#10140d]">
      {/* Sleek top grid line decoration */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0f1011]/90 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link className="flex items-center gap-2.5 group" href="/">
            <span className="grid size-7 grid-cols-2 gap-[3px] p-1 border border-white/10 bg-[#191a1b]/60 rounded">
              <i className="block bg-[#f3f1ea] group-hover:bg-[#d7ff73] transition-colors" />
              <i className="block bg-[#d7ff73]" />
              <i className="block bg-[#f3f1ea] group-hover:bg-[#d7ff73] transition-colors" />
              <i className="block bg-[#f3f1ea] group-hover:bg-[#d7ff73] transition-colors" />
            </span>
            <span className="text-base font-semibold tracking-tight text-[#f3f1ea]">Brank</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-[#a9aaa7] md:flex">
            <a className="transition-colors hover:text-[#f3f1ea]" href="#trace">Trace Flow</a>
            <a className="transition-colors hover:text-[#f3f1ea]" href="#features">Architecture</a>
            <Link className="transition-colors hover:text-[#f3f1ea]" href="/dashboard">Dashboard</Link>
          </div>

          <div className="flex items-center gap-4">
            {!isSessionPending && session ? (
              <Link className="inline-flex h-9 items-center gap-2 bg-[#d7ff73] px-4 text-sm font-medium text-[#0f1011] rounded transition-all hover:bg-[#c8ef68]" href="/chat">
                Go to chat
                <ArrowRightIcon className="size-3.5" />
              </Link>
            ) : (
              <>
                <Link className="hidden text-sm font-medium text-[#a9aaa7] hover:text-[#f3f1ea] sm:block transition-colors" href="/auth/sign-in">
                  Sign in
                </Link>
                <Link className="inline-flex h-9 items-center gap-2 bg-[#f3f1ea] px-4 text-sm font-medium text-[#0f1011] rounded transition-all hover:bg-white/80" href="/auth/sign-up">
                  Start building
                  <ArrowRightIcon className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-[1440px] px-6 pt-16 sm:px-8 sm:pt-24 lg:px-12 lg:pt-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16 items-start">

          {/* Hero Content Left */}
          <div className="lg:col-span-7 mb-8 sm:mb-8 flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[#191a1b]/40 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#a9aaa7]">
              <span className="size-2 rounded-full bg-[#d7ff73] animate-pulse" />
              Self-driving LLM Telemetry
            </div>

            {/* Custom Heading Requested by User */}
            <h1 className="max-w-[680px] text-[clamp(2.5rem,6vw,5.5rem)] font-extrabold leading-[1.0] tracking-tight text-[#f3f1ea]">
              trace everything <span className="text-[#7d7f79]">.</span><br />
              in one place <span className="text-[#7d7f79]">.</span><br />
              one clean setup <span className="text-[#7d7f79]">.</span><br />
              <span className="text-[#d7ff73]">with scalable telemetry.</span>
            </h1>

            <p className="mt-8 max-w-xl text-base sm:text-lg leading-relaxed text-[#a9aaa7]">
              A high-performance pipeline for wrapping model calls, capturing detailed traces, metrics, latency, and tokens with zero friction.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              {!isSessionPending && session ? (
                <Link className="inline-flex h-11 items-center gap-2 rounded bg-[#d7ff73] px-6 text-sm font-semibold text-[#10140d] hover:bg-[#e1ff91] transition-colors shadow-sm" href="/chat">
                  Go to chat
                  <ArrowRightIcon className="size-4" />
                </Link>
              ) : (
                <Link className="inline-flex h-11 items-center gap-2 rounded bg-[#d7ff73] px-6 text-sm font-semibold text-[#10140d] hover:bg-[#e1ff91] transition-colors shadow-sm" href="/auth/sign-up">
                  Get started free
                  <ArrowRightIcon className="size-4" />
                </Link>
              )}
            </div>
          </div>

          {/* Hero Visual Right (Custom Dither Sink) */}
          <div className="lg:col-span-5 relative w-full flex items-center justify-center" id="trace">
            <HeroDitheringRoot className="overflow-visible relative w-full h-[350px] lg:h-[500px]">
              <HeroDitheringVisual
                className="!block h-full w-full"
                desktopClassName="!rounded-3xl border border-white/10 bg-[#111213] shadow-xl shadow-black/50"
                desktopShaderProps={{
                  colorBack: "#0f1011",
                  colorFront: "#d7ff73",
                  shape: "swirl",
                  type: "4x4",
                  scale: 0.75,
                  speed: 0.8,
                }}
              />

              {/* Telemetry Overlays matching mockup */}
              <div className="absolute inset-4 pointer-events-none flex flex-col justify-between z-20">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-[#a9aaa7] uppercase tracking-widest">
                      <span className="size-1.5 rounded-full bg-[#d7ff73] animate-pulse" />
                      Ingestion_Pipeline: Active
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded border border-white/10 bg-[#191a1b]/80 px-1.5 py-[1px] font-mono text-[8px] text-[#f3f1ea] shadow-sm">BATCH_SIZE: 100</span>
                      <span className="rounded border border-white/10 bg-[#191a1b]/80 px-1.5 py-[1px] font-mono text-[8px] text-[#f3f1ea] shadow-sm">WAIT_MS: 250</span>
                    </div>
                  </div>

                  {/* Provider Tags (top right) */}
                  <div className="flex gap-1 flex-wrap justify-end max-w-[200px]">
                    {[
                      { name: "OPENAI", color: "bg-white" },
                      { name: "ANTHROPIC", color: "bg-[#cc9b7a]" },
                      { name: "GROQ", color: "bg-[#f55036]" },
                      { name: "GEMINI", color: "bg-[#4285f4]" },
                      { name: "LLAMA", color: "bg-[#d7ff73]" },
                    ].map((provider) => (
                      <span key={provider.name} className="flex items-center gap-1 rounded border border-white/10 bg-[#191a1b]/90 px-1.5 py-[2px] font-mono text-[8px] text-[#f3f1ea] shadow-sm">
                        <span className={`size-1 rounded-full ${provider.color}`} />
                        {provider.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-end pb-2">
                  <span className="font-mono text-[10px] font-medium text-[#7d7f79]">SINK_GRAVITY: G_FORCE_1.2</span>
                  <span className="font-mono text-[10px] font-medium text-[#7d7f79]">RESOLVED: 100% TELEMETRY</span>
                </div>
              </div>
            </HeroDitheringRoot>
          </div>

        </div>
      </section>

      {/* Simulated Live Traces Console */}
      <section className="relative w-full bg-[#d7ff73] py-20 mt-16">
        <div className="mx-auto max-w-[1440px] px-6 sm:px-8 lg:px-12">
          <div className="rounded-xl border border-white/10 bg-[#171819] p-6 md:p-8 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center">
              <div>
                <h3 className="text-lg font-semibold text-[#f3f1ea]">Live Ingestion Console</h3>
                <p className="text-xs text-[#a9aaa7] mt-1">Real-time micro-batches written to Prisma database</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#191a1b] px-2.5 py-1 text-xs text-[#a9aaa7] shadow-sm">
                  <Terminal className="size-3.5" />
                  <span>brank-sdk v0.1.0</span>
                </span>
              </div>
            </div>

            <div className="grid gap-6 pt-6 lg:grid-cols-[1.2fr_1fr]">
              {/* Interactive log list */}
              <div className="space-y-2">
                {sampleLogs.map((log, idx) => (
                  <div
                    key={log.trace}
                    onClick={() => setActiveLog(idx)}
                    className={`flex cursor-pointer items-center justify-between rounded border p-3 font-mono text-xs transition-all shadow-sm ${activeLog === idx
                      ? "border-[#d7ff73] bg-[#111213] text-[#d7ff73]"
                      : "border-white/10 bg-[#191a1b] text-[#a9aaa7] hover:border-white/20 hover:bg-[#1f2022]"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${log.provider === "openai" ? "bg-[#10a37f]" :
                        log.provider === "anthropic" ? "bg-[#cc9b7a]" :
                          log.provider === "groq" ? "bg-[#f55036]" : "bg-[#4285f4]"
                        }`} />
                      <span className="font-semibold text-[#f3f1ea]">{log.trace}</span>
                      <span className="text-[#7d7f79]">/</span>
                      <span>{log.provider}:{log.model}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-current opacity-70">{log.tokens} tokens</span>
                      <span className="font-bold text-current">{log.duration}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trace JSON / Metadata Preview */}
              <div className="rounded border border-white/10 bg-[#111213] p-4 font-mono text-[11px] text-[#bfc0bc] shadow-sm">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[10px] text-[#7d7f79] uppercase">
                  <span>Structured Trace JSON</span>
                  <span className="text-[#d7ff73]">Status 200 OK</span>
                </div>
                <pre className="mt-3 overflow-x-auto text-[#f3f1ea] leading-relaxed whitespace-pre-wrap">
                  {`{
  "eventId": "${sampleLogs[activeLog].trace}",
  "type": "completed",
  "provider": "${sampleLogs[activeLog].provider}",
  "model": "${sampleLogs[activeLog].model}",
  "latency": {
    "firstTokenMs": 142,
    "totalMs": ${parseInt(sampleLogs[activeLog].duration)}
  },
  "usage": {
    "promptTokens": 180,
    "completionTokens": ${parseInt(sampleLogs[activeLog].tokens.replace(",", ""))},
    "totalTokens": ${180 + parseInt(sampleLogs[activeLog].tokens.replace(",", ""))}
  },
  "redactedPreview": {
    "input": "Write a scalable ingestion routine for [REDACTED_API_KEY]...",
    "output": "To ingest logs asynchronously, use a micro-batch..."
  }
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grids */}
      <section className="mx-auto bg-[#0f1011] max-w-[1440px] px-6 py-16 sm:px-8 lg:px-12 border-t border-white/10" id="features">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-[#f3f1ea] sm:text-3xl">
            Built for production AI engineering.
          </h2>
          <p className="mt-2 text-sm text-[#a9aaa7]">
            A performant pipeline that gives you complete visibility without introducing application latency.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Activity className="text-[#d7ff73] size-5" />}
            title="Real-time Ingestion"
            description="Micro-batch logging pipeline writes telemetry asynchronously to prevent chat thread blocks."
          />
          <FeatureCard
            icon={<Shield className="text-[#f3f1ea] size-5" />}
            title="PII Redaction boundary"
            description="Regex and key-based filters scrub emails, tokens, and keys at the boundary."
          />
          <FeatureCard
            icon={<Layers className="text-[#d7ff73] size-5" />}
            title="Multi-Provider Registry"
            description="Track OpenAI, Anthropic, Gemini, Groq, and custom endpoints out of the box."
          />
          <FeatureCard
            icon={<Cpu className="text-[#f3f1ea] size-5" />}
            title="Flexible SDK Wrapper"
            description="Trace LLM streams with detailed metrics covering first-token latency, throughput, and errors."
          />
        </div>
      </section>

      <LightboardFooter />
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#191a1b] p-5 hover:border-white/20 transition-all shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded bg-[#111213] border border-white/10 shadow-sm">
        {icon}
      </div>
      <h4 className="mt-4 font-semibold text-[#f3f1ea] text-sm">{title}</h4>
      <p className="mt-2 text-xs leading-relaxed text-[#a9aaa7]">{description}</p>
    </div>
  );
}
