import {
    streamText,
    UIMessage,
    convertToModelMessages,
    createUIMessageStreamResponse,
    toUIMessageStream,
} from 'ai';
import { registry } from '@/packages/providers/registry';
import { withLogging } from '@/lib/logger';

export const POST = withLogging(async function POST(req: Request) {
    const { messages, model }: { messages: UIMessage[], model: any } = await req.json();

    const result = streamText({
        model: registry.languageModel(model),
        messages: await convertToModelMessages(messages),
    });

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
    });
});