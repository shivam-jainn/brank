-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('system', 'user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "InferenceEventType" AS ENUM ('started', 'first_token', 'progress', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "InferenceStatus" AS ENUM ('started', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "MetadataSource" AS ENUM ('client', 'server', 'inference', 'extractor');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "parts" JSONB,
    "attachments" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "requestId" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceEvent" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "sessionId" TEXT,
    "traceId" TEXT,
    "requestId" TEXT,
    "eventType" "InferenceEventType" NOT NULL,
    "status" "InferenceStatus" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "metadata" JSONB NOT NULL,
    "previews" JSONB NOT NULL,
    "error" JSONB,
    "rawEvent" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL,
    "processingStartedAt" TIMESTAMP(3),
    "persistedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InferenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedMetadata" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "chatMessageId" TEXT,
    "inferenceEventId" TEXT,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" "MetadataSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_sessionId_updatedAt_idx" ON "Conversation"("sessionId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_requestId_idx" ON "ChatMessage"("requestId");

-- CreateIndex
CREATE INDEX "ChatMessage_traceId_idx" ON "ChatMessage"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_sequence_key" ON "ChatMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "InferenceEvent_conversationId_emittedAt_idx" ON "InferenceEvent"("conversationId", "emittedAt");

-- CreateIndex
CREATE INDEX "InferenceEvent_traceId_sequence_idx" ON "InferenceEvent"("traceId", "sequence");

-- CreateIndex
CREATE INDEX "InferenceEvent_requestId_idx" ON "InferenceEvent"("requestId");

-- CreateIndex
CREATE INDEX "InferenceEvent_provider_model_emittedAt_idx" ON "InferenceEvent"("provider", "model", "emittedAt");

-- CreateIndex
CREATE INDEX "InferenceEvent_eventType_emittedAt_idx" ON "InferenceEvent"("eventType", "emittedAt");

-- CreateIndex
CREATE INDEX "InferenceEvent_status_emittedAt_idx" ON "InferenceEvent"("status", "emittedAt");

-- CreateIndex
CREATE INDEX "ExtractedMetadata_conversationId_namespace_key_idx" ON "ExtractedMetadata"("conversationId", "namespace", "key");

-- CreateIndex
CREATE INDEX "ExtractedMetadata_chatMessageId_idx" ON "ExtractedMetadata"("chatMessageId");

-- CreateIndex
CREATE INDEX "ExtractedMetadata_inferenceEventId_idx" ON "ExtractedMetadata"("inferenceEventId");

-- CreateIndex
CREATE INDEX "ExtractedMetadata_source_createdAt_idx" ON "ExtractedMetadata"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceEvent" ADD CONSTRAINT "InferenceEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedMetadata" ADD CONSTRAINT "ExtractedMetadata_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedMetadata" ADD CONSTRAINT "ExtractedMetadata_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedMetadata" ADD CONSTRAINT "ExtractedMetadata_inferenceEventId_fkey" FOREIGN KEY ("inferenceEventId") REFERENCES "InferenceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
