import { getPrismaClient } from "@/lib/db";
import { withLogging } from "@/lib/logger";

const RECENT_CONVERSATION_LIMIT = 20;

export const GET = withLogging(async function GET() {
  const prisma = getPrismaClient();
  if (!prisma) {
    return Response.json({ error: "DATABASE_URL is required" }, { status: 500 });
  }

  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: RECENT_CONVERSATION_LIMIT,
    include: {
      messages: {
        orderBy: { sequence: "asc" },
      },
    },
  });

  return Response.json(conversations);
});
