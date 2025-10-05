import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { TavilyProvider } from './tavily-provider';
import { WhoisXMLProvider, WhoisXMLProviderConfig } from './whosXML-provider';

export interface AIAdapterConfig {
    openai?: AIProviderConfig;
    anthropic?: AIProviderConfig;
    gemini?: AIProviderConfig;
    tavily?: AIProviderConfig;
    whoisxml?: WhoisXMLProviderConfig;
}

export class AIAdapter {
    private readonly config: AIAdapterConfig;
    private readonly providers: Map<string, BaseAIProvider>;

    constructor(config: AIAdapterConfig = {}) {
        this.config = config;
        this.providers = new Map();
        this.initializeProviders();
    }

    async process(
        prompt: string,
        options: ProcessOptions = {},
    ): Promise<AIResponse> {
        const provider = this.getProvider(options.provider);

        if (!provider) {
            throw new Error(`AI provider not available: ${options.provider}`);
        }

        return provider.process(prompt, options);
    }

    private initializeProviders(): void {
        if (this.config.openai?.apiKey) {
            this.providers.set(
                "openai",
                new OpenAIProvider({
                    apiKey: this.config.openai.apiKey,
                    ...this.config.openai,
                }),
            );
        }

        if (this.config.anthropic?.apiKey) {
            this.providers.set(
                "anthropic",
                new AnthropicProvider({
                    apiKey: this.config.anthropic.apiKey,
                    ...this.config.anthropic,
                }),
            );
        }

        if (this.config.gemini?.apiKey) {
            this.providers.set(
                "gemini",
                new GeminiProvider({
                    apiKey: this.config.gemini.apiKey,
                    ...this.config.gemini,
                }),
            );
        }

        if (this.config.tavily?.apiKey) {
            this.providers.set(
                "tavily",
                new TavilyProvider({
                    apiKey: this.config.tavily.apiKey,
                    ...this.config.tavily,
                }),
            );
        }

        if (this.config.whoisxml?.apiKey) {
            this.providers.set(
                "whoisxml",
                // @ts-ignore
                new WhoisXMLProvider({
                    ...this.config.whoisxml,
                }),
            );
        }
    }

    private getProvider(provider?: string): BaseAIProvider | undefined {
        return this.providers.get(provider || "");
    }
}

export { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';
export { OpenAIProvider } from './openai-provider';
export { AnthropicProvider } from './anthropic-provider';
export { GeminiProvider } from './gemini-provider';
export { TavilyProvider } from './tavily-provider';
export { WhoisXMLProvider } from './whosXML-provider';