# Brank Inferhence

Lightweight LLM chat app plus inference logging pipeline. The app streams model responses, records chat messages and inference events, redacts previews, and exposes a compact dashboard for latency, throughput, errors, and ingestion queue health.

## What Is Done

Done: multi-provider registry, streaming chat, short multi-turn context, inference SDK/wrapper, near real-time ingestion endpoint, event based micro-batch pipeline, Prisma/Postgres storage, PII redaction, conversation list/resume/cancel UI, metrics dashboard, `.env.example`, and Docker Compose one-command setup.

Not done: a separate self-hosted Kubernetes manifest. The app is containerized and ready to be deployed to k8s, but manifests/Helm were not added in this pass.

Build note: Next.js is configured with `typescript.ignoreBuildErrors` because the bundled ai-elements template contains unrelated type errors outside the implemented app path. The inference SDK and ingestion packages have passing tests.

## Setup

```bash
cp .env.example .env
# add at least one provider key, for example OPENAI_API_KEY
docker-compose up --build
```

Open `http://localhost:3000`.

For local development without Docker:

```bash
bun install
bun run prisma:generate
bun run db:migrate
bun run dev
```

## Config

All common knobs are visible in `.env.example`.

Required for full logging:

```bash
DATABASE_URL=postgresql://brank:brank@localhost:5432/brank
INFERHENCE_INGEST_URL=http://localhost:3000/api/ingest
```

Provider configuration:

```bash
OPENAI_API_KEY=
GROQ_API_KEY=
LMSTUDIO_BASE_URL=http://localhost:1234/v1
```

Ingestion tuning:

```bash
INGESTION_MAX_BATCH_SIZE=100
INGESTION_MAX_BATCH_WAIT_MS=250
INGESTION_MAX_RETRIES=3
INGESTION_QUEUE_CAPACITY=10000
```

## Architecture

The chatbot calls the Vercel AI SDK with a provider-qualified model ID such as `openai:gpt-4.1` or `groq:llama-3.3-70b-versatile`. `@brank/providers` owns provider discovery and model registry setup.

`@brank/inferhence` wraps LLM calls. For streaming calls it emits `started`, `first_token`, `progress`, `completed`, `failed`, or `cancelled` events with provider, model, latency, token usage, timestamps, status, IDs, and redacted input/output previews.

`POST /api/ingest` receives SDK events, validates and normalizes them, redacts previews again at the ingestion boundary, queues them, and micro-batches writes to Postgres through Prisma.

`GET /api/metrics` returns latency, throughput, error counts, and pipeline health for the dashboard. `GET /api/conversations` powers conversation list/resume.

## Schema

`Conversation` stores session-level grouping and title.

`ChatMessage` stores user/assistant/tool messages, sequence, provider/model, request ID, trace ID, and original UI parts.

`InferenceEvent` stores append-only inference telemetry: event type, status, provider, model, operation, timestamps, latency, tokens, redacted previews, errors, raw event, queue timestamps, and attempts.

`ExtractedMetadata` is a flexible namespace/key/value table for future extraction jobs without forcing schema changes for every new metric.

## Tradeoffs

The ingestion queue is in-process for simplicity, but the pipeline interface supports swapping in RabbitMQ or another broker. Telemetry delivery is best-effort with retries so chat UX is not blocked by transient ingestion failures. Preview redaction is regex/key based, which is fast and transparent, but a production system should add provider-side moderation/classification or DLP checks for higher recall.

## Scaling Notes

Run multiple app replicas behind a load balancer, keep Postgres as the source of truth, and move the queue to RabbitMQ/Kafka/SQS when ingestion volume exceeds what one process can buffer. Add indexes by dashboard query pattern, partition `InferenceEvent` by time at higher volume, and export metrics to Prometheus/Grafana for production dashboards.

## Failure Handling

The SDK retries HTTP delivery and then drops telemetry rather than failing user chat requests. The ingestion consumer retries failed batches up to `INGESTION_MAX_RETRIES`; after that, failures are counted and the message is nacked without requeue. Events use `eventId` as the DB primary key with duplicate skipping for idempotency.
