"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

export function LightboardFooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const gap = 14;
    const radius = 1.8;

    const cells: { x: number; y: number; active: number; isPreShape?: boolean }[] = [];

    const pixelB = [
      [1, 1, 1, 0, 0],
      [1, 0, 0, 1, 0],
      [1, 1, 1, 0, 0],
      [1, 0, 0, 1, 0],
      [1, 1, 1, 0, 0]
    ];
    
    const pixelHeart = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0]
    ];

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = 400; // Footer height

      cells.length = 0;
      const cols = Math.floor(width / gap);
      const rows = Math.floor(height / gap);

      // Align B and heart to bottom-right corner (3 cells padding)
      const startCol = cols - 14; 
      const startRow = rows - 8;

      for (let yIndex = 0; yIndex < rows; yIndex++) {
        const y = yIndex * gap + gap / 2;
        for (let xIndex = 0; xIndex < cols; xIndex++) {
          const x = xIndex * gap + gap / 2;
          
          let isPreShape = false;
          const r = yIndex - startRow;
          const c = xIndex - startCol;

          if (r >= 0 && r < 5 && c >= 0 && c < 11) {
            if (c < 5) {
              if (pixelB[r][c] === 1) isPreShape = true;
            } else if (c > 5) {
              if (pixelHeart[r][c - 6] === 1) isPreShape = true;
            }
          }

          cells.push({ x, y, active: 0, isPreShape });
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

      const time = Date.now() / 800;
      const breathingGlow = 0.35 + Math.sin(time) * 0.15; // fluctuates between 0.2 and 0.5

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

        const currentActive = cell.isPreShape
          ? Math.max(breathingGlow, cell.active)
          : cell.active;

        ctx.beginPath();
        ctx.arc(cell.x, cell.y, radius + (currentActive * 1.5), 0, Math.PI * 2);
        
        if (currentActive > 0) {
          ctx.fillStyle = `rgba(215, 255, 115, ${currentActive})`; // #d7ff73
          ctx.shadowColor = "#d7ff73";
          ctx.shadowBlur = 10 * currentActive;
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
          <div className="group relative flex h-12 items-center gap-3 rounded-full bg-[#f3f1ea] pl-5 pr-2 text-[#0f1011] transition-all duration-500 ease-out hover:scale-105 hover:pr-4 shadow-[0_0_0_0_rgba(215,255,115,0)] hover:shadow-[0_0_20px_5px_rgba(215,255,115,0.4)] border border-white/10 cursor-pointer overflow-hidden">
            {/* Shimmer gloss effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            
            <span className="relative z-10 text-sm font-semibold tracking-tight">Deploy your sink</span>
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#d7ff73] text-[#0f1011] transition-all duration-500 group-hover:rotate-45 group-hover:scale-110 group-hover:bg-white shadow-sm">
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        <h3 className="text-4xl font-extrabold tracking-tight text-[#f3f1ea] sm:text-5xl">
          Start tracing today.
        </h3>
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
