import {
    BaseProvider,
    ProviderConfig,
    ProviderResponse,
    BaseProviderDimensionOptions
} from './base-provider';

export const GEMINI_DEFAULTS = {
    MODEL: 'gemini-1.5-pro',
    TEMPERATURE: 0.1,
    MAX_OUTPUT_TOKENS: 4000,
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    RESPONSE_MIME_TYPE: 'application/json',
} as const;

export interface GeminiDimensionOptions extends BaseProviderDimensionOptions {
    model: string
    temperature?: number,
    maxTokens?: number
}

export interface GeminiConfig extends ProviderConfig {
    baseUrl?: string;
}

export class GeminiProvider extends BaseProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(config: GeminiConfig) {
        super(config);
        this.name = 'gemini';

        if (!config.apiKey) {
            throw new Error('Gemini API key is required');
        }

        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || GEMINI_DEFAULTS.BASE_URL;
    }

    async process(
        prompt: string,
        options: GeminiDimensionOptions
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

    private buildRequestConfig(options: GeminiDimensionOptions) {
        return {
            model: options.model || GEMINI_DEFAULTS.MODEL,
            temperature: options.temperature ?? GEMINI_DEFAULTS.TEMPERATURE,
            maxOutputTokens: options.maxTokens || GEMINI_DEFAULTS.MAX_OUTPUT_TOKENS,
        };
    }

    private async makeRequest(prompt: string, config: ReturnType<typeof this.buildRequestConfig>): Promise<Response> {
        const url = `${this.baseUrl}/models/${config.model}:generateContent?key=${this.apiKey}`;

        const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: config.temperature,
                    maxOutputTokens: config.maxOutputTokens,
                    responseMimeType: GEMINI_DEFAULTS.RESPONSE_MIME_TYPE,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API request failed (${response.status}): ${errorText}`);
        }

        return response;
    }

    private async parseResponse(response: Response): Promise<GeminiResponse> {
        try {
            return await response.json() as GeminiResponse;
        } catch (error) {
            throw new Error('Failed to parse Gemini API response as JSON');
        }
    }

    private extractContent(data: GeminiResponse): string {
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error('No content found in Gemini API response');
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
        return new Error(`Gemini provider error: ${String(error)}`);
    }
}

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{ text: string }>
        };
    }>;
}