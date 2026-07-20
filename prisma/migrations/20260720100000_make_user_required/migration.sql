-- Create a default anonymous user for unauthenticated conversations
INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "isAnonymous", "createdAt", "updatedAt")
VALUES ('anonymous-user', 'Anonymous', 'anonymous@local', false, null, true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Update existing conversations without userId to link to anonymous user
UPDATE "Conversation" SET "userId" = 'anonymous-user' WHERE "userId" IS NULL;

-- Make userId NOT NULL
ALTER TABLE "Conversation" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "Conversation" 
ADD CONSTRAINT "Conversation_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index if not exists
CREATE INDEX IF NOT EXISTS "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");