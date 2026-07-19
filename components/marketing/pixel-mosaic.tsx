"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// Seeded pseudo-random for consistent grid across renders
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const COLS = 22;
const ROWS = 14;
const TOTAL = COLS * ROWS;

// Brand palette — dark base to neon green, rich gradient
const PALETTE = [
  "#0b0c0c",
  "#0f1011",
  "#121314",
  "#161818",
  "#1b1e1d",
  "#212523",
  "#28302b",
  "#313d32",
  "#3d4e3a",
  "#4a6140",
  "#5a7a44",
  "#6d9640",
  "#82b238",
  "#9bca24",
  "#b0de34",
  "#c8ef68",
  "#d7ff73",
];

function getColorIndex(
  col: number,
  row: number,
  time: number,
  rand: number
): number {
  // Primary diagonal wave — slow, sweeping
  const diag = (col - row * 0.8) / (COLS + ROWS);
  const wave1 = Math.sin(diag * Math.PI * 2.5 + time * 0.35) * 0.5 + 0.5;

  // Counter-diagonal, slower
  const wave2 =
    Math.sin(((col * 0.6 + row) / (COLS + ROWS)) * Math.PI * 2 - time * 0.2) *
      0.5 +
    0.5;

  // Soft radial breathing
  const cx = col / COLS - 0.55;
  const cy = row / ROWS - 0.45;
  const dist = Math.sqrt(cx * cx + cy * cy);
  const radial = Math.sin(dist * 5 - time * 0.25) * 0.5 + 0.5;

  // Compose — wave dominant, radial adds depth, randomness adds texture
  const v = wave1 * 0.50 + wave2 * 0.22 + radial * 0.18 + rand * 0.10;
  const idx = Math.floor(v * (PALETTE.length - 1));
  return Math.max(0, Math.min(PALETTE.length - 1, idx));
}

export function PixelMosaic({ className }: { className?: string }) {
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const glowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const rands = useMemo(() => {
    const rng = seeded(42);
    return Array.from({ length: TOTAL }, () => rng());
  }, []);

  // Stagger delays for initial entrance
  const delays = useMemo(() => {
    const d: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        // Diagonal stagger from top-right
        const diagDist = (COLS - col + row) / (COLS + ROWS);
        d.push(diagDist * 0.6);
      }
    }
    return d;
  }, []);

  // Single RAF loop that updates all cells
  useEffect(() => {
    let raf: number;
    let t = 0;

    const tick = () => {
      t += 0.012; // Slow time progression

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const idx = row * COLS + col;
          const el = cellRefs.current[idx];
          if (!el) continue;

          const colorIdx = getColorIndex(col, row, t, rands[idx]);
          const color = PALETTE[colorIdx];
          el.style.backgroundColor = color;

          // Update glow
          const glowEl = glowRefs.current[idx];
          if (glowEl) {
            const isGlowing = colorIdx >= PALETTE.length - 4;
            if (isGlowing) {
              const intensity = (colorIdx - (PALETTE.length - 4)) / 4;
              glowEl.style.opacity = String(intensity * 0.5);
              glowEl.style.boxShadow = `0 0 ${6 + intensity * 10}px ${color}`;
            } else {
              glowEl.style.opacity = "0";
            }
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rands]);

  const setCellRef = useCallback(
    (idx: number) => (el: HTMLDivElement | null) => {
      cellRefs.current[idx] = el;
    },
    []
  );

  const setGlowRef = useCallback(
    (idx: number) => (el: HTMLDivElement | null) => {
      glowRefs.current[idx] = el;
    },
    []
  );

  const cells = useMemo(() => {
    const items: { col: number; row: number; idx: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        items.push({ col, row, idx: row * COLS + col });
      }
    }
    return items;
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        className
      )}
    >
      {/* The pixel grid */}
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          gap: "2px",
          backgroundColor: "#08090a",
          padding: "2px",
        }}
      >
        {cells.map(({ col, row, idx }) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 1.4,
              delay: delays[idx],
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative rounded-[2px]"
            style={{ backgroundColor: PALETTE[0] }}
            ref={setCellRef(idx)}
          >
            <div
              ref={setGlowRef(idx)}
              className="absolute inset-0 rounded-[2px]"
              style={{ opacity: 0, transition: "none" }}
            />
          </motion.div>
        ))}
      </div>

      {/* Soft edge vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, rgba(15,16,17,0.55) 100%)",
        }}
      />
      {/* Top/bottom fade to page bg */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0f1011]/50 via-transparent to-[#0f1011]/50" />
    </div>
  );
}
