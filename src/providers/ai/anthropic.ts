import { BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse } from '../types';
import { parseJSON } from '../../utils';

export class AnthropicProvider extends BaseProvider {
  private readonly apiKey: string;

  constructor(config: ProviderConfig) {
    super('anthropic', config);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.apiKey = config.apiKey;
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      const model = (request.options?.model as string) || 'claude-sonnet-4-5-20250929';
      const maxTokens = (request.options?.maxTokens as number) || 4096;
      const temperature = request.options?.temperature as number | undefined;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: request.input }],
          ...(temperature !== undefined && { temperature }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as {
        content: Array<{ text: string }>;
        usage?: {
          input_tokens: number;
          output_tokens: number;
        };
        model?: string;
      };

      const content = data.content[0]?.text || '';

      return {
        data: parseJSON(content),
        metadata: {
          model: data.model || model,
          provider: 'anthropic',
          ...(data.usage && {
            tokens: {
              inputTokens: data.usage.input_tokens,
              outputTokens: data.usage.output_tokens,
              totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          }),
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
