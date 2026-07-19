import { createOpenAI } from '@ai-sdk/openai';
import { lmstudio } from './custom/lmstudio';


type RemoteModelConfig = {
    url: string;
    headers?: Record<string, string>;
    path: string;
    idField: string;
    cacheTtlMs: number;
};

type ProviderConfig = {
    sdk: unknown;
    models: RemoteModelConfig;
};


function bearerHeaders(
    apiKey: string | undefined,
): Record<string, string> | undefined {
    if (!apiKey) {
        return undefined;
    }

    return {
        Authorization: `Bearer ${apiKey}`,
    };
}

export const providers = {
    openai: {
        sdk: createOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        }),

        models: {
            url: 'https://api.openai.com/v1/models',
            headers: bearerHeaders(process.env.OPENAI_API_KEY),
            path: 'data',
            idField: 'id',
            cacheTtlMs: 60 * 60 * 1000,
        },
    },

    lmstudio: {
        sdk: lmstudio,

        models: {
            url: `${process.env.LMSTUDIO_BASE_URL ??
                'http://localhost:1234/v1'
                }/models`,
            path: 'data',
            idField: 'id',
            cacheTtlMs: 0,
        },
    },

    groq: {
        sdk: createOpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: 'https://api.groq.com/openai/v1',
        }),

        models: {
            url: 'https://api.groq.com/openai/v1/models',
            headers: bearerHeaders(process.env.GROQ_API_KEY),
            path: 'data',
            idField: 'id',
            cacheTtlMs: 60 * 60 * 1000,
        },
    },
} satisfies Record<string, ProviderConfig>;
