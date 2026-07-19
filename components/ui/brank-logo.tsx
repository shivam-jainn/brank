"use client";

import { cn } from "@/lib/utils";

interface BrankLogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

export function BrankLogo({
  className,
  iconClassName,
  textClassName,
  showText = true,
}: BrankLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5 group select-none", className)}>
      <span
        className={cn(
          "flex size-7 items-center justify-center border border-white/10 bg-[#141516] rounded-md font-bold text-[#f3f1ea] text-[13px] tracking-tight shrink-0 transition-all duration-200 group-hover:border-white/20 group-hover:bg-[#1a1b1c]",
          iconClassName
        )}
      >
        B
      </span>
      {showText && (
        <span
          className={cn(
            "text-base font-semibold tracking-tight text-[#f3f1ea]",
            textClassName
          )}
        >
          Brank
        </span>
      )}
    </div>
  );
}
