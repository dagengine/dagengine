export interface AIProviderConfig {
    apiKey?: string;
    [key: string]: unknown;
}

export interface ProcessOptions {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    dimension?: string;
    sectionIndex?: number;
    [key: string]: unknown;
}

export interface AIResponse {
    response?: object;
    error?: unknown;
}

export abstract class BaseAIProvider {
    protected readonly config: AIProviderConfig;
    public name: string;

    constructor(config: AIProviderConfig) {
        this.config = config;
        this.name = "base";
    }

    abstract process(
        prompt: string,
        options: ProcessOptions,
    ): Promise<AIResponse>;
}