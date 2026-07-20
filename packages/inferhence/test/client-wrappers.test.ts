import { describe, expect, test } from "bun:test";
import { wrapOpenAI, wrapAnthropic, createMemoryTransport } from "../src";

describe("wrapOpenAI client wrapper", () => {
  test("intercepts non-streaming completions and captures metrics/telemetry", async () => {
    const transport = createMemoryTransport();
    
    // Mock OpenAI client
    const mockOpenAI = {
      chat: {
        completions: {
          async create(body: any) {
            return {
              choices: [{ message: { content: "Mocked response text" } }],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 15,
                total_tokens: 25
              }
            };
          }
        }
      }
    };

    const wrapped = wrapOpenAI(mockOpenAI, {
      transport,
      metadata: {
        conversationId: "test-conv",
      }
    });

    const response = await wrapped.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello!" }],
      stream: false
    });

    expect(response.choices[0].message.content).toBe("Mocked response text");
    expect(transport.events.map(e => e.eventType)).toEqual(["started", "completed"]);
    const finalEvent = transport.events.at(-1)!;
    expect(finalEvent.usage).toEqual({ input: 10, output: 15, total: 25 });
    expect(finalEvent.previews.output).toContain("Mocked response text");
    expect(finalEvent.model).toBe("gpt-4");
    expect(finalEvent.provider).toBe("openai");
  });

  test("intercepts streaming completions", async () => {
    const transport = createMemoryTransport();

    // Mock AsyncIterable stream generator
    async function* mockStream() {
      yield { choices: [{ delta: { content: "Hello " } }] };
      yield { choices: [{ delta: { content: "world" } }] };
      yield { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } };
    }

    const mockOpenAI = {
      chat: {
        completions: {
          create(body: any) {
            return mockStream();
          }
        }
      }
    };

    const wrapped = wrapOpenAI(mockOpenAI, {
      transport,
      metadata: {
        conversationId: "test-conv-stream",
      }
    });

    const stream = await wrapped.chat.completions.create({
      model: "gpt-4-stream",
      messages: [{ role: "user", content: "Hello!" }],
      stream: true
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(3);
    expect(transport.events.map(e => e.eventType)).toEqual(["started", "first_token", "completed"]);
    const finalEvent = transport.events.at(-1)!;
    expect(finalEvent.previews.output).toBe("Hello world");
    expect(finalEvent.usage).toEqual({ input: 5, output: 2, total: 7 });
    expect(finalEvent.model).toBe("gpt-4-stream");
    expect(finalEvent.provider).toBe("openai");
  });
});

describe("wrapAnthropic client wrapper", () => {
  test("intercepts non-streaming messages and captures metrics/telemetry", async () => {
    const transport = createMemoryTransport();

    const mockAnthropic = {
      messages: {
        async create(body: any) {
          return {
            content: [{ text: "Mocked Anthropic response" }],
            usage: {
              input_tokens: 12,
              output_tokens: 8
            }
          };
        }
      }
    };

    const wrapped = wrapAnthropic(mockAnthropic, {
      transport,
      metadata: {
        conversationId: "anthropic-test-conv",
      }
    });

    const response = await wrapped.messages.create({
      model: "claude-3",
      messages: [{ role: "user", content: "Hello!" }],
      stream: false
    });

    expect(response.content[0].text).toBe("Mocked Anthropic response");
    expect(transport.events.map(e => e.eventType)).toEqual(["started", "completed"]);
    const finalEvent = transport.events.at(-1)!;
    expect(finalEvent.usage).toEqual({ input: 12, output: 8, total: 20 });
    expect(finalEvent.previews.output).toContain("Mocked Anthropic response");
    expect(finalEvent.model).toBe("claude-3");
    expect(finalEvent.provider).toBe("anthropic");
  });

  test("intercepts streaming messages", async () => {
    const transport = createMemoryTransport();

    async function* mockStream() {
      yield { type: "content_block_start", content_block: { text: "Hello " } };
      yield { type: "content_block_delta", delta: { text: "world" } };
      yield { type: "message_delta", usage: { input_tokens: 6, output_tokens: 2 } };
    }

    const mockAnthropic = {
      messages: {
        create(body: any) {
          return mockStream();
        }
      }
    };

    const wrapped = wrapAnthropic(mockAnthropic, {
      transport,
      metadata: {
        conversationId: "anthropic-stream",
      }
    });

    const stream = await wrapped.messages.create({
      model: "claude-3-stream",
      messages: [{ role: "user", content: "Hello!" }],
      stream: true
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(3);
    expect(transport.events.map(e => e.eventType)).toEqual(["started", "first_token", "completed"]);
    const finalEvent = transport.events.at(-1)!;
    expect(finalEvent.previews.output).toBe("Hello world");
    expect(finalEvent.usage).toEqual({ input: 6, output: 2, total: 8 });
  });
});
