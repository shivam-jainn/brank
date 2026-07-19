/**
 * Composable Rolling Metrics Aggregator
 *
 * Design goals:
 *  1. The `MetricsBackend` interface is the ONLY contract the rest of the
 *     system touches. Swap in ClickHouse by implementing the interface.
 *  2. All aggregation logic is bucket-based so the shape maps 1:1 to a
 *     `metric_buckets` table (or a ClickHouse MergeTree / AggregatingMergeTree).
 *  3. The `InMemoryMetricsBackend` is the current production impl — it keeps
 *     a rolling window of N-minute buckets in memory and answers queries in O(n).
 *
 * Migrating to ClickHouse later:
 *   1. Implement `createClickHouseMetricsBackend(client)` satisfying `MetricsBackend`.
 *   2. Replace the backend in `lib/ingestion-service.ts`.
 *   3. Zero other changes required.
 */

import type { QueuedInferenceEvent } from "./pipeline";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** A single time bucket of aggregated metrics */
export type MetricBucket = {
  /** ISO timestamp of bucket window start */
  bucketAt: string;
  /** Window width in milliseconds */
  windowMs: number;
  accepted: number;
  processed: number;
  retried: number;
  failed: number;
  cancelled: number;
  /** Sum of latencies for completed events in this bucket */
  latencySum: number;
  latencyCount: number;
  /** Sum of all tokens in this bucket */
  tokenSum: number;
  /** Number of events with token data */
  tokenCount: number;
};

/** Rolling window summary returned by `getMetrics()` */
export type AggregatedMetrics = {
  /** All buckets in the current window, oldest first */
  buckets: MetricBucket[];
  /** Derived stats over the full window */
  totals: {
    accepted: number;
    processed: number;
    retried: number;
    failed: number;
    cancelled: number;
    avgLatencyMs: number;
    throughputPerSecond: number;
    errorRate: number;
  };
};

// ---------------------------------------------------------------------------
// Backend interface — the ClickHouse-compatible contract
// ---------------------------------------------------------------------------

/**
 * A MetricsBackend is responsible for:
 *  - Persisting individual metric increments (via `record`)
 *  - Serving aggregated reads (via `getMetrics`)
 *
 * Both ClickHouse and Postgres backends must satisfy this interface.
 */
export type MetricsBackend = {
  record(event: QueuedInferenceEvent, increment: BucketIncrement): Promise<void> | void;
  getMetrics(windowMs?: number): Promise<AggregatedMetrics> | AggregatedMetrics;
};

export type BucketIncrement = {
  accepted?: number;
  processed?: number;
  retried?: number;
  failed?: number;
  cancelled?: number;
  latencyMs?: number;
  tokens?: number;
};

// ---------------------------------------------------------------------------
// In-memory backend (current production implementation)
// ---------------------------------------------------------------------------

type MutableBucket = MetricBucket & {
  latencyCount: number;
  tokenCount: number;
};

/**
 * Keeps rolling N-minute buckets entirely in memory.
 * Fast, zero dependencies — but resets on process restart.
 *
 * `bucketWidthMs` controls granularity (default 60 s).
 * `maxBuckets`    controls how far back you look (default 60 buckets = 1 hour at 1 min).
 */
export function createInMemoryMetricsBackend(options?: {
  bucketWidthMs?: number;
  maxBuckets?: number;
}): MetricsBackend {
  const bucketWidthMs = options?.bucketWidthMs ?? 60_000;
  const maxBuckets = options?.maxBuckets ?? 60;
  const buckets = new Map<string, MutableBucket>();

  function bucketKey(now = Date.now()): string {
    const start = Math.floor(now / bucketWidthMs) * bucketWidthMs;
    return new Date(start).toISOString();
  }

  function ensureBucket(key: string): MutableBucket {
    if (!buckets.has(key)) {
      buckets.set(key, {
        bucketAt: key,
        windowMs: bucketWidthMs,
        accepted: 0,
        processed: 0,
        retried: 0,
        failed: 0,
        cancelled: 0,
        latencySum: 0,
        latencyCount: 0,
        tokenSum: 0,
        tokenCount: 0,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return buckets.get(key)!;
  }

  function prune() {
    const cutoff = Date.now() - maxBuckets * bucketWidthMs;
    for (const [key] of buckets) {
      if (new Date(key).getTime() < cutoff) buckets.delete(key);
    }
  }

  return {
    record(_event, inc) {
      const key = bucketKey();
      const bucket = ensureBucket(key);
      bucket.accepted += inc.accepted ?? 0;
      bucket.processed += inc.processed ?? 0;
      bucket.retried += inc.retried ?? 0;
      bucket.failed += inc.failed ?? 0;
      bucket.cancelled += inc.cancelled ?? 0;
      if (inc.latencyMs !== undefined) {
        bucket.latencySum += inc.latencyMs;
        bucket.latencyCount += 1;
      }
      if (inc.tokens !== undefined) {
        bucket.tokenSum += inc.tokens;
        bucket.tokenCount += 1;
      }
      prune();
    },

    getMetrics(windowMs) {
      prune();
      const effectiveWindow = windowMs ?? maxBuckets * bucketWidthMs;
      const cutoff = Date.now() - effectiveWindow;
      const sorted = Array.from(buckets.values())
        .filter((b) => new Date(b.bucketAt).getTime() >= cutoff)
        .sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));

      let totAcc = 0, totProc = 0, totRet = 0, totFail = 0, totCancel = 0;
      let latSum = 0, latCount = 0;
      for (const b of sorted) {
        totAcc += b.accepted;
        totProc += b.processed;
        totRet += b.retried;
        totFail += b.failed;
        totCancel += b.cancelled;
        latSum += b.latencySum;
        latCount += b.latencyCount;
      }

      const windowSeconds = effectiveWindow / 1000;
      return {
        buckets: sorted,
        totals: {
          accepted: totAcc,
          processed: totProc,
          retried: totRet,
          failed: totFail,
          cancelled: totCancel,
          avgLatencyMs: latCount ? Math.round(latSum / latCount) : 0,
          throughputPerSecond: windowSeconds > 0 ? totProc / windowSeconds : 0,
          errorRate: totAcc > 0 ? totFail / totAcc : 0,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Aggregator facade — wraps any backend
// ---------------------------------------------------------------------------

export type MetricsAggregator = {
  /** Call this every time an event changes state */
  record(event: QueuedInferenceEvent, increment: BucketIncrement): void;
  /** Read current aggregated metrics over an optional window */
  getMetrics(windowMs?: number): Promise<AggregatedMetrics> | AggregatedMetrics;
};

/**
 * Wraps any `MetricsBackend` with a synchronous facade.
 * Fire-and-forget on async backends so the hot path stays non-blocking.
 */
export function createMetricsAggregator(backend: MetricsBackend): MetricsAggregator {
  return {
    record(event, increment) {
      void Promise.resolve(backend.record(event, increment));
    },
    getMetrics(windowMs) {
      return backend.getMetrics(windowMs);
    },
  };
}
