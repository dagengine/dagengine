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
        try {
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
                const errorText = await response.text();
                console.error(`Anthropic API error: ${response.status} - ${errorText}`);
                throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
            }

            const data = (await response.json()) as {
                content: Array<{ text: string }>;
            };

            const rawContent = data.content[0]?.text || "";

            const cleaned = rawContent
                .replace(/```(json)?/g, "")
                .replace(/,\s*}/g, "}")
                .replace(/,\s*]/g, "]")
                .trim();


            // Try to parse as JSON, fallback to text
            try {
                return { response: JSON.parse(cleaned) };
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                //@ts-ignore
                return { response: content }; // Return the raw text content instead of error
            }
        } catch (error) {
            console.error('AnthropicProvider process error:', error);
            //@ts-ignore
            return { error: error instanceof Error ? error.message : String(error), response: null };
        }
    }
}