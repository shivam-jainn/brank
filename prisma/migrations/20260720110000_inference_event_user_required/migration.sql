-- Update existing InferenceEvents without userId to link to anonymous user
UPDATE "InferenceEvent" SET "userId" = 'anonymous-user' WHERE "userId" IS NULL;

-- Make userId NOT NULL
ALTER TABLE "InferenceEvent" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "InferenceEvent"
ADD CONSTRAINT "InferenceEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index if not exists
CREATE INDEX IF NOT EXISTS "InferenceEvent_userId_emittedAt_idx" ON "InferenceEvent"("userId", "emittedAt");