import {
    createProviderRegistry,
} from 'ai';

import { providers } from './config';


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

export class ModelRegistry {
    private readonly registry = createProviderRegistry(
        Object.fromEntries(
            Object.entries(providers).map(([name, config]) => [
                name,
                config.sdk,
            ]),
        ) as Record<ProviderName, any>,
    );

    private readonly cache = new Map<ProviderName, CacheEntry>();

    languageModel(modelId: string) {
        return this.registry.languageModel(modelId as any);
    }

    getModel(modelId: RegisteredModelId) {
        return this.registry.languageModel(modelId);
    }

    async getAllModels(): Promise<Record<ProviderName, string[]>> {
        const entries = await Promise.all(
            (Object.keys(providers) as ProviderName[]).map(
                async provider =>
                    [
                        provider,
                        await this.getProviderModels(provider),
                    ] as const,
            ),
        );

        return Object.fromEntries(entries) as Record<
            ProviderName,
            string[]
        >;
    }

    async getProviderModels(
        provider: ProviderName,
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

        const response = await fetch(config.url, {
            headers: config.headers,
            signal: AbortSignal.timeout(5_000),
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch ${provider} models: ` +
                `${response.status} ${response.statusText}`,
            );
        }

        const payload: unknown = await response.json();
        const items = getByPath(payload, config.path);

        if (!Array.isArray(items)) {
            throw new Error(
                `Invalid model response from ${provider}: ` +
                `"${config.path}" is not an array`,
            );
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
            .sort();

        if (config.cacheTtlMs > 0) {
            this.cache.set(provider, {
                models,
                expiresAt: Date.now() + config.cacheTtlMs,
            });
        }

        return models;
    }

    clearCache(provider?: ProviderName): void {
        if (provider) {
            this.cache.delete(provider);
            return;
        }

        this.cache.clear();
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