"use client";

import { useQuery } from "@tanstack/react-query";
import { getStableBrowserId } from "@/lib/browser-id";

export const CONVERSATIONS_QUERY_KEY = ["conversations", "recent"] as const;

export type SavedConversation = {
  id: string;
  title: string | null;
  messages: SavedChatMessage[];
};

export type SavedChatMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

async function fetchConversations(): Promise<SavedConversation[]> {
  const res = await fetch("/api/conversations", {
    headers: { "x-session-id": getStableBrowserId("brank-session-id") },
  });
  if (!res.ok) {
    throw new Error(`Failed to load conversations: ${res.status}`);
  }
  return res.json();
}

export function useRecentConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: fetchConversations,
    gcTime: 1000 * 60 * 30,
    staleTime: 1000 * 60 * 5,
  });
}
