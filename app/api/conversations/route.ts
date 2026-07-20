import { getPrismaClient } from "@/lib/db";
import { withLogging } from "@/lib/logger";
import { auth } from "@/lib/auth";

const RECENT_CONVERSATION_LIMIT = 100;

export const GET = withLogging(async function GET(request: Request) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return Response.json({ error: "DATABASE_URL is required" }, { status: 500 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json([]);
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId },
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
