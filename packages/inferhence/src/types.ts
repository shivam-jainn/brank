export type InferenceEventType =
  | "started"
  | "first_token"
  | "progress"
  | "completed"
  | "failed"
  | "cancelled";

export type InferenceStatus = "started" | "completed" | "failed" | "cancelled";

export type IdFactory = () => string;
export type Clock = () => number;

export type TokenUsage = {
  input?: number;
  output?: number;
  total?: number;
  estimated?: boolean;
};

export type InferenceIds = {
  conversationId?: string;
  sessionId?: string;
  traceId?: string;
  requestId?: string;
};

export type InferenceMetadata = InferenceIds & {
  provider: string;
  model: string;
  operation?: string;
  attributes?: Record<string, unknown>;
};

export type RedactedPreview = {
  input?: string;
  output?: string;
  disabled: boolean;
  redactionCount: number;
  truncated: boolean;
};

export type InferenceEvent = {
  schemaVersion: "inferhence.event.v1";
  eventId: string;
  eventType: InferenceEventType;
  sequence: number;
  provider: string;
  model: string;
  status: InferenceStatus;
  startedAt: string;
  emittedAt: string;
  completedAt?: string;
  latencyMs?: number;
  usage?: TokenUsage;
  ids: InferenceIds;
  metadata: Record<string, unknown>;
  previews: RedactedPreview;
  error?: {
    name?: string;
    message: string;
    code?: string;
  };
};

export type EventSink = (event: InferenceEvent) => void | Promise<void>;

export type InferenceTransport = {
  send(event: InferenceEvent): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
};

export type ProgressPolicy = {
  intervalMs?: number;
  chunkCount?: number;
  tokenThreshold?: number;
};

export type RedactionRule = {
  name: string;
  pattern: RegExp;
  replacement?: string;
};

export type RedactionOptions = {
  previewEnabled?: boolean;
  allowRaw?: boolean;
  maxPreviewChars?: number;
  customRules?: RedactionRule[];
  sensitiveKeys?: string[];
};

export type WrapperOptions = {
  metadata: InferenceMetadata;
  transport: InferenceTransport;
  redaction?: RedactionOptions;
  clock?: Clock;
  idFactory?: IdFactory;
  progress?: ProgressPolicy;
  signal?: AbortSignal;
};
