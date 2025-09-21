import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';

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
        const model = options.model || "claude-3-5-sonnet-20240620";
        const temperature = options.temperature ?? 0.1;
        const maxTokens = options.maxTokens || 4000;

        const response = await globalThis.fetch(
            "https://api.anthropic.com/v1/messages",
            {
                method: "POST",
                headers: {
                    "x-api-key": this.apiKey,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    temperature,
                    messages: [{ role: "user", content: prompt }],
                }),
            },
        );

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = (await response.json()) as {
            content: Array<{ text: string }>;
        };

        const content = data.content[0]?.text || "";

        // Try to parse as JSON, fallback to text
        try {
            return JSON.parse(content) as AIResponse;
        } catch {
            return { text: content };
        }
    }
}