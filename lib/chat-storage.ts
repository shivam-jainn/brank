import type { UIMessage } from "ai";
import { Prisma, getPrismaClient } from "@/lib/db";
import { invalidateConversationCache } from "@/lib/chat-cache";

type PersistChatRequestOptions = {
  conversationId: string;
  sessionId?: string;
  userId?: string;
  requestId: string;
  traceId: string;
  provider: string;
  model: string;
  messages: UIMessage[];
};

type PersistChatResponseOptions = Omit<PersistChatRequestOptions, "messages"> & {
  message: UIMessage;
};

type MessagePersistenceInput = {
  provider: string;
  model: string;
  requestId: string;
  traceId: string;
  messages: UIMessage[];
  existingMessageIds: Set<string>;
  nextSequence: number;
};

export async function persistChatRequest({
  conversationId,
  sessionId,
  userId,
  requestId,
  traceId,
  provider,
  model,
  messages,
}: PersistChatRequestOptions): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.conversation.upsert({
      where: { id: conversationId },
      create: {
        id: conversationId,
        sessionId,
        userId,
        title: inferTitle(messages),
      },
      update: {},
    });

    if (sessionId) {
      await tx.conversation.updateMany({
        where: { id: conversationId, sessionId: null },
        data: { sessionId },
      });
    }

    if (userId) {
      await tx.conversation.updateMany({
        where: { id: conversationId, userId: null },
        data: { userId },
      });
    }

    await appendChatMessages(tx, {
      conversationId,
      provider,
      model,
      requestId,
      traceId,
      messages,
    });
  });

  // Invalidate Redis cache so next read reflects the new messages.
  await invalidateConversationCache(conversationId);
}

export async function persistChatResponse({
  conversationId,
  sessionId,
  userId,
  requestId,
  traceId,
  provider,
  model,
  message,
}: PersistChatResponseOptions): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.conversation.upsert({
      where: { id: conversationId },
      create: {
        id: conversationId,
        sessionId,
        userId,
        title: inferTitle([message]),
      },
      update: {},
    });

    if (sessionId) {
      await tx.conversation.updateMany({
        where: { id: conversationId, sessionId: null },
        data: { sessionId },
      });
    }

    if (userId) {
      await tx.conversation.updateMany({
        where: { id: conversationId, userId: null },
        data: { userId },
      });
    }

    await appendChatMessages(tx, {
      conversationId,
      provider,
      model,
      requestId,
      traceId,
      messages: [message],
    });
  });

  // Invalidate Redis cache so next read reflects the new assistant message.
  await invalidateConversationCache(conversationId);
}

async function appendChatMessages(
  tx: Prisma.TransactionClient,
  {
    conversationId,
    provider,
    model,
    requestId,
    traceId,
    messages,
  }: PersistChatRequestOptions,
): Promise<void> {
  const [latestMessage, existingMessages] = await Promise.all([
    tx.chatMessage.findFirst({
      where: { conversationId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    }),
    tx.chatMessage.findMany({
      where: {
        conversationId,
        id: {
          in: messages.map((message) => message.id).filter(Boolean),
        },
      },
      select: { id: true },
    }),
  ]);

  const rows = buildChatMessageRows({
    conversationId,
    provider,
    model,
    requestId,
    traceId,
    messages,
    existingMessageIds: new Set(existingMessages.map((message) => message.id)),
    nextSequence: (latestMessage?.sequence ?? -1) + 1,
  });

  if (rows.length === 0) {
    return;
  }

  await tx.chatMessage.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

export function buildChatMessageRows({
  conversationId,
  provider,
  model,
  requestId,
  traceId,
  messages,
  existingMessageIds,
  nextSequence,
}: MessagePersistenceInput & { conversationId: string }) {
  let sequence = nextSequence;

  return messages.flatMap((message, index) => {
    const id = message.id || `${conversationId}:${nextSequence + index}`;
    if (existingMessageIds.has(id)) {
      return [];
    }

    return [{
      id,
      conversationId,
      role: normalizeRole(message.role),
      sequence: sequence++,
      content: extractText(message),
      parts: message.parts as Prisma.InputJsonValue,
      provider,
      model,
      requestId,
      traceId,
    }];
  });
}

function normalizeRole(role: UIMessage["role"]): "system" | "user" | "assistant" | "tool" {
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }

  return "tool";
}

function inferTitle(messages: UIMessage[]): string | undefined {
  const firstUserText = messages.find((message) => message.role === "user");
  const text = firstUserText ? extractText(firstUserText).trim() : "";
  if (!text) return undefined;
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export async function getChatMessagesByConversation(
  conversationId: string
): Promise<Array<{ id: string; role: string; content: string; sequence: number; createdAt: Date }>> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      sequence: true,
      createdAt: true,
    },
  });

  return messages;
}

function extractText(message: UIMessage): string {
  const candidate = message as unknown as { content?: unknown };
  if (typeof candidate.content === "string") {
    return candidate.content;
  }

  return (message.parts ?? [])
    .map((part) => part.type === "text" ? part.text : "")
    .filter(Boolean)
    .join("");
}
