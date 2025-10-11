export interface ProviderConfig {
    apiKey?: string;
    [key: string]: unknown;
}

export interface ProviderRequest {
    input: string | string[];
    options?: Record<string, unknown>;
}

export interface ProviderResponse<T = unknown> {
    data?: T;
    error?: string;
    metadata?: Record<string, unknown>;
}

export abstract class BaseProvider {
    protected readonly config: ProviderConfig;
    public readonly name: string;
    public readonly type: 'ai' | 'search' | 'data';

    constructor(name: string, type: 'ai' | 'search' | 'data', config: ProviderConfig) {
        this.name = name;
        this.type = type;
        this.config = config;
    }

    abstract execute(request: ProviderRequest): Promise<ProviderResponse>;
}