import { BaseProvider, BaseProviderDimensionOptions, ProviderResponse } from './base-provider';
import { OpenAIProvider, OpenAIConfig } from './openai-provider';
import { AnthropicProvider, AnthropicConfig } from './anthropic-provider';
import { GeminiProvider, GeminiConfig } from './gemini-provider';
import { TavilyProvider, TavilyConfig } from './tavily-provider';

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'tavily';

// Individual provider configurations
export type ProviderConfigurations = {
    openai?: OpenAIConfig;
    anthropic?: AnthropicConfig;
    gemini?: GeminiConfig;
    tavily?: TavilyConfig;
};

// Discriminated union for single provider operations
export type ProviderAdapterConfig =
    | { provider: 'openai'; config: OpenAIConfig }
    | { provider: 'anthropic'; config: AnthropicConfig }
    | { provider: 'gemini'; config: GeminiConfig }
    | { provider: 'tavily'; config: TavilyConfig };

export class ProviderAdapter {
    private readonly providers: Map<ProviderName, BaseProvider>;

    constructor(providers: ProviderConfigurations) {
        this.providers = new Map();
        this.initializeProviders(providers);
    }

    async processPrompt(
        prompt: string,
        providerConfig: ProviderAdapterConfig
    ): Promise<ProviderResponse> {
        if (!this.isValidProviderName(providerConfig.provider)) {
            throw new Error(`Invalid provider '${providerConfig.provider}'. Valid providers are: ${this.getValidProviderNames().join(', ')}`);
        }

        const provider = this.getProvider(providerConfig.provider);

        if (!provider) {
            throw new Error(`Provider '${providerConfig.provider}' is not configured. Please add configuration for this provider.`);
        }


        return provider.process(prompt, providerConfig);
    }

    getConfiguredProviders(): ProviderName[] {
        return Array.from(this.providers.keys());
    }

    isProviderConfigured(providerName: ProviderName): boolean {
        return this.providers.has(providerName);
    }

    getValidProviderNames(): ProviderName[] {
        return ['openai', 'anthropic', 'gemini', 'tavily'];
    }

    addProvider(providerName: ProviderName, config: OpenAIConfig | AnthropicConfig | GeminiConfig | TavilyConfig): void {
        const provider = this.createProvider(providerName, config);
        this.providers.set(providerName, provider);
    }

    removeProvider(providerName: ProviderName): boolean {
        return this.providers.delete(providerName);
    }

    getProvider(providerName: ProviderName): BaseProvider | undefined {
        return this.providers.get(providerName);
    }

    private initializeProviders(configs: ProviderConfigurations): void {
        // Initialize all provided configurations
        if (configs.openai) {
            this.providers.set('openai', new OpenAIProvider(configs.openai));
        }

        if (configs.anthropic) {
            this.providers.set('anthropic', new AnthropicProvider(configs.anthropic));
        }

        if (configs.gemini) {
            this.providers.set('gemini', new GeminiProvider(configs.gemini));
        }

        if (configs.tavily) {
            this.providers.set('tavily', new TavilyProvider(configs.tavily));
        }

        if (this.providers.size === 0) {
            throw new Error('At least one provider configuration must be provided');
        }
    }

    private createProvider(
        providerName: ProviderName,
        config: OpenAIConfig | AnthropicConfig | GeminiConfig | TavilyConfig
    ): BaseProvider {
        switch (providerName) {
            case 'openai':
                return new OpenAIProvider(config as OpenAIConfig);
            case 'anthropic':
                return new AnthropicProvider(config as AnthropicConfig);
            case 'gemini':
                return new GeminiProvider(config as GeminiConfig);
            case 'tavily':
                return new TavilyProvider(config as TavilyConfig);
            default:
                throw new Error(`Unknown provider: ${providerName}`);
        }
    }

    private isValidProviderName(name: string): name is ProviderName {
        return ['openai', 'anthropic', 'gemini', 'tavily'].includes(name);
    }
}

// Export types for convenience
export { BaseProvider, BaseProviderDimensionOptions, ProviderResponse } from './base-provider';