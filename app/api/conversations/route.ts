import { getPrismaClient } from "@/lib/db";
import { withLogging } from "@/lib/logger";

const RECENT_CONVERSATION_LIMIT = 100;

export const GET = withLogging(async function GET(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return Response.json({ error: "DATABASE_URL is required" }, { status: 500 });
  }

  const sessionId = request.headers.get("x-session-id") ?? undefined;

  const conversations = await prisma.conversation.findMany({
    where: sessionId ? { sessionId } : { sessionId: null },
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
