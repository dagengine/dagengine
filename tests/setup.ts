import { BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse } from '../src/providers/types';

// Mock AI Provider
export class MockAIProvider extends BaseProvider {
    public callCount = 0;
    public lastRequest: ProviderRequest | null = null;
    public mockResponses: Map<string, any> = new Map();
    public shouldFail = false;
    public delay = 0;

    constructor(config: ProviderConfig = {}) {
        super('mock-ai', config);
    }

    setMockResponse(input: string, response: any): void {
        this.mockResponses.set(input, response);
    }

    async execute(request: ProviderRequest): Promise<ProviderResponse> {
        this.callCount++;
        this.lastRequest = request;

        if (this.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.delay));
        }

        if (this.shouldFail) {
            return { error: 'Mock provider error' };
        }

        const response = this.mockResponses.get(request.input as string) || { result: 'mock response' };
        return { data: response };
    }

    reset(): void {
        this.callCount = 0;
        this.lastRequest = null;
        this.shouldFail = false;
        this.delay = 0;
    }
}

// Test utilities
export function createMockSection(content: string, metadata = {}): any {
    return { content, metadata };
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}