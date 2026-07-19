import { buildEvent, defaultClock, defaultIdFactory } from "./events";
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

  const emit = async (eventType: Parameters<typeof buildEvent>[1], args = {}) => {
    await options.transport.send(buildEvent({
      metadata: options.metadata,
      input,
      startedAtMs,
      sequence: sequence++,
      clock,
      idFactory,
      redaction: options.redaction,
    }, eventType, args));
  };

  await emit("started");

  try {
    const result = await call(options.signal);
    const normalized = normalizeCompletionResult(result);
    await emit("completed", {
      output: normalized.output ?? normalized.response,
      usage: withEstimatedUsage(input, normalized.output ?? normalized.response, normalized.usage),
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

  const emit = async (eventType: Parameters<typeof buildEvent>[1], args = {}) => {
    await options.transport.send(buildEvent({
      metadata: options.metadata,
      input,
      startedAtMs,
      sequence: sequence++,
      clock,
      idFactory,
      redaction: options.redaction,
    }, eventType, args));
  };

  await emit("started");

  try {
    for await (const chunk of streamFactory(options.signal)) {
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

    await emit("completed", { output, usage: withEstimatedUsage(input, output, usage), completed: true });
  } catch (error) {
    await emit(isAbortError(error) || options.signal?.aborted ? "cancelled" : "failed", {
      output,
      usage: withEstimatedUsage(input, output, usage),
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
  const iterable = withStreamingInference(
    input,
    (signal) => readableStreamToAsyncIterable(streamFactory(signal)),
    options,
  );
  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream<TChunk>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }

      controller.enqueue(next.value);
    },
    async cancel(reason) {
      await iterator.throw?.(reason);
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
): AsyncIterable<TChunk> {
  const reader = stream.getReader();

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
  return error instanceof DOMException && error.name === "AbortError";
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

      const emit = async (eventType: Parameters<typeof buildEvent>[1], args = {}) => {
        await wrapperOpts.transport.send(buildEvent({
          metadata: wrapperOpts.metadata,
          input: options.prompt,
          startedAtMs,
          sequence: sequence++,
          clock,
          idFactory,
          redaction: wrapperOpts.redaction,
        }, eventType, args));
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
                usage: withEstimatedUsage(options.prompt, outputText, usage),
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
