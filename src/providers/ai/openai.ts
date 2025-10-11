import { parseJSON } from '../../utils'
import { BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse } from '../types'

export class OpenAIProvider extends BaseProvider {
    private readonly apiKey: string;

    constructor(config: ProviderConfig) {
        super('openai', 'ai', config);

        if (!config.apiKey) {
            throw new Error('OpenAI API key is required');
        }

        this.apiKey = config.apiKey;
    }

    async execute(request: ProviderRequest): Promise<ProviderResponse> {
        try {
            const model = (request.options?.model as string) || 'gpt-4o';
            const maxTokens = (request.options?.maxTokens as number) || 4096;
            const temperature = (request.options?.temperature as number) ?? 0.1;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    temperature,
                    messages: [{ role: 'user', content: request.input }],
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API error (${response.status}): ${error}`);
            }

            const data = await response.json() as {
                choices: Array<{ message: { content: string } }>;
            };

            const content = data.choices[0]?.message?.content || '';

            return {
                data: parseJSON(content),
                metadata: { model, tokens: maxTokens }
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
