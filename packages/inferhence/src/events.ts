import { buildPreviews } from "./redaction";
import type {
  Clock,
  IdFactory,
  InferenceEvent,
  InferenceEventType,
  InferenceMetadata,
  InferenceStatus,
  RedactionOptions,
  TokenUsage,
} from "./types";

export type EventContext = {
  metadata: InferenceMetadata;
  input: unknown;
  startedAtMs: number;
  sequence: number;
  clock: Clock;
  idFactory: IdFactory;
  redaction?: RedactionOptions;
};

export const defaultClock: Clock = () => Date.now();
export const defaultIdFactory: IdFactory = () => crypto.randomUUID();

export function normalizeMetadata(metadata: InferenceMetadata): InferenceMetadata {
  return {
    provider: metadata.provider.trim(),
    model: metadata.model.trim(),
    operation: metadata.operation?.trim(),
    conversationId: metadata.conversationId,
    sessionId: metadata.sessionId,
    traceId: metadata.traceId,
    requestId: metadata.requestId,
    attributes: metadata.attributes ?? {},
  };
}

export function buildEvent(
  context: EventContext,
  eventType: InferenceEventType,
  args: {
    output?: unknown;
    status?: InferenceStatus;
    usage?: TokenUsage;
    error?: unknown;
    completed?: boolean;
  } = {},
): InferenceEvent {
  const metadata = normalizeMetadata(context.metadata);
  const emittedAtMs = context.clock();
  const completedAt = args.completed ? emittedAtMs : undefined;
  const status = args.status ?? statusFor(eventType);

  return {
    schemaVersion: "inferhence.event.v1",
    eventId: makeEventId(context.idFactory, metadata, eventType, context.sequence),
    eventType,
    sequence: context.sequence,
    provider: metadata.provider,
    model: metadata.model,
    status,
    startedAt: new Date(context.startedAtMs).toISOString(),
    emittedAt: new Date(emittedAtMs).toISOString(),
    completedAt: completedAt ? new Date(completedAt).toISOString() : undefined,
    latencyMs: args.completed ? Math.max(0, emittedAtMs - context.startedAtMs) : undefined,
    usage: args.usage,
    ids: {
      conversationId: metadata.conversationId,
      sessionId: metadata.sessionId,
      traceId: metadata.traceId,
      requestId: metadata.requestId,
    },
    metadata: metadata.attributes ?? {},
    previews: buildPreviews(context.input, args.output, context.redaction),
    error: normalizeError(args.error),
  };
}

function makeEventId(
  idFactory: IdFactory,
  metadata: InferenceMetadata,
  eventType: InferenceEventType,
  sequence: number,
): string {
  const stableBase = [
    metadata.traceId,
    metadata.requestId,
    metadata.sessionId,
    metadata.conversationId,
    metadata.provider,
    metadata.model,
  ].filter(Boolean).join(":");

  return stableBase ? `${stableBase}:${sequence}:${eventType}` : idFactory();
}

function statusFor(eventType: InferenceEventType): InferenceStatus {
  if (eventType === "failed") return "failed";
  if (eventType === "cancelled") return "cancelled";
  if (eventType === "completed") return "completed";
  return "started";
}

function normalizeError(error: unknown): InferenceEvent["error"] {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: typeof (error as Error & { code?: unknown }).code === "string"
        ? (error as Error & { code: string }).code
        : undefined,
    };
  }

  return { message: String(error) };
}
