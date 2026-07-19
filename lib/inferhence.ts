import {
    createHttpTransport,
    createMemoryTransport,
    type InferenceTransport,
    type TokenUsage,
} from '@brank/inferhence';

type AiSdkUsage = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
};

let sharedTransport: InferenceTransport | undefined;

export function getInferenceTransport(): InferenceTransport {
    if (sharedTransport) {
        return sharedTransport;
    }

    const endpoint = process.env.INFERHENCE_INGEST_URL;

    sharedTransport = endpoint
        ? createHttpTransport({
            endpoint,
            headers: parseHeaders(process.env.INFERHENCE_INGEST_HEADERS),
            timeoutMs: readNumber(process.env.INFERHENCE_TIMEOUT_MS, 5_000),
            retries: readNumber(process.env.INFERHENCE_RETRIES, 2),
        })
        : createMemoryTransport();

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

function readNumber(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
