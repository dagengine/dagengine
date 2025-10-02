import {
    BaseProvider,
    ProviderConfig,
    ProviderResponse,
    BaseProviderDimensionOptions
} from './base-provider';

// OpenAI Provider Constants
export const OPENAI_DEFAULTS = {
    MODEL: 'gpt-4o',
    TEMPERATURE: 0.1,
    MAX_TOKENS: 4000,
    BASE_URL: 'https://api.openai.com/v1',
} as const;

export interface OpenAIConfig extends ProviderConfig {
    baseUrl?: string;
    organization?: string;
}

export interface OpenAIDimensionOptions extends BaseProviderDimensionOptions {
    model: string
    temperature?: number,
    maxTokens?: number
}

export class OpenAIProvider extends BaseProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly organization?: string | undefined;

    constructor(config: OpenAIConfig) {
        super(config);
        this.name = 'openai';

        if (!config.apiKey) {
            throw new Error('OpenAI API key is required');
        }

        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || OPENAI_DEFAULTS.BASE_URL;
        this.organization = config.organization;
    }

    async process(
        prompt: string,
        options: OpenAIDimensionOptions
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

    private buildRequestConfig(options: OpenAIDimensionOptions) {
        return {
            model: options.model || OPENAI_DEFAULTS.MODEL,
            temperature: options.temperature ?? OPENAI_DEFAULTS.TEMPERATURE,
            maxTokens: options.maxTokens || OPENAI_DEFAULTS.MAX_TOKENS,
        };
    }

    private async makeRequest(prompt: string, config: ReturnType<typeof this.buildRequestConfig>): Promise<Response> {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };

        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }

        const response = await globalThis.fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: config.temperature,
                max_tokens: config.maxTokens,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API request failed (${response.status}): ${errorText}`);
        }

        return response;
    }

    private async parseResponse(response: Response): Promise<OpenAIResponse> {
        try {
            return await response.json() as OpenAIResponse;
        } catch (error) {
            throw new Error('Failed to parse OpenAI API response as JSON');
        }
    }

    private extractContent(data: OpenAIResponse): string {
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content found in OpenAI API response');
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
        return new Error(`OpenAI provider error: ${String(error)}`);
    }
}

interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string
        }
    }>;
}