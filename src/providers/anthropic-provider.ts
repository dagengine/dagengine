import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';
import { parseAIJSON } from '../utils';

export class AnthropicProvider extends BaseAIProvider {
    private readonly apiKey: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.name = "anthropic";
        this.apiKey = config.apiKey || "";
    }

    async process(
        prompt: string,
        options: ProcessOptions = {},
    ): Promise<AIResponse> {
        try {
            const model = options.model || "claude-sonnet-4-5-20250929";
            const max_tokens = options.max_tokens || 4096;

            const requestBody: Record<string, any> = {
                model,
                max_tokens,
            };

            if (typeof prompt === 'string') {
                requestBody.messages = [{ role: "user", content: prompt }];
            } else {
                // if (prompt.system) requestBody.system = prompt.system;
                // if (prompt.messages) requestBody.messages = prompt.messages;
            }

            if (options.temperature !== undefined) requestBody.temperature = options.temperature;
            if (options.top_p !== undefined) requestBody.top_p = options.top_p;
            if (options.top_k !== undefined) requestBody.top_k = options.top_k;
            // if (options.stop_sequences?.length) requestBody.stop_sequences = options.stop_sequences;
            if (options.stream !== undefined) requestBody.stream = options.stream;
            if (options.metadata) requestBody.metadata = options.metadata;

            const response = await globalThis.fetch(
                "https://api.anthropic.com/v1/messages",
                {
                    method: "POST",
                    headers: {
                        "x-api-key": this.apiKey,
                        "Content-Type": "application/json",
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify(requestBody),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Anthropic API error: ${response.status} - ${errorText}`);
                throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
            }

            const data = (await response.json()) as {
                content: Array<{ text: string }>;
            };

            const rawContent = data.content[0]?.text || "";
            const cleaned = parseAIJSON(rawContent)

            // Try to parse as JSON, fallback to text
            try {
                return { response: cleaned };
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                //@ts-ignore
                return { response: rawContent }; // Return the raw text content instead of error
            }
        } catch (error) {
            console.error('AnthropicProvider process error:', error);
            //@ts-ignore
            return { error: error instanceof Error ? error.message : String(error), response: null };
        }
    }
}