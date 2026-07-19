import {
    createProviderRegistry,
    type LanguageModel,
} from 'ai';

import { providers } from './config';
import { logger } from '@/lib/logger';


type ModelDiscoveryConfig = {
    url: string;
    headers?: Record<string, string>;
    path: string;
    idField: string;
    cacheTtlMs: number;
};

type CacheEntry = {
    models: string[];
    expiresAt: number;
};


type ProviderName = keyof typeof providers;
type RegisteredModelId = `${ProviderName}:${string}`;
type RegistryProvider = Parameters<typeof createProviderRegistry>[0][string];
type ProviderConfigValue = (typeof providers)[ProviderName] & {
    apiKey?: string;
    apiKeyEnv?: string;
    isLocal?: boolean;
    sdk?: unknown;
    createSdk?: (apiKey: string) => { languageModel(modelId: string): LanguageModel };
};
export type ProviderSummary = {
    id: ProviderName;
    name: string;
    description: string;
    apiKeyEnv?: string;
    isLocal: boolean;
    isConfigured: boolean;
};
export type ProviderCatalogEntry = ProviderSummary & {
    models: string[];
};

export class ModelRegistry {
    private readonly registry = createProviderRegistry(
        Object.fromEntries(
            Object.entries(providers)
                .filter((entry): entry is [ProviderName, ProviderConfigValue & { sdk: RegistryProvider }] =>
                    Boolean((entry[1] as ProviderConfigValue).sdk),
                )
                .map(([name, config]) => [
                    name,
                    config.sdk,
                ]),
        ) as Record<string, RegistryProvider>,
    );

    private readonly cache = new Map<ProviderName, CacheEntry>();

    languageModel(modelId: string, apiKey?: string) {
        if (apiKey) {
            const [provider, model] = modelId.split(':', 2);
            if (!this.isProviderName(provider) || !model) {
                throw new Error(`Invalid model identifier "${modelId}"`);
            }
            const config = providers[provider] as ProviderConfigValue;
            if (!config.createSdk) {
                throw new Error(`${config.label} does not support browser-provided keys.`);
            }
            return config.createSdk(apiKey).languageModel(model);
        }
        return this.registry.languageModel(modelId as `${string}:${string}`);
    }

    getProviderSummaries(): ProviderSummary[] {
        return (Object.entries(providers) as [ProviderName, typeof providers[ProviderName]][]).map(
            ([id, rawConfig]) => {
                const config = rawConfig as ProviderConfigValue;

                return {
                    id,
                    name: config.label,
                    description: config.description,
                    apiKeyEnv: config.apiKeyEnv,
                    isLocal: Boolean(config.isLocal),
                    isConfigured: Boolean(config.isLocal || (config.apiKey && config.sdk)),
                };
            },
        );
    }

    async getProviderCatalog(apiKeys: Partial<Record<ProviderName, string>> = {}): Promise<ProviderCatalogEntry[]> {
        const summaries = this.getProviderSummaries();

        return Promise.all(
            summaries.map(async summary => {
                const apiKey = apiKeys[summary.id];
                const isConfigured = summary.isConfigured || Boolean(apiKey);
                if (!isConfigured) {
                    return {
                        ...summary,
                        isConfigured,
                        models: [],
                    };
                }

                try {
                    return {
                        ...summary,
                        isConfigured,
                        models: await this.getProviderModels(summary.id, apiKey),
                    };
                } catch (error: unknown) {
                    logger.warn(
                        { provider: summary.id },
                        `Failed to load models for provider ${summary.id} (${formatError(error)}), returning empty list`
                    );

                    return {
                        ...summary,
                        isConfigured,
                        models: [],
                    };
                }
            }),
        );
    }

