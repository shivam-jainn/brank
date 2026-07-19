"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
  pulse: number;
}

interface ProviderNode {
  name: string;
  color: string;
  x: number;
  y: number;
  pulse: number;
}

export function TelemetryFlow({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = 600);
    let height = (canvas.height = 500);

    const handleResize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      width = canvas.width = Math.floor(rect.width);
      height = canvas.height = Math.floor(rect.height || 500);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const providers: ProviderNode[] = [
      { name: "OPENAI", color: "#FFFFFF", x: 0.15, y: 0.25, pulse: 0 },
      { name: "ANTHROPIC", color: "#CC9B7A", x: 0.32, y: 0.15, pulse: 0 },
      { name: "GROQ", color: "#F55036", x: 0.5, y: 0.12, pulse: 0 },
      { name: "GEMINI", color: "#4285f4", x: 0.68, y: 0.15, pulse: 0 },
      { name: "LLAMA", color: "#D7FF73", x: 0.85, y: 0.25, pulse: 0 },
    ];

    const particles: Particle[] = [];
    let particleId = 0;
    const ripples: { x: number; y: number; radius: number; maxRadius: number; color: string; alpha: number }[] = [];

    const spawnParticle = (provider: ProviderNode) => {
      const startX = provider.x * width;
      const startY = provider.y * height;
      const targetX = width / 2;
      const targetY = height * 0.72;

      particles.push({
        id: particleId++,
        startX,
        startY,
        x: startX,
        y: startY,
        targetX,
        targetY,
        progress: 0,
        speed: 0.008 + Math.random() * 0.012,
        color: provider.color,
        size: 2 + Math.random() * 3,
        pulse: Math.random() * Math.PI,
      });
    };

    // Spawn ticker
    let spawnTimer = 0;

    const animate = () => {
      // Dark slate fade background for trail effect
      ctx.fillStyle = "rgba(15, 16, 17, 0.12)";
      ctx.fillRect(0, 0, width, height);

      const sinkX = width / 2;
      const sinkY = height * 0.72;

      // Draw Grid Pattern
      ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
      ctx.lineWidth = 1;
      const gridSize = 30;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 1. Draw Connecting Paths
      providers.forEach((p) => {
        const px = p.x * width;
        const py = p.y * height;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        // Draw elegant curve to central pipeline node
        ctx.bezierCurveTo(px, (py + sinkY) / 2, sinkX, (py + sinkY) / 2, sinkX, sinkY);
        ctx.stroke();
      });

      // 2. Spawn new particles
      spawnTimer++;
      if (spawnTimer % 8 === 0) {
        const randomProvider = providers[Math.floor(Math.random() * providers.length)];
        spawnParticle(randomProvider);
        randomProvider.pulse = 1.0; // Trigger pulse visual on provider
      }

      // 3. Update & Draw Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress += p.speed;

        // Bezier interpolation
        const t = p.progress;
        const px = p.startX;
        const py = p.startY;
        const mx = px;
        const my = (py + sinkY) / 2;
        const targetX = p.targetX;
        const targetY = p.targetY;

        // Quadratic bezier formula
        p.x = (1 - t) * (1 - t) * px + 2 * (1 - t) * t * mx + t * t * targetX;
        p.y = (1 - t) * (1 - t) * py + 2 * (1 - t) * t * my + t * t * targetY;

        // Glowing packet look
        const glowRad = p.size * (1.5 + Math.sin(t * 10 + p.pulse) * 0.4);
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRad / 2, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Reach target
        if (p.progress >= 1.0) {
          // Trigger ripple at sink
          ripples.push({
            x: sinkX,
            y: sinkY,
            radius: 2,
            maxRadius: 30 + Math.random() * 20,
            color: p.color,
            alpha: 1.0,
          });
          particles.splice(i, 1);
        }
      }

      // 4. Update & Draw Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += 1.5;
        r.alpha -= 0.035;

        if (r.alpha <= 0) {
          ripples.splice(i, 1);
        } else {
          ctx.strokeStyle = r.color;
          ctx.globalAlpha = r.alpha * 0.4;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }

      // 5. Draw Central Ingestion Pipeline Node
      const centralPulse = Math.sin(Date.now() * 0.005) * 5 + 25;
      
      // Central Glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#D7FF73";
      ctx.fillStyle = "rgba(215, 255, 115, 0.15)";
      ctx.beginPath();
      ctx.arc(sinkX, sinkY, centralPulse + 10, 0, Math.PI * 2);
      ctx.fill();

      // Inner Core Ring
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#D7FF73";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sinkX, sinkY, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Solid Core Center
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#111213";
      ctx.beginPath();
      ctx.arc(sinkX, sinkY, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#D7FF73";
      ctx.beginPath();
      ctx.arc(sinkX, sinkY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Central core HUD text
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = "#D7FF73";
      ctx.textAlign = "center";
      ctx.fillText("DB_SINK", sinkX, sinkY + 30);

      // 6. Draw Provider Source Nodes
      providers.forEach((p) => {
        const px = p.x * width;
        const py = p.y * height;

        // Decay pulse
        p.pulse *= 0.92;

        // Outer Ring
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1 + p.pulse * 2;
        ctx.beginPath();
        ctx.arc(px, py, 8 + p.pulse * 6, 0, Math.PI * 2);
        ctx.stroke();

        // Inner solid dot
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.font = "8px monospace";
        ctx.fillStyle = "rgba(243, 241, 234, 0.8)";
        ctx.textAlign = "center";
        ctx.fillText(p.name, px, py - 14);
      });

      setActiveCount(particles.length);
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
        "relative flex h-[350px] w-full items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[#0f1011] shadow-xl shadow-black/50 md:h-[450px] lg:h-[500px]",
        className
      )}
      ref={containerRef}
    >
      <canvas
        className="relative z-10 block h-full w-full object-cover"
        ref={canvasRef}
      />
    </div>
  );
}
