"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  angle: number;
  speed: number;
  distance: number;
  provider: string;
}

const PROVIDERS = [
  { name: "openai", color: "#111111" },
  { name: "anthropic", color: "#333333" },
  { name: "groq", color: "#555555" },
  { name: "gemini", color: "#9bca24" },
  { name: "llama", color: "#d7ff73" },
];

export function DitherSink({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = canvas.width = 600;
    let height = canvas.height = 400;

    const handleResize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      width = canvas.width = Math.floor(rect.width);
      height = canvas.height = Math.floor(rect.height || 400);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const particles: Particle[] = [];
    const maxParticles = 120;
    const sinkX = () => width / 2;
    const sinkY = () => height * 0.75; // Sink located in the lower-middle

    const createParticle = (initial = false): Particle => {
      const p = PROVIDERS[Math.floor(Math.random() * PROVIDERS.length)];
      
      const x = Math.random() * width;
      const y = initial ? Math.random() * height : -20 - Math.random() * 50;
      
      return {
        x,
        y,
        vx: 0,
        vy: 2 + Math.random() * 2,
        size: 2 + Math.random() * 2,
        color: p.color,
        alpha: Math.random() * 0.5 + 0.5,
        angle: 0,
        speed: 2 + Math.random() * 2,
        distance: 0,
        provider: p.name,
      };
    };

    // Initialize particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push(createParticle(true));
    }

    // 4x4 Bayer Dither Matrix for custom thresholding
    const bayer = [
      [ 0,  8,  2, 10],
      [12,  4, 14,  6],
      [ 3, 11,  1,  9],
      [15,  7, 13,  5]
    ];

    const animate = () => {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(0, 0, width, height);

      const sx = sinkX();
      const sy = sinkY();

      // Draw subtle sink funnel
      ctx.strokeStyle = "rgba(17, 17, 17, 0.05)";
      ctx.lineWidth = 1;
      for (let r = 40; r < 300; r += 40) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      particles.forEach((p, idx) => {
        const dx = sx - p.x;
        const dy = sy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10 || p.y > height + 20) {
          particles[idx] = createParticle(false);
          return;
        }

        // Funnel physics: gently pull towards center X as they get lower
        const pullStrength = Math.max(0, (p.y / height) * 0.1);
        p.vx = p.vx * 0.95 + (dx > 0 ? pullStrength : -pullStrength) * 5;
        p.vy += 0.05; // gravity

        p.x += p.vx;
        p.y += p.vy;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * Math.min(1, dist / 50); // fade out near center
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.floor(p.size), Math.floor(p.size));
        
        // Connect close particles with thin lines
        if (dist < 80 && Math.random() < 0.05) {
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = 0.1;
          ctx.beginPath();
          ctx.moveTo(Math.floor(p.x), Math.floor(p.y));
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      });

      ctx.globalAlpha = 1.0;

      // Draw active sink core (pulsing glowing dot-matrix center)
      const corePulse = Math.sin(Date.now() * 0.008) * 4 + 8;
      ctx.fillStyle = "#111111";
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Outer glow of sink
      const gradient = ctx.createRadialGradient(sx, sy, 2, sx, sy, corePulse * 2);
      gradient.addColorStop(0, "rgba(17, 17, 17, 0.15)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx, sy, corePulse * 2, 0, Math.PI * 2);
      ctx.fill();

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-[350px] w-full items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm md:h-[450px]",
        className
      )}
      ref={containerRef}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(17,17,17,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.06)_1px,transparent_1px)] bg-[size:24px_24px] opacity-100" />
      
      {/* Light overlay fade at borders */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-white" />
      <div className="absolute inset-0 bg-gradient-to-r from-white via-transparent to-white" />

      <canvas
        className="relative z-10 block h-full w-full object-cover"
        ref={canvasRef}
        style={{ imageRendering: "pixelated" }}
      />

      {/* Observability HUD Elements overlays */}
      <div className="absolute top-4 left-4 z-20 font-mono text-[10px] tracking-wider text-black/45">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9bca24]" />
          <span>INGESTION_PIPELINE: ACTIVE</span>
        </div>
        <div className="mt-1 text-black/40">BATCH_SIZE: 100 | WAIT_MS: 250</div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-2 font-mono text-[9px] text-black/50">
        {PROVIDERS.map((p) => (
          <div className="flex items-center gap-1 border border-black/10 bg-white/60 px-2 py-0.5 rounded" key={p.name}>
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name.toUpperCase()}</span>
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 z-20 font-mono text-[10px] text-black/45">
        <span>SINK_GRAVITY: G_FORCE_1.2</span>
      </div>

      <div className="absolute bottom-4 right-4 z-20 font-mono text-[10px] text-black/45">
        <span>RESOLVED: 100% TELEMETRY</span>
      </div>
    </div>
  );
}
