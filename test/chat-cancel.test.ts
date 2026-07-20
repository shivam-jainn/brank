import { describe, expect, test, mock } from "bun:test";
import { POST } from "@/app/api/chat/route";
import type { UIMessage } from "ai";

const mockPersistChatResponse = mock(() => Promise.resolve());
const mockPersistChatRequest = mock(() => Promise.resolve());

mock.module("@/lib/chat-storage", () => ({
  persistChatRequest: mockPersistChatRequest,
  persistChatResponse: mockPersistChatResponse,
}));

mock.module("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(null) } },
}));

// Mock the AI SDK streamText call
mock.module("ai", () => {
  const original = require("ai");
  return {
    ...original,
    streamText: () => {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-delta", text: "Hello" });
            controller.enqueue({ type: "text-delta", text: " world" });
          },
        }),
      };
    },
  };
});

describe("chat API stream cancellation", () => {
  test("saves the partial response when the response stream is cancelled", async () => {
    mockPersistChatResponse.mockClear();

    const messages: UIMessage[] = [
      { id: "user-1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }
    ];

    const controller = new AbortController();
    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages,
        model: "openai:gpt-4o",
      }),
      signal: controller.signal,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    // Read the first chunk
    const chunk1 = await reader?.read();
    expect(chunk1?.done).toBe(false);

    // Cancel the response stream and abort the request to simulate client cancellation
    controller.abort();
    await reader?.cancel();

    // Give a microtask delay for async save to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify that persistChatResponse was called with the partial text
    expect(mockPersistChatResponse).toHaveBeenCalled();
    const callArgs = mockPersistChatResponse.mock.calls[0][0];
    expect(callArgs.message.parts[0].text).toContain("Hello");
  });
});
