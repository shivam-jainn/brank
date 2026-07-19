"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SunIcon, MoonIcon } from "lucide-react";

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  // Default to dark theme for a premium feel
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background text-foreground transition-colors duration-200">
      {/* Top Navbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 backdrop-blur px-6 z-10">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base tracking-tight">Brank AI</span>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium border border-primary/20">Beta</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">v0.1.0</span>
        </div>
      </header>
      {children}
    </div>
  );
}
