import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { buildChatMessageRows } from "@/lib/chat-storage";

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const assistantMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
});

describe("chat history persistence", () => {
  test("appends only unsaved messages after the current conversation sequence", () => {
    const rows = buildChatMessageRows({
      conversationId: "conversation-1",
      provider: "openai",
      model: "gpt-test",
      requestId: "request-2",
      traceId: "trace-2",
      messages: [
        userMessage("user-1", "first prompt"),
        assistantMessage("assistant-1", "first answer"),
        userMessage("user-2", "follow-up prompt"),
      ],
      existingMessageIds: new Set(["user-1", "assistant-1"]),
      nextSequence: 2,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: "user-2",
      role: "user",
      sequence: 2,
      content: "follow-up prompt",
    }));
  });

  test("stores assistant responses as normal chat messages", () => {
    const rows = buildChatMessageRows({
      conversationId: "conversation-1",
      provider: "anthropic",
      model: "claude-test",
      requestId: "request-1",
      traceId: "trace-1",
      messages: [assistantMessage("assistant-1", "streamed answer")],
      existingMessageIds: new Set(),
      nextSequence: 1,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        role: "assistant",
        sequence: 1,
        content: "streamed answer",
        provider: "anthropic",
        model: "claude-test",
      }),
    ]);
  });
});
