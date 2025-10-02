import {
    BaseProvider,
    ProviderConfig,
    ProviderResponse,
    BaseProviderDimensionOptions
} from './base-provider';

export const ANTHROPIC_DEFAULTS = {
    MODEL: 'claude-3-5-sonnet-20240620',
    TEMPERATURE: 0.1,
    MAX_TOKENS: 4000,
    API_VERSION: '2023-06-01',
    BASE_URL: 'https://api.anthropic.com/v1',
} as const;

export interface AnthropicDimensionOptions extends BaseProviderDimensionOptions {
    model: string
    temperature?: number,
    maxTokens?: number
}

export interface AnthropicConfig extends ProviderConfig {
    apiVersion?: string;
    baseUrl?: string;
}

export class AnthropicProvider extends BaseProvider {
    private readonly apiKey: string;
    private readonly apiVersion: string;
    private readonly baseUrl: string;

    constructor(config: AnthropicConfig) {
        super(config);
        this.name = 'anthropic';

        if (!config.apiKey) {
            throw new Error('Anthropic API key is required');
        }

        this.apiKey = config.apiKey;
        this.apiVersion = config.apiVersion || ANTHROPIC_DEFAULTS.API_VERSION;
        this.baseUrl = config.baseUrl || ANTHROPIC_DEFAULTS.BASE_URL;
    }

    async process(
        prompt: string,
        options: AnthropicDimensionOptions
    ): Promise<ProviderResponse> {
        if (!prompt?.trim()) {
            throw new Error('Prompt cannot be empty');
        }

        const requestConfig = this.buildRequestConfig(options);

        try {
            const response = await this.makeRequest(prompt, requestConfig);
            const data = await this.parseResponse(response);
            const content = this.extractContent(data);

            return this.formatResponse(content);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    private buildRequestConfig(options: AnthropicDimensionOptions) {
        return {
            model: options?.model || ANTHROPIC_DEFAULTS.MODEL,
            temperature: options?.temperature ?? ANTHROPIC_DEFAULTS.TEMPERATURE,
            maxTokens: options?.maxTokens || ANTHROPIC_DEFAULTS.MAX_TOKENS,
        };
    }

    private async makeRequest(prompt: string, config: ReturnType<typeof this.buildRequestConfig>): Promise<Response> {
        const response = await globalThis.fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': this.apiVersion,
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: config.maxTokens,
                temperature: config.temperature,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API request failed (${response.status}): ${errorText}`);
        }

        return response;
    }

    private async parseResponse(response: Response): Promise<AnthropicResponse> {
        try {
            return await response.json() as AnthropicResponse;
        } catch (error) {
            throw new Error('Failed to parse Anthropic API response as JSON');
        }
    }

    private extractContent(data: AnthropicResponse): string {
        const content = data.content?.[0]?.text;
        if (!content) {
            throw new Error('No content found in Anthropic API response');
        }
        return content;
    }

    private formatResponse(content: string): ProviderResponse {
        // Try to parse as JSON first
        try {
            const parsedContent = JSON.parse(content);
            return {
                success: true,
                data: parsedContent,
                rawContent: content,
                provider: this.name
            };
        } catch {
            // If not JSON, return as text
            return {
                success: true,
                data: content,
                rawContent: content,
                provider: this.name
            };
        }
    }

    private handleError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }
        return new Error(`Anthropic provider error: ${String(error)}`);
    }
}

interface AnthropicResponse {
    content: Array<{ text: string }>;
}