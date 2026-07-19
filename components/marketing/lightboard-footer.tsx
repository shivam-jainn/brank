"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function LightboardFooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const gap = 24;
    const radius = 2;

    const cells: { x: number; y: number; active: number }[] = [];

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = 400; // Footer height

      cells.length = 0;
      for (let y = gap / 2; y < height; y += gap) {
        for (let x = gap / 2; x < width; x += gap) {
          cells.push({ x, y, active: 0 });
        }
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    let mouseX = -100;
    let mouseY = -100;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseX = -100;
      mouseY = -100;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    let animationId: number;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw lightboard
      cells.forEach((cell) => {
        // Distance to mouse
        const dx = cell.x - mouseX;
        const dy = cell.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 80) {
          cell.active = 1.0;
        } else {
          cell.active = Math.max(0, cell.active - 0.02);
        }

        ctx.beginPath();
        ctx.arc(cell.x, cell.y, radius + (cell.active * 1.5), 0, Math.PI * 2);
        
        if (cell.active > 0) {
          ctx.fillStyle = `rgba(215, 255, 115, ${cell.active})`; // #d7ff73
          ctx.shadowColor = "#d7ff73";
          ctx.shadowBlur = 10 * cell.active;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
          ctx.shadowBlur = 0;
        }
        
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const [text, setText] = useState("");
  const fullText = "systemctl start brank-telemetry.service...";
  
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setText(fullText.substring(0, i));
      i++;
      if (i > fullText.length) i = 0;
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="relative h-[400px] w-full overflow-hidden bg-[#0f1011] border-t border-white/10 flex flex-col items-center justify-center">
      {/* Lightboard Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full cursor-crosshair"
      />

      <div className="relative z-10 flex flex-col items-center max-w-xl text-center px-6 pointer-events-none">
        
        {/* Dynamic Island Style Pill */}
        <div className="mb-8 flex items-center justify-center pointer-events-auto">
          <div className="group flex h-12 items-center gap-3 rounded-full bg-[#f3f1ea] pl-5 pr-2 text-[#0f1011] transition-all duration-500 ease-out hover:scale-105 hover:pr-4">
            <span className="text-sm font-medium tracking-tight">Deploy your sink</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d7ff73] text-[#0f1011] transition-transform duration-500 group-hover:rotate-45">
              <ArrowRightIcon className="h-4 w-4" />
            </div>
          </div>
        </div>

        <h3 className="text-4xl font-extrabold tracking-tight text-[#f3f1ea] sm:text-5xl">
          Start tracing today.
        </h3>
        
        {/* Terminal Animation */}
        <div className="mt-6 flex h-10 w-fit min-w-[280px] items-center rounded-md border border-white/10 bg-white/5 px-4 font-mono text-xs text-[#a9aaa7] shadow-inner">
          <span className="mr-2 text-[#d7ff73]">$</span>
          <span>{text}</span>
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-white" />
        </div>
      </div>

      <div className="absolute bottom-6 left-6 right-6 z-10 flex items-center justify-between text-xs font-medium text-[#7d7f79]">
        <span>© 2026 Brank Inc.</span>
        <div className="flex gap-6">
          <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="#" className="hover:text-white transition-colors">Terms</Link>
          <Link href="#" className="hover:text-white transition-colors">Twitter</Link>
        </div>
      </div>
    </footer>
  );
}
