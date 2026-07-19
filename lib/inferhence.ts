import {
    createHttpTransport,
    type InferenceTransport,
    type TokenUsage,
} from '@brank/inferhence';
import { appConfig } from '@/lib/config';

type AiSdkUsage = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimated?: boolean;
};

let sharedTransport: InferenceTransport | undefined;
let sharedEndpoint: string | undefined;

export function getInferenceTransport(endpointOverride?: string): InferenceTransport {
    const endpoint = endpointOverride ?? appConfig.inference.ingestUrl;

    if (sharedTransport && sharedEndpoint === endpoint) {
        return sharedTransport;
    }

    if (!endpoint) {
        throw new Error('INFERHENCE_INGEST_URL is required for inference logging.');
    }

    sharedEndpoint = endpoint;
    sharedTransport = createHttpTransport({
            endpoint,
            headers: parseHeaders(appConfig.inference.ingestHeaders),
            timeoutMs: appConfig.inference.timeoutMs,
            retries: appConfig.inference.retries,
        });

    return sharedTransport;
}

export function usageFromAiSdk(usage: AiSdkUsage | undefined): TokenUsage | undefined {
    if (!usage) {
        return undefined;
    }

    return {
        input: usage.inputTokens,
        output: usage.outputTokens,
        total: usage.totalTokens,
        estimated: usage.estimated,
    };
}

function parseHeaders(value: string | undefined): Record<string, string> | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined;
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
        );
    } catch {
        return undefined;
    }
}
