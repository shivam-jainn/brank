import React from "react";

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="dark relative flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
