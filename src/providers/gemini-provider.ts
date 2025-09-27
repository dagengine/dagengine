import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';

export class GeminiProvider extends BaseAIProvider {
    private readonly apiKey: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.name = "gemini";
        this.apiKey = config.apiKey || "";
    }

    async process(
        prompt: string,
        options: ProcessOptions = {},
    ): Promise<AIResponse> {
        const model = options.model || "gemini-1.5-pro";
        const temperature = options.temperature ?? 0.1;

        const response = await globalThis.fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature,
                        maxOutputTokens: options.maxTokens || 4000,
                    },
                }),
            },
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = (await response.json()) as {
            candidates: Array<{
                content: { parts: Array<{ text: string }> };
            }>;
        };

        const content = data.candidates[0]?.content?.parts[0]?.text || "";

        // Try to parse as JSON, fallback to text
        try {
            return { response: JSON.parse(content) };
        } catch {
            return { error: content };
        }
    }
}