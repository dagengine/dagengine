export interface ProviderConfig {
    apiKey: string;
    [key: string]: unknown;
}

export interface BaseProviderDimensionOptions {
    provider: string;
    [key: string]: unknown;
}

export interface ProviderResponse {
    success: boolean;
    data: unknown;
    rawContent: string;
    provider: string;
    error?: string;
}

export abstract class BaseProvider {
    protected readonly config: ProviderConfig;
    public name: string;

    constructor(config: ProviderConfig) {
        this.config = config;
        this.name = 'base';
    }

    abstract process(
        prompt: string,
        options: BaseProviderDimensionOptions
    ): Promise<ProviderResponse>;
}