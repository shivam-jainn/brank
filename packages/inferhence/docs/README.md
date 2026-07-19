# Inferhence

Inferhence is a lightweight inference telemetry SDK for provider-agnostic LLM calls. Its contract is strict: application data goes in, PII-redacted telemetry lifecycle events come out.

## Lifecycle Events

Events are versioned as `inferhence.event.v1` and emitted in order:

1. `started`
2. `first_token` for streaming calls after the first non-empty chunk
3. `progress` when the configured interval, chunk count, or token threshold is reached
4. exactly one final `completed`, `failed`, or `cancelled`

Final events always include provider, model, latency, timestamps, token usage when captured, status or error, conversation/session/trace/request IDs, and redacted input/output previews.

## Redaction

Redaction is mandatory by default. The core pipeline covers emails, phone numbers, payment-card-like values, API keys, bearer tokens, sensitive object keys, custom regex rules, truncation, and complete preview disabling.

Raw prompts and responses are never emitted unless `redaction.allowRaw` is explicitly set. Use `previewEnabled: false` for workloads that must not include previews at all.

## Transports

`InferenceTransport` is intentionally minimal:

```ts
type InferenceTransport = {
  send(event: InferenceEvent): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
};
```

`createHttpTransport` is the default required near-real-time delivery path. It posts each event to an ingestion endpoint with configurable headers, timeout, retries, and the event ID as the `idempotency-key`. Delivery is best-effort and assumes at-least-once semantics, so ingestion should deduplicate by `eventId`.

The core package includes dependency-free decorators for buffering, batching, filtering, fan-out, and retries. Broker adapters are functions, so Kafka, NATS, Redis Streams, RabbitMQ, and SQS publishers can live in separate packages without importing broker clients into core.

## Streaming Progress

Set `progress.intervalMs`, `progress.chunkCount`, or `progress.tokenThreshold` to avoid one telemetry event per token. The final terminal event is always emitted even when progress is disabled.

## Extraction Notes

The SDK is self-contained under `packages/inferhence` and avoids app imports. To extract it:

1. Copy `packages/inferhence` into a new repository.
2. Add build metadata, publishing config, and generated declaration output.
3. Keep broker-specific transports in sibling adapter packages.
4. Preserve tests for redaction, event ordering, retries, overflow, backpressure, duplicate delivery, HTTP delivery, graceful shutdown, and latency/token capture.
