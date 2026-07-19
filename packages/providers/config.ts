import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { lmstudio } from './custom/lmstudio';
import { appConfig } from '@/lib/config';


type RemoteModelConfig = {
    url: string;
    headers?: Record<string, string>;
    path: string;
    idField: string;
    cacheTtlMs: number;
};

type ProviderConfig = {
    sdk?: unknown;
    createSdk?: (apiKey: string) =>
        | ReturnType<typeof createOpenAI>
        | ReturnType<typeof createAnthropic>
        | ReturnType<typeof createGoogleGenerativeAI>
        | ReturnType<typeof createOpenAICompatible>;
    label: string;
    description: string;
    apiKey?: string;
    apiKeyEnv?: string;
    isLocal?: boolean;
    defaultModel: string;
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
        label: 'OpenAI',
        description: 'Use your OpenAI API key.',
        apiKey: appConfig.providers.openaiApiKey,
        apiKeyEnv: 'OPENAI_API_KEY',
        defaultModel: 'gpt-4.1-mini',
        sdk: createOpenAI({
            apiKey: appConfig.providers.openaiApiKey,
        }),
        createSdk: (apiKey: string) => createOpenAI({ apiKey }),

        models: {
            url: 'https://api.openai.com/v1/models',
            headers: bearerHeaders(appConfig.providers.openaiApiKey),
            path: 'data',
            idField: 'id',
            cacheTtlMs: 60 * 60 * 1000,
        },
    },

    anthropic: {
        label: 'Anthropic',
        description: 'Use your Anthropic API key.',
        apiKey: appConfig.providers.anthropicApiKey,
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        defaultModel: 'claude-sonnet-4-20250514',
        sdk: appConfig.providers.anthropicApiKey
            ? createAnthropic({ apiKey: appConfig.providers.anthropicApiKey })
            : undefined,
        createSdk: (apiKey: string) => createAnthropic({ apiKey }),

        models: {
            url: 'https://api.anthropic.com/v1/models',
            headers: appConfig.providers.anthropicApiKey ? {
                'x-api-key': appConfig.providers.anthropicApiKey,
                'anthropic-version': '2023-06-01',
            } : undefined,
            path: 'data',
            idField: 'id',
            cacheTtlMs: 60 * 60 * 1000,
        },
    },

    google: {
        label: 'Google',
        description: 'Use your Google AI Studio API key.',
        apiKey: appConfig.providers.googleApiKey,
        apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
        defaultModel: 'gemini-2.5-flash',
        sdk: appConfig.providers.googleApiKey
            ? createGoogleGenerativeAI({ apiKey: appConfig.providers.googleApiKey })
            : undefined,
        createSdk: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),

        models: {
            url: 'https://generativelanguage.googleapis.com/v1beta/models',
            path: 'models',
            idField: 'name',
            cacheTtlMs: 60 * 60 * 1000,
        },
    },

    lmstudio: {
        label: 'LM Studio',
        description: 'Use a local LM Studio server.',
        isLocal: true,
        defaultModel: 'local-model',
        sdk: lmstudio,

        models: {
            url: `${appConfig.providers.lmstudioBaseUrl}/models`,
            path: 'data',
            idField: 'id',
            cacheTtlMs: 0,
        },
    },

    groq: {
        label: 'Groq',
        description: 'Use your Groq API key.',
        apiKey: appConfig.providers.groqApiKey,
        apiKeyEnv: 'GROQ_API_KEY',
        defaultModel: 'llama-3.3-70b-versatile',
        sdk: createOpenAICompatible({
            name: 'groq',
            apiKey: appConfig.providers.groqApiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        }),
        createSdk: (apiKey: string) => createOpenAICompatible({
            name: 'groq',
            apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        }),

        models: {
            url: 'https://api.groq.com/openai/v1/models',
            headers: bearerHeaders(appConfig.providers.groqApiKey),
            path: 'data',
            idField: 'id',
            cacheTtlMs: 60 * 60 * 1000,
        },
    },
} satisfies Record<string, ProviderConfig>;
