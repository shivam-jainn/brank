import { normalizeLocalServiceUrl } from "@/lib/local-url";

export const appConfig = {
  envMode: process.env.APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
  databaseUrl: normalizeLocalServiceUrl(process.env.DATABASE_URL),
  rabbitmqUrl: process.env.RABBITMQ_URL,
  redisUrl: process.env.REDIS_URL,
  inference: {
    ingestUrl: process.env.INFERHENCE_INGEST_URL ?? "http://localhost:3000/api/ingest",
    ingestHeaders: process.env.INFERHENCE_INGEST_HEADERS,
    timeoutMs: readNumber(process.env.INFERHENCE_TIMEOUT_MS, 5_000),
    retries: readNumber(process.env.INFERHENCE_RETRIES, 2),
    progressIntervalMs: readNumber(process.env.INFERHENCE_PROGRESS_INTERVAL_MS, 2_000),
    progressChunkCount: readNumber(process.env.INFERHENCE_PROGRESS_CHUNK_COUNT, 20),
    progressTokenThreshold: readNumber(process.env.INFERHENCE_PROGRESS_TOKEN_THRESHOLD, 100),
  },
  ingestion: {
    maxBatchSize: readNumber(process.env.INGESTION_MAX_BATCH_SIZE, 100),
    maxBatchWaitMs: readNumber(process.env.INGESTION_MAX_BATCH_WAIT_MS, 250),
    maxRetries: readNumber(process.env.INGESTION_MAX_RETRIES, 3),
    queueCapacity: readNumber(process.env.INGESTION_QUEUE_CAPACITY, 10_000),
  },
  providers: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    lmstudioBaseUrl:
      normalizeLocalServiceUrl(process.env.LMSTUDIO_BASE_URL) ?? "http://localhost:1234/v1",
  },
};

export const isProdEnv = appConfig.envMode === "prod" || appConfig.envMode === "production";
export const isGuestLoginEnabled = !isProdEnv;
export const enabledOAuthProviders = {
  google: Boolean(appConfig.auth.googleClientId && appConfig.auth.googleClientSecret),
  github: Boolean(appConfig.auth.githubClientId && appConfig.auth.githubClientSecret),
};

export function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
