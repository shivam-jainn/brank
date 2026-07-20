-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "InferenceEvent" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "InferenceEvent_userId_emittedAt_idx" ON "InferenceEvent"("userId", "emittedAt");
