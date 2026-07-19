import {
    consumeStream,
    streamText,
    UIMessage,
    convertToModelMessages,
    createUIMessageStreamResponse,
    toUIMessageStream,
} from 'ai';
import { registry } from '@brank/providers';
import { withLogging } from '@/lib/logger';
import { getInferenceTransport, usageFromAiSdk } from '@/lib/inferhence';
import { persistChatRequest, persistChatResponse } from '@/lib/chat-storage';
import { withReadableStreamingInference } from '@brank/inferhence';
import { appConfig } from '@/lib/config';

export const POST = withLogging(async function POST(req: Request) {
    const { messages, model }: { messages: UIMessage[], model: unknown } = await req.json();
    const selectedProvider = String(model);
    const modelId = selectedProvider.includes(':')
        ? selectedProvider
        : await registry.resolveProviderModel(selectedProvider);
    const apiKey = req.headers.get('x-provider-api-key') ?? undefined;
    const [provider = 'unknown', modelName = modelId] = modelId.split(':', 2);
    const conversationId = req.headers.get('x-conversation-id') ?? crypto.randomUUID();
    const sessionId = req.headers.get('x-session-id') ?? undefined;
    const traceId = req.headers.get('traceparent') ??
        req.headers.get('x-trace-id') ??
        crypto.randomUUID();
    const requestId = req.headers.get('x-request-id') ?? traceId;

    await persistChatRequest({
        conversationId,
        sessionId,
        requestId,
        traceId,
        provider,
        model: modelName,
        messages,
    });

    const result = streamText({
        model: registry.languageModel(modelId, apiKey),
        messages: await convertToModelMessages(messages),
        abortSignal: req.signal,
    });

    const ingestUrl = appConfig.inference.ingestUrl ?? new URL('/api/ingest', req.url).toString();
    const instrumentedStream = withReadableStreamingInference(
        { messages, model: modelId },
        () => result.stream,
        {
            metadata: {
                provider,
                model: modelName,
                operation: 'chat.stream',
                conversationId,
                sessionId,
                traceId,
                requestId,
                attributes: {
                    route: '/api/chat',
                },
            },
            transport: getInferenceTransport(ingestUrl),
            progress: {
                intervalMs: appConfig.inference.progressIntervalMs,
                chunkCount: appConfig.inference.progressChunkCount,
                tokenThreshold: appConfig.inference.progressTokenThreshold,
            },
            signal: req.signal,
            chunkToText: (chunk) => chunk.type === 'text-delta' ? chunk.text : '',
            usageFromChunk: (chunk) => chunk.type === 'finish'
                ? usageFromAiSdk(chunk.totalUsage)
                : undefined,
        },
    );
    const assistantMessageId = crypto.randomUUID();
    let assistantText = '';
    const persistedResponseStream = instrumentedStream.pipeThrough(new TransformStream({
        transform(chunk, controller) {
            if (chunk.type === 'text-delta') {
                assistantText += chunk.text;
            }
            controller.enqueue(chunk);
        },
        async flush() {
            if (!assistantText) {
                return;
            }

            await persistChatResponse({
                conversationId,
                sessionId,
                requestId,
                traceId,
                provider,
                model: modelName,
                message: {
                    id: assistantMessageId,
                    role: 'assistant',
                    parts: [{ type: 'text', text: assistantText }],
                },
            });
        },
    }));

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: persistedResponseStream }),
        consumeSseStream: consumeStream,
    });
});