    async resolveProviderModel(provider: string): Promise<RegisteredModelId> {
        if (!this.isProviderName(provider)) {
            throw new Error(`Unknown provider "${provider}"`);
        }

        const config = providers[provider] as ProviderConfigValue;

        if (!config.sdk) {
            throw new Error(`${config.label} is not available in this build yet.`);
        }

        if (config.isLocal) {
            const [firstModel] = await this.getProviderModels(provider);

            if (firstModel) {
                return `${provider}:${firstModel}`;
            }
        }

        return `${provider}:${config.defaultModel}`;
    }

    getModel(modelId: RegisteredModelId) {
        return this.registry.languageModel(modelId);
    }

    async getAllModels(): Promise<Record<ProviderName, string[]>> {
        const entries = await Promise.all(
            (Object.keys(providers) as ProviderName[]).map(
                async provider => {
                    try {
                        return [
                            provider,
                            await this.getProviderModels(provider),
                        ] as const;
                    } catch (error: unknown) {
                        logger.warn(
                            { provider },
                            `Failed to load models for provider ${provider} (${formatError(error)}), returning empty list`
                        );
                        return [provider, []] as const;
                    }
                }
            ),
        );

        return Object.fromEntries(entries) as Record<
            ProviderName,
            string[]
        >;
    }

    async getProviderModels(
        provider: ProviderName,
        apiKey?: string,
    ): Promise<string[]> {
        const config: ModelDiscoveryConfig =
            providers[provider].models;

        const cached = this.cache.get(provider);

        if (
            config.cacheTtlMs > 0 &&
            cached &&
            cached.expiresAt > Date.now()
        ) {
            return cached.models;
        }

        const startTime = Date.now();
        let response: Response;

        try {
            const url = new URL(config.url);
            const headers = { ...config.headers };
            if (apiKey) {
                if (provider === 'anthropic') {
                    headers['x-api-key'] = apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                } else if (provider === 'google') {
                    url.searchParams.set('key', apiKey);
                } else {
                    headers.Authorization = `Bearer ${apiKey}`;
                }
            }
            response = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(5_000),
            });
        } catch (error: unknown) {
            const duration = Date.now() - startTime;
            throw new Error(`fetch failed from ${config.url} after ${duration}ms: ${formatError(error)}`);
        }

        const duration = Date.now() - startTime;
        logger.info(
            {
                'http.response.status_code': response.status,
                'http.request.method': 'GET',
                'url.full': config.url,
                'duration_ms': duration,
                provider,
            },
            `FETCH SUCCESS: Fetched ${provider} models from ${config.url} - ${response.status} in ${duration}ms`
        );

        if (!response.ok) {
            throw new Error(`status ${response.status} ${response.statusText}`);
        }

        try {
            const payload: unknown = await response.json();
            const items = getByPath(payload, config.path);

            if (!Array.isArray(items)) {
                throw new Error(`"${config.path}" is not an array`);
            }

            const models = items
                .map(item => {
                    if (
                        typeof item !== 'object' ||
                        item === null
                    ) {
                        return null;
                    }

                    const id = (item as Record<string, unknown>)[
                        config.idField
                    ];

                    return typeof id === 'string' ? id : null;
                })
                .filter((id): id is string => id !== null)
                .map(id => provider === 'google' ? id.replace(/^models\//, '') : id)
                .sort();

            if (config.cacheTtlMs > 0) {
                this.cache.set(provider, {
                    models,
                    expiresAt: Date.now() + config.cacheTtlMs,
                });
            }

            return models;
        } catch (error: unknown) {
            throw new Error(`failed to parse/process response payload: ${formatError(error)}`);
        }
    }

    clearCache(provider?: ProviderName): void {
        if (provider) {
            this.cache.delete(provider);
            return;
        }

        this.cache.clear();
    }

    private isProviderName(provider: string): provider is ProviderName {
        return provider in providers;
    }
}

function getByPath(
    value: unknown,
    path: string,
): unknown {
    return path.split('.').reduce<unknown>(
        (current, key) => {
            if (
                typeof current !== 'object' ||
                current === null
            ) {
                return undefined;
            }

            return (current as Record<string, unknown>)[key];
        },
        value,
    );
}

export const registry = new ModelRegistry();

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
