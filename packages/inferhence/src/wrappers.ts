import { buildEvent, defaultClock, defaultIdFactory } from "./events";
import { redactStringsDeep, redactTextAsync } from "./redaction";
import type { ProgressPolicy, TokenUsage, WrapperOptions } from "./types";

export type CompletionResult<T> = {
  response: T;
  output?: unknown;
  usage?: TokenUsage;
};

export async function withInference<T>(
  input: unknown,
  call: (signal?: AbortSignal) => Promise<T | CompletionResult<T>>,
  options: WrapperOptions,
): Promise<T> {
  const clock = options.clock ?? defaultClock;
  const idFactory = options.idFactory ?? defaultIdFactory;
  const startedAtMs = clock();
  let sequence = 0;

  const redactedInput = options.redaction
    ? await redactStringsDeep(input, options.redaction)
    : input;

  const emit = async (eventType: Parameters<typeof buildEvent>[1], args: Parameters<typeof buildEvent>[2] = {}) => {
    const redactedOutput = args.output !== undefined && typeof args.output === "string" && options.redaction
      ? (await redactTextAsync(args.output, options.redaction)).value
      : args.output;

    await options.transport.send(buildEvent({
      metadata: options.metadata,
      input: redactedInput,
      startedAtMs,
      sequence: sequence++,
      clock,
      idFactory,
      redaction: options.redaction,
    }, eventType, { ...args, output: redactedOutput }));
  };

  await emit("started");

  try {
    const result = await call(options.signal);
    const normalized = normalizeCompletionResult(result);
    const output = normalized.output ?? normalized.response;
    await emit("completed", {
      output,
      usage: withEstimatedUsage(redactedInput, output, normalized.usage),
      completed: true,
    });
    return normalized.response;
  } catch (error) {
    await emit(isAbortError(error) || options.signal?.aborted ? "cancelled" : "failed", {
      error,
      completed: true,
    });
    throw error;
  }
}

export async function* withStreamingInference<TChunk>(
  input: unknown,
  streamFactory: (signal?: AbortSignal) => AsyncIterable<TChunk>,
  options: WrapperOptions & {
    chunkToText?: (chunk: TChunk) => string;
    usageFromChunk?: (chunk: TChunk) => TokenUsage | undefined;
  },
): AsyncIterable<TChunk> {
  const clock = options.clock ?? defaultClock;
  const idFactory = options.idFactory ?? defaultIdFactory;
  const startedAtMs = clock();
  const chunks: TChunk[] = [];
  let output = "";
  let sequence = 0;
  let firstTokenEmitted = false;
  let lastProgressAt = startedAtMs;
  let chunksSinceProgress = 0;
  let tokensSinceProgress = 0;
  let usage: TokenUsage | undefined;

  const redactedInput = options.redaction
    ? await redactStringsDeep(input, options.redaction)
    : input;

  const emit = async (eventType: Parameters<typeof buildEvent>[1], args: Parameters<typeof buildEvent>[2] = {}) => {
    const redactedOutput = args.output !== undefined && typeof args.output === "string" && options.redaction
      ? (await redactTextAsync(args.output, options.redaction)).value
      : args.output;

    await options.transport.send(buildEvent({
      metadata: options.metadata,
      input: redactedInput,
      startedAtMs,
      sequence: sequence++,
      clock,
      idFactory,
      redaction: options.redaction,
    }, eventType, { ...args, output: redactedOutput }));
  };

  await emit("started");

  try {
    const stream = await streamFactory(options.signal);
    for await (const chunk of stream) {
      chunks.push(chunk);
      const text = options.chunkToText?.(chunk) ?? String(chunk);
      output += text;
      usage = mergeUsage(usage, options.usageFromChunk?.(chunk));

      if (!firstTokenEmitted && text.length > 0) {
        firstTokenEmitted = true;
        await emit("first_token", { output });
      }

      chunksSinceProgress += 1;
      tokensSinceProgress += estimateTokens(text);
      if (shouldEmitProgress(options.progress, clock(), lastProgressAt, chunksSinceProgress, tokensSinceProgress)) {
        await emit("progress", { output, usage });
        lastProgressAt = clock();
        chunksSinceProgress = 0;
        tokensSinceProgress = 0;
      }

      yield chunk;
    }

    if (options.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    await emit("completed", { output, usage: withEstimatedUsage(redactedInput, output, usage), completed: true });
  } catch (error) {
    await emit(isAbortError(error) || options.signal?.aborted ? "cancelled" : "failed", {
      output,
      usage: withEstimatedUsage(redactedInput, output, usage),
      error,
      completed: true,
    });
    throw error;
  }
}

export function withReadableStreamingInference<TChunk>(
  input: unknown,
  streamFactory: (signal?: AbortSignal) => ReadableStream<TChunk>,
  options: WrapperOptions & {
    chunkToText?: (chunk: TChunk) => string;
    usageFromChunk?: (chunk: TChunk) => TokenUsage | undefined;
  },
): ReadableStream<TChunk> {
  let activeReader: ReadableStreamDefaultReader<TChunk> | undefined;

  const iterable = withStreamingInference(
    input,
    (signal) => {
      const stream = streamFactory(signal);
      return readableStreamToAsyncIterable(stream, (reader) => {
        activeReader = reader;
      });
    },
    options,
  );
  const iterator = iterable[Symbol.asyncIterator]();

  let abortedListener: (() => void) | undefined;

  const cleanup = () => {
    if (abortedListener && options.signal) {
      options.signal.removeEventListener("abort", abortedListener);
      abortedListener = undefined;
    }
  };

  if (options.signal) {
    abortedListener = async () => {
      cleanup();
      
      if (activeReader) {
        try {
          await activeReader.cancel(new DOMException("The operation was aborted.", "AbortError"));
        } catch (e) {
          // swallow
        }
      }

      const error = new DOMException("The operation was aborted.", "AbortError");
      try {
        await iterator.throw?.(error);
      } catch (e) {
        // swallow
      }
      await iterator.return?.();
    };

    if (options.signal.aborted) {
      abortedListener();
    } else {
      options.signal.addEventListener("abort", abortedListener);
    }
  }

  return new ReadableStream<TChunk>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          cleanup();
          controller.close();
          return;
        }

        controller.enqueue(next.value);
      } catch (err) {
        cleanup();
        controller.error(err);
      }
    },
    async cancel(reason) {
      cleanup();
      const error = (reason instanceof Error && (reason.name === "AbortError" || reason.message.toLowerCase().includes("abort") || reason.message.toLowerCase().includes("cancel")))
        ? reason
        : new DOMException("The operation was aborted.", "AbortError");
      try {
        await iterator.throw?.(error);
      } catch (e) {
        if (!isAbortError(e)) {
          throw e;
        }
      }
      await iterator.return?.();
    },
  });
}

