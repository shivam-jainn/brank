# Brank Inferhence

Lightweight LLM chat app plus inference logging pipeline. The app streams model responses, records chat messages and inference events, redacts previews, and exposes a compact dashboard for latency, throughput, errors, and ingestion queue health.

## What Is Done

- Multi-provider registry + streaming chat + short multi-turn context
- `@brank/inferhence` SDK — auto-instruments LLM calls with latency, token usage, timestamps, status, IDs, and PII-redacted previews
- Pluggable queue **adapter pattern** — swap between in-memory (dev), RabbitMQ, or Kafka with one config change
- Standalone **ingestion worker** — consumes RabbitMQ, micro-batch writes to Postgres, graceful SIGTERM drain
- **Redis cache** — chat history/messages cached with TTL, invalidated on every write
- **Composable rolling metrics aggregator** — `MetricsBackend` interface makes swapping to ClickHouse a one-liner
- Prisma/Postgres storage — Conversation, ChatMessage, InferenceEvent, ExtractedMetadata
- PII redaction at both SDK and ingestion boundary
- Conversation list / resume / cancel UI
- Metrics SSE dashboard — latency, throughput, errors, queue health
- Docker Compose one-command setup (`docker-compose up --build`)
- Kubernetes manifests (`k8s/`) — Postgres, Redis, RabbitMQ, App, Worker, Ingress, migration Job
- `.env.example` with all knobs documented

Not done: a live self-hosted k8s cluster deployment (manifests are ready, requires a cluster with an nginx ingress controller).

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# Fill in at least one provider key (OPENAI_API_KEY or GROQ_API_KEY)
docker-compose up --build
```

Open `http://localhost:3000`.

The `docker-compose up` command starts:
| Service | Role |
|---------|------|
| `postgres` | Database |
| `redis` | Chat cache |
| `rabbitmq` | Persistent event queue |
| `migrate` | One-shot Prisma migration job |
| `app` | Next.js (producer-only, sends events to RabbitMQ) |
| `worker` | Ingestion consumer (drains RabbitMQ → Postgres) |

RabbitMQ management UI: `http://localhost:15672` (user: `brank`, pass: `brank`)

## Local Development (No Docker)

```bash
bun install
bun run prisma:generate
bun run db:migrate
bun run dev
```

Without `RABBITMQ_URL` the app uses an in-process memory queue and runs the consumer inside the Next.js process — no external broker required for local development.

## Kubernetes Deployment

```bash
# 1. Build and push the image
docker build -t brank:latest .
# docker tag brank:latest <registry>/brank:latest && docker push <registry>/brank:latest

# 2. Fill in secrets (base64 encode each value)
cp k8s/secrets.yaml k8s/secrets.local.yaml
# Edit k8s/secrets.local.yaml with your values
kubectl apply -f k8s/secrets.local.yaml

# 3. Apply everything else
kubectl apply -k k8s/

# 4. Wait for migration to complete before routing traffic
kubectl wait --for=condition=complete job/db-migrate --timeout=120s
```

Add `127.0.0.1  brank.local` to `/etc/hosts` then open `http://brank.local`.

The ingress requires an nginx ingress controller:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

## Environment Variables

All knobs are documented in `.env.example`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres connection string |
| `RABBITMQ_URL` | (unset) | If set, uses RabbitMQ; otherwise in-memory queue |
| `REDIS_URL` | (unset) | If set, enables Redis chat cache |
| `REDIS_CHAT_TTL_S` | `300` | Cache TTL in seconds |
| `INGESTION_MAX_BATCH_SIZE` | `100` | Worker micro-batch size |
| `INGESTION_MAX_BATCH_WAIT_MS` | `250` | Worker flush interval |
| `INGESTION_MAX_RETRIES` | `3` | Dead-letter after N retries |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│  ┌─────────────────┐   SSE    ┌──────────────────────────────┐  │
│  │  Chat UI        │◄────────►│  Next.js App (producer)      │  │
│  │  Dashboard      │          │  /api/chat   /api/metrics     │  │
│  └─────────────────┘          │  /api/ingest (← SDK logs)    │  │
└──────────────────────────────└──────────────┬───────────────────┘
                                               │ AMQP publish
                                               ▼
                                    ┌─────────────────┐
                                    │   RabbitMQ      │  ← Broker Adapter
                                    │  (persistent)   │    (Kafka-ready)
                                    └────────┬────────┘
                                             │ consume
                                             ▼
                                    ┌─────────────────┐
                                    │  Worker         │
                                    │  micro-batch    │
                                    │  → Postgres     │
                                    └─────────────────┘

  Redis ──► chat message cache (TTL invalidation on write)

  MetricsAggregator (composable backend)
    ├── InMemoryMetricsBackend  (current)
    └── ClickHouseMetricsBackend (future — implement MetricsBackend interface)
```

`@brank/inferhence` wraps LLM calls and emits `started`, `first_token`, `progress`, `completed`, `failed`, `cancelled` events to `POST /api/ingest`.

`/api/ingest` validates, redacts, and publishes to the queue adapter.

The worker subscribes, micro-batches, and bulk-inserts to Postgres via `createPrismaEventStore`.

## Schema

| Table | Purpose |
|-------|---------|
| `Conversation` | Session grouping and title |
| `ChatMessage` | User/assistant messages with sequence, provider, model |
| `InferenceEvent` | Append-only telemetry — event type, latency, tokens, previews |
| `ExtractedMetadata` | Flexible namespace/key/value for future extraction without schema changes |

## Queue Adapter Pattern

```ts
// Memory (dev / tests)
createQueueAdapter({ type: "memory" })

// RabbitMQ (current production)
createQueueAdapter({ type: "rabbitmq", channel, queueName: "brank.inference.events" })

// Kafka (future — add createKafkaEventQueue and a new case here)
createQueueAdapter({ type: "kafka", producer, topic: "inference-events" })
```

## Composable Metrics Aggregator

```ts
// Current: in-memory rolling buckets
const backend = createInMemoryMetricsBackend({ bucketWidthMs: 60_000, maxBuckets: 60 });
const aggregator = createMetricsAggregator(backend);

// Future: swap to ClickHouse by implementing MetricsBackend
const clickhouseBackend = createClickHouseMetricsBackend(chClient);
const aggregator = createMetricsAggregator(clickhouseBackend);
```

## Tradeoffs

- Queue is in-process by default (dev), swappable to RabbitMQ/Kafka via env var — no code changes.
- Redis cache is opt-in; the app works identically without it.
- Telemetry delivery is best-effort with retries — chat UX is never blocked by transient ingestion failures.
- PII redaction is regex/key-based (fast, transparent) — a production system should add DLP classification.
- Metrics aggregator is in-memory per process — aggregate across replicas by summing backends or using a shared ClickHouse table.

## Scaling

- Scale `brank-app` replicas horizontally; RabbitMQ decouples write pressure.
- Scale `brank-worker` replicas for higher ingestion throughput.
- Move Redis to a Redis Cluster / Elasticache for multi-replica cache consistency.
- Swap `InMemoryMetricsBackend` → `ClickHouseMetricsBackend` when dashboard query volume grows.
- Partition `InferenceEvent` by time at high volume.

## Failure Handling

- The SDK retries HTTP delivery `INFERHENCE_RETRIES` times then drops telemetry (chat never blocked).
- The worker retries failed batches up to `INGESTION_MAX_RETRIES`; after that, messages are nacked to the DLQ.
- Events use `eventId` as the DB primary key with `skipDuplicates` for idempotency.
- `terminationGracePeriodSeconds: 60` on the worker pod ensures in-flight batches finish before eviction.
