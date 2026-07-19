/**
 * Redis client singleton.
 *
 * The client is lazily initialised on first call to `getRedisClient()`.
 * If `REDIS_URL` is not set the function returns `null` and callers should
 * gracefully skip caching (the app works without Redis).
 */

// We use the `redis` package (v4+) which ships its own types.
// Import as `* as redis` so the module can be mocked easily in tests.
import { createClient, type RedisClientType } from "redis";

const globalForRedis = globalThis as typeof globalThis & {
  _redisClient?: RedisClientType | null;
};

export function getRedisClient(): RedisClientType | null {
  if ("_redisClient" in globalForRedis) {
    return globalForRedis._redisClient ?? null;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis._redisClient = null;
    return null;
  }

  const client = createClient({ url }) as RedisClientType;

  client.on("error", (error: unknown) => {
    console.error("[redis] client error:", error);
  });

  // Connect in the background; publish/get calls will queue automatically.
  void client.connect();

  globalForRedis._redisClient = client;
  return client;
}
