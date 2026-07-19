/**
 * Chat history cache backed by Redis.
 *
 * Caches conversation + message lists to avoid hitting Postgres on every read.
 * The cache is invalidated on every write so it never serves stale messages.
 *
 * TTL:
 *   - Default 5 minutes for conversation message lists.
 *   - You can tune via REDIS_CHAT_TTL_S (seconds).
 *
 * Keys:
 *   chat:conv:<id>:messages   → JSON array of chat messages
 *   chat:conv:<id>:meta       → JSON conversation metadata
 *
 * Degradation:
 *   If `getRedisClient()` returns null (no REDIS_URL), all cache functions
 *   are no-ops and the app reads from Postgres directly.
 */

import { getRedisClient } from "@/lib/redis";

const TTL_S = (() => {
  const raw = process.env.REDIS_CHAT_TTL_S;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300; // 5 min default
})();

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function messagesKey(conversationId: string) {
  return `chat:conv:${conversationId}:messages`;
}

function metaKey(conversationId: string) {
  return `chat:conv:${conversationId}:meta`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read cached message list. Returns `null` on a cache miss or when Redis is unavailable. */
export async function getCachedMessages<T>(conversationId: string): Promise<T[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(messagesKey(conversationId));
    if (!raw) return null;
    return JSON.parse(raw) as T[];
  } catch {
    return null;
  }
}

/** Store a message list in the cache with TTL. */
export async function setCachedMessages<T>(
  conversationId: string,
  messages: T[],
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(messagesKey(conversationId), JSON.stringify(messages), { EX: TTL_S });
  } catch {
    // best-effort — don't propagate cache errors to callers
  }
}

/** Read cached conversation metadata. */
export async function getCachedConversationMeta<T>(conversationId: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(metaKey(conversationId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Store conversation metadata in the cache with TTL. */
export async function setCachedConversationMeta<T>(
  conversationId: string,
  meta: T,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(metaKey(conversationId), JSON.stringify(meta), { EX: TTL_S });
  } catch {
    // best-effort
  }
}

/**
 * Invalidate all cache entries for a conversation.
 * Call this whenever messages are written so readers get fresh data.
 */
export async function invalidateConversationCache(conversationId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del([messagesKey(conversationId), metaKey(conversationId)]);
  } catch {
    // best-effort
  }
}
