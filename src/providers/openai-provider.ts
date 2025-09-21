import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';

export class OpenAIProvider extends BaseAIProvider {
    private readonly apiKey: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.name = "openai";
        this.apiKey = config.apiKey || "";
    }

    async process(
        prompt: string,
        options: ProcessOptions = {},
    ): Promise<AIResponse> {
        const model = options.model || "gpt-4o";
        const temperature = options.temperature ?? 0.1;
        const maxTokens = options.maxTokens || 4000;

        const response = await globalThis.fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: prompt }],
                    temperature,
                    max_tokens: maxTokens,
                }),
            },
        );

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = (await response.json()) as {
            choices: Array<{ message: { content: string } }>;
        };

        const content = data.choices[0]?.message?.content || "";

        // Try to parse as JSON, fallback to text
        try {
            return JSON.parse(content) as AIResponse;
        } catch {
            return { text: content };
        }
    }
}