function normalizeCompletionResult<T>(result: T | CompletionResult<T>): CompletionResult<T> {
  if (
    result &&
    typeof result === "object" &&
    "response" in result
  ) {
    return result as CompletionResult<T>;
  }

  return { response: result as T, output: result };
}

async function* readableStreamToAsyncIterable<TChunk>(
  stream: ReadableStream<TChunk>,
  onReader?: (reader: ReadableStreamDefaultReader<TChunk>) => void,
): AsyncIterable<TChunk> {
  const reader = stream.getReader();
  onReader?.(reader);

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        return;
      }

      yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function isAbortError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const status = (error as any).statusCode ?? (error as any).status;
    if (typeof status === "number" && status >= 400) {
      return false;
    }
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error) {
    const name = error.name;
    const msg = error.message.toLowerCase();
    if (
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("401") ||
      msg.includes("unauthorized") ||
      msg.includes("403") ||
      msg.includes("forbidden") ||
      msg.includes("500")
    ) {
      return false;
    }
    return name === "AbortError" || msg.includes("abort") || msg.includes("cancel");
  }
  return false;
}

function shouldEmitProgress(
  policy: ProgressPolicy | undefined,
  now: number,
  lastProgressAt: number,
  chunksSinceProgress: number,
  tokensSinceProgress: number,
): boolean {
  if (!policy) return false;
  return Boolean(
    (policy.intervalMs && now - lastProgressAt >= policy.intervalMs) ||
    (policy.chunkCount && chunksSinceProgress >= policy.chunkCount) ||
    (policy.tokenThreshold && tokensSinceProgress >= policy.tokenThreshold),
  );
}

