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
import { withReadableStreamingInference } from '@brank/inferhence';

export const POST = withLogging(async function POST(req: Request) {
    const { messages, model }: { messages: UIMessage[], model: any } = await req.json();
    const modelId = String(model);
    const [provider = 'unknown', modelName = modelId] = modelId.split(':', 2);
    const traceId = req.headers.get('traceparent') ??
        req.headers.get('x-trace-id') ??
        crypto.randomUUID();

    const result = streamText({
        model: registry.languageModel(modelId),
        messages: await convertToModelMessages(messages),
        abortSignal: req.signal,
    });

    const instrumentedStream = withReadableStreamingInference(
        { messages, model: modelId },
        () => result.stream,
        {
            metadata: {
                provider,
                model: modelName,
                operation: 'chat.stream',
                conversationId: req.headers.get('x-conversation-id') ?? undefined,
                sessionId: req.headers.get('x-session-id') ?? undefined,
                traceId,
                requestId: req.headers.get('x-request-id') ?? traceId,
                attributes: {
                    route: '/api/chat',
                },
            },
            transport: getInferenceTransport(),
            progress: {
                intervalMs: readNumber(process.env.INFERHENCE_PROGRESS_INTERVAL_MS, 2_000),
                chunkCount: readNumber(process.env.INFERHENCE_PROGRESS_CHUNK_COUNT, 20),
                tokenThreshold: readNumber(process.env.INFERHENCE_PROGRESS_TOKEN_THRESHOLD, 100),
            },
            signal: req.signal,
            chunkToText: (chunk) => chunk.type === 'text-delta' ? chunk.text : '',
            usageFromChunk: (chunk) => chunk.type === 'finish'
                ? usageFromAiSdk(chunk.totalUsage)
                : undefined,
        },
    );

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: instrumentedStream }),
        consumeSseStream: consumeStream,
    });
});

function readNumber(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
