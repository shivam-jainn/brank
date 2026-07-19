import {
    streamText,
    UIMessage,
    convertToModelMessages,
    createUIMessageStreamResponse,
    toUIMessageStream,
} from 'ai';
import { registry } from '@/packages/providers/proivderregistry';
import { ProviderRegistryProvider } from 'ai';

export async function POST(req: Request) {
    const { messages, model }: { messages: UIMessage[], model: any } = await req.json();

    const result = streamText({
        model: registry.languageModel(model),
        messages: await convertToModelMessages(messages),
    });

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
    });
}