function estimateTokens(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function wrapLanguageModel(
  model: any,
  getOptions:
    | WrapperOptions
    | ((params: { prompt: any; mode: "generate" | "stream" }) => WrapperOptions),
): any {
  return {
    ...model,
    async doGenerate(options: any) {
      const wrapperOpts = typeof getOptions === "function"
        ? getOptions({ prompt: options.prompt, mode: "generate" })
        : getOptions;

      return withInference(
        options.prompt,
        async (signal) => {
          const result = await model.doGenerate({
            ...options,
            ...(signal ? { abortSignal: signal } : {}),
          });

          const usage = result.usage
            ? {
                input: result.usage.promptTokens,
                output: result.usage.completionTokens,
                total: result.usage.promptTokens + result.usage.completionTokens,
              }
            : undefined;

          return {
            response: result,
            output: result.text,
            usage,
          };
        },
        {
          ...wrapperOpts,
          signal: options.abortSignal,
        },
      );
    },

    async doStream(options: any) {
      const wrapperOpts = typeof getOptions === "function"
        ? getOptions({ prompt: options.prompt, mode: "stream" })
        : getOptions;

      const clock = wrapperOpts.clock ?? defaultClock;
      const idFactory = wrapperOpts.idFactory ?? defaultIdFactory;
      const startedAtMs = clock();
      let sequence = 0;

      const redactedPrompt = wrapperOpts.redaction
        ? await redactStringsDeep(options.prompt, wrapperOpts.redaction)
        : options.prompt;

      const emit = async (eventType: Parameters<typeof buildEvent>[1], args: Parameters<typeof buildEvent>[2] = {}) => {
        const redactedOutput = args.output !== undefined && typeof args.output === "string" && wrapperOpts.redaction
          ? (await redactTextAsync(args.output, wrapperOpts.redaction)).value
          : args.output;

        await wrapperOpts.transport.send(buildEvent({
          metadata: wrapperOpts.metadata,
          input: redactedPrompt,
          startedAtMs,
          sequence: sequence++,
          clock,
          idFactory,
          redaction: wrapperOpts.redaction,
        }, eventType, { ...args, output: redactedOutput }));
      };

      await emit("started");

      try {
        const result = await model.doStream(options);
        let outputText = "";
        let usage: TokenUsage | undefined;
        let firstTokenEmitted = false;

        const wrappedStream = result.stream.pipeThrough(
          new TransformStream({
            async transform(chunk, controller) {
              if (chunk.type === "text-delta") {
                outputText += chunk.textDelta;
                if (!firstTokenEmitted && chunk.textDelta.length > 0) {
                  firstTokenEmitted = true;
                  await emit("first_token", { output: outputText });
                }
              }
              if (chunk.type === "response-metadata" && chunk.usage) {
                usage = {
                  input: chunk.usage.promptTokens,
                  output: chunk.usage.completionTokens,
                  total: chunk.usage.promptTokens + chunk.usage.completionTokens,
                };
              }
              controller.enqueue(chunk);
            },
            async flush() {
              await emit("completed", {
                output: outputText,
                usage: withEstimatedUsage(redactedPrompt, outputText, usage),
                completed: true,
              });
            },
          }),
        );

        return {
          ...result,
          stream: wrappedStream,
        };
      } catch (error) {
        await emit(options.abortSignal?.aborted ? "cancelled" : "failed", {
          error,
          completed: true,
        });
        throw error;
      }
    },
  };
}

function withEstimatedUsage(input: unknown, output: unknown, usage: TokenUsage | undefined): TokenUsage {
  if (usage?.input || usage?.output || usage?.total) {
    return usage;
  }

  const inputTokens = estimateTokens(serializeForEstimate(input));
  const outputTokens = estimateTokens(typeof output === "string" ? output : serializeForEstimate(output));

  return {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
    estimated: true,
  };
}

function serializeForEstimate(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}


function mergeUsage(previous?: TokenUsage, next?: TokenUsage): TokenUsage | undefined {
  if (!next) return previous;
  return {
    input: next.input ?? previous?.input,
    output: next.output ?? previous?.output,
    total: next.total ?? previous?.total,
    estimated: next.estimated ?? previous?.estimated,
  };
}

export function wrapOpenAI<T extends any>(
  client: T,
  options: WrapperOptions
): T {
  const handler = {
    get(target: any, prop: string | symbol, receiver: any): any {
      const val = Reflect.get(target, prop, receiver);
      if (prop === "chat") {
        return new Proxy(val, {
          get(chatTarget, chatProp, chatReceiver) {
            const chatVal = Reflect.get(chatTarget, chatProp, chatReceiver);
            if (chatProp === "completions") {
              return new Proxy(chatVal, {
                get(completionsTarget, completionsProp, completionsReceiver) {
                  const completionsVal = Reflect.get(completionsTarget, completionsProp, completionsReceiver);
                  if (completionsProp === "create") {
                    return function (body: any, requestOptions?: any) {
                      const model = body.model || "unknown";
                      const provider = "openai";
                      const callOptions = {
                        ...options,
                        metadata: {
                          provider,
                          model,
                          operation: "chat.completions",
                          ...options.metadata,
                        }
                      };

                      if (body.stream) {
                        return withStreamingInference(
                          body.messages || body.prompt || body,
                          (signal) => completionsVal.call(completionsTarget, { ...body, ...(signal ? { signal } : {}) }, requestOptions),
                          {
                            ...callOptions,
                            chunkToText: (chunk: any) => chunk.choices?.[0]?.delta?.content || "",
                            usageFromChunk: (chunk: any) => {
                              if (chunk.usage) {
                                return {
                                  input: chunk.usage.prompt_tokens,
                                  output: chunk.usage.completion_tokens,
                                  total: chunk.usage.total_tokens,
                                };
                              }
                              return undefined;
                            }
                          }
                        );
                      } else {
                        return withInference(
                          body.messages || body.prompt || body,
                          async (signal) => {
                            const res = await completionsVal.call(completionsTarget, { ...body, ...(signal ? { signal } : {}) }, requestOptions);
                            const text = res.choices?.[0]?.message?.content || "";
                            const usage = res.usage ? {
                              input: res.usage.prompt_tokens,
                              output: res.usage.completion_tokens,
                              total: res.usage.total_tokens,
                            } : undefined;
                            return {
                              response: res,
                              output: text,
                              usage,
                            };
                          },
                          callOptions
                        );
                      }
                    };
                  }
                  return typeof completionsVal === "function" ? completionsVal.bind(completionsTarget) : completionsVal;
                }
              });
            }
            return typeof chatVal === "function" ? chatVal.bind(chatTarget) : chatVal;
          }
        });
      }
      return typeof val === "function" ? val.bind(target) : val;
    }
  };
  return new Proxy(client, handler);
}

export function wrapAnthropic<T extends any>(
  client: T,
  options: WrapperOptions
): T {
  const handler = {
    get(target: any, prop: string | symbol, receiver: any): any {
      const val = Reflect.get(target, prop, receiver);
      if (prop === "messages") {
        return new Proxy(val, {
          get(messagesTarget, messagesProp, messagesReceiver) {
            const messagesVal = Reflect.get(messagesTarget, messagesProp, messagesReceiver);
            if (messagesProp === "create") {
              return function (body: any, requestOptions?: any) {
                const model = body.model || "unknown";
                const provider = "anthropic";
                const callOptions = {
                  ...options,
                  metadata: {
                    provider,
                    model,
                    operation: "messages.create",
                    ...options.metadata,
                  }
                };

                if (body.stream) {
                  return withStreamingInference(
                    body.messages || body,
                    (signal) => messagesVal.call(messagesTarget, { ...body, ...(signal ? { signal } : {}) }, requestOptions),
                    {
                      ...callOptions,
                      chunkToText: (chunk: any) => {
                        if (chunk.type === "content_block_delta" && chunk.delta?.text) {
                          return chunk.delta.text;
                        }
                        if (chunk.type === "content_block_start" && chunk.content_block?.text) {
                          return chunk.content_block.text;
                        }
                        return "";
                      },
                      usageFromChunk: (chunk: any) => {
                        if (chunk.message?.usage) {
                          return {
                            input: chunk.message.usage.input_tokens,
                            output: chunk.message.usage.output_tokens,
                            total: chunk.message.usage.input_tokens + chunk.message.usage.output_tokens,
                          };
                        }
                        if (chunk.usage) {
                          return {
                            input: chunk.usage.input_tokens,
                            output: chunk.usage.output_tokens,
                            total: chunk.usage.input_tokens + chunk.usage.output_tokens,
                          };
                        }
                        return undefined;
                      }
                    }
                  );
                } else {
                  return withInference(
                    body.messages || body,
                    async (signal) => {
                      const res = await messagesVal.call(messagesTarget, { ...body, ...(signal ? { signal } : {}) }, requestOptions);
                      const text = res.content?.[0]?.text || "";
                      const usage = res.usage ? {
                        input: res.usage.input_tokens,
                        output: res.usage.output_tokens,
                        total: res.usage.input_tokens + res.usage.output_tokens,
                      } : undefined;
                      return {
                        response: res,
                        output: text,
                        usage,
                      };
                    },
                    callOptions
                  );
                }
              };
            }
            return typeof messagesVal === "function" ? messagesVal.bind(messagesTarget) : messagesVal;
          }
        });
      }
      return typeof val === "function" ? val.bind(target) : val;
    }
  };
  return new Proxy(client, handler);
}
