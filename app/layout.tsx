import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Brank — LLM inference observability",
  description: "Multi-provider LLM chat with latency, token, failure, and ingestion telemetry built in.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans")}
    >
      <body className="h-full flex flex-col bg-white text-black">{children}</body>
    </html>
  );
}
