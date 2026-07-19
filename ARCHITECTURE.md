# Architecture Notes

These notes expand on the README with the four areas called out in the submission: ingestion flow, logging strategy, scaling considerations, and failure-handling assumptions.

## Ingestion Flow

```
Browser (Chat UI / Dashboard)
        │  streamed chat response          │  SSE live metrics
        ▼                                  ▼
┌──────────────────────────────────────────────────────────┐
│  Next.js App (producer)                                  │
│   /api/chat   → calls provider via @brank/inferhence     │
│   /api/ingest → receives SDK telemetry                   │
│   /api/metrics → SSE dashboard feed                      │
└───────────────────────────┬──────────────────────────────┘
                             │  POST each event (HTTP transport)
                             ▼
              ┌────────────────────────────┐
              │  /api/ingest               │
              │   validate (zod)           │
              │   redact previews          │
              │   publish → EventQueue     │
              └─────────────┬──────────────┘
                            │  publish / consume
                            ▼
                 ┌─────────────────────┐
                 │  EventQueue adapter  │   in-memory (dev) | RabbitMQ (prod) | Kafka (future)
                 └─────────┬───────────┘
                           │  consume (micro-batch)
                           ▼
                 ┌─────────────────────┐
                 │  Worker             │
                 │   validate          │
                 │   extract metadata  │
                 │   bulk insert       │
                 └─────────┬───────────┘
                           ▼
                 ┌─────────────────────┐
                 │  Postgres (Prisma)  │
                 │   Conversation      │
                 │   ChatMessage       │
                 │   InferenceEvent    │
                 │   ExtractedMetadata │
                 └─────────────────────┘
```

1. **SDK emit.** `@brank/inferhence` wraps the LLM call and emits lifecycle events — `started`, `first_token`, `progress`, `completed`, `failed`, `cancelled` — through an in-process `EventEmitter`. This is the auto-instrumentation layer; application code does not manually log anything.
2. **SDK transport.** Each event is delivered to `POST /api/ingest` over HTTP (best-effort, retried `INFERHENCE_RETRIES` times). Multiple transports can be composed (e.g. HTTP + console) without touching call sites.
3. **Ingest endpoint.** Validates the payload with a zod schema, runs PII redaction on the `previews` field, stamps `receivedAt`/`queuedAt`, and publishes onto the `EventQueue` adapter. The HTTP response returns immediately after enqueue — it never waits for the database write.
4. **Queue.** The adapter decouples producers from consumers. In dev it is an in-process queue; in production it is RabbitMQ (durable, with a DLQ). The `createQueueAdapter` factory makes swapping to Kafka a one-line change.
5. **Worker.** Subscribes to the queue, micro-batches messages (`INGESTION_MAX_BATCH_SIZE` / `INGESTION_MAX_BATCH_WAIT_MS`), validates again, extracts structured metadata into `ExtractedMetadata`, and bulk-inserts with `skipDuplicates` for idempotency. It emits rolling pipeline metrics that the app surfaces over SSE.

## Logging Strategy

- **Two log streams, intentionally separate.**
  - *Chat/telemetry logs* are **events**, not log lines. They are structured JSON emitted by the SDK, shipped through the queue, and persisted as `InferenceEvent` rows. This is queryable, joinable data — not text in a file.
  - *Operational logs* (request IDs, errors, latency of the app itself) use `pino` (with `pino-noir` for redaction) via the `withLogging` wrapper on API routes.
- **PII redaction happens twice** — at the SDK boundary (before the event leaves the process) and again at the ingestion boundary (before it is queued). Defense in depth so a misconfigured transport can never leak raw previews.
- **Previews, not full payloads.** We store truncated input/output previews plus token counts, not the entire conversation, keeping `InferenceEvent` rows small and cheap to scan. Full messages live in `ChatMessage`.
- **Metrics are derived, not stored raw.** The `MetricsAggregator` keeps rolling buckets; the dashboard reads aggregates over SSE rather than hitting the database on every frame.

## Scaling Considerations

- **Horizontal app tier.** `brank-app` replicas are stateless and behind the ingress; RabbitMQ absorbs write pressure so a traffic spike never blocks ingestion.
- **Horizontal worker tier.** Increase `brank-worker` replicas to fan out queue consumption. Each worker holds its own channel; RabbitMQ round-robins messages. `RABBITMQ_PREFETCH` controls in-flight per worker.
- **Cache tier.** Redis is opt-in and used only for chat history with TTL; the app is functionally identical without it. At scale move to Redis Cluster / Elasticache for cross-replica consistency.
- **Metrics tier.** The in-memory aggregator is per-process. For multi-replica or long-window dashboards, implement `ClickHouseMetricsBackend` against the existing `MetricsBackend` interface — no caller changes.
- **Data tier.** `InferenceEvent` is append-only and grows without bound. Partition by `emittedAt` (time) at high volume and add a retention job; keep hot data in Postgres, cold data in columnar storage if query needs grow.
- **One-command deploy.** `docker-compose up --build` for local; `helm install brank ./helm/brank` (or `kubectl apply -k k8s/`) for a self-hosted cluster — both scale the same components.

## Failure Handling Assumptions

- **Chat UX is never blocked by telemetry.** If the SDK cannot deliver an event after `INFERHENCE_RETRIES`, it drops the telemetry and continues. Losing a metric is acceptable; losing a chat response is not.
- **At-least-once ingestion, deduped at write.** Events can be redelivered (worker crash between dequeue and commit). `eventId` is the primary key and inserts use `skipDuplicates`, so replays are idempotent.
- **Poison messages go to the DLQ.** Failed batches retry up to `INGESTION_MAX_RETRIES`, then are nacked to `brank.inference.dlq`. The queue keeps flowing instead of wedging on one bad payload.
- **Graceful drain.** The worker pod sets `terminationGracePeriodSeconds: 60` and handles `SIGTERM`/`SIGINT` to flush in-flight batches before exit.
- **Migration ordering.** The DB migration runs as a Job and must complete (`kubectl wait --for=condition=complete job/...`) before app/worker pods serve traffic, avoiding partial-schema races.
- **Probes.** App uses HTTP `/api/health` liveness/readiness; infra services (postgres/redis/rabbitmq) use native CLI probes; the worker uses a process-exec liveness probe since it is long-lived and headless.
