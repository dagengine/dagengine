import { BaseProvider, ProviderConfig, ProviderRequest, ProviderResponse } from '../types';
import { parseJSON } from '../../utils';

export class GeminiProvider extends BaseProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super('gemini', config);

    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl as string) || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      if (Array.isArray(request.input)) {
        throw new Error(
          'Gemini provider does not support batch inputs. Process queries one at a time.'
        );
      }

      const model = (request.options?.model as string) || 'gemini-1.5-pro';
      const temperature = (request.options?.temperature as number) ?? 0.1;
      const maxTokens = (request.options?.maxTokens as number) || 4096;
      const topP = request.options?.topP as number | undefined;
      const topK = request.options?.topK as number | undefined;

      // Build generation config
      const generationConfig: Record<string, unknown> = {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json', // Force JSON response
      };

      if (topP !== undefined) generationConfig.topP = topP;
      if (topK !== undefined) generationConfig.topK = topK;

      // Build request body
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: request.input,
              },
            ],
          },
        ],
        generationConfig,
      };

      // Make API request
      const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as GeminiResponse;

      // Handle safety ratings (content blocked)
      if (!data.candidates || data.candidates.length === 0) {
        if (data.promptFeedback?.blockReason) {
          throw new Error(`Content blocked by Gemini: ${data.promptFeedback.blockReason}`);
        }
        throw new Error('Gemini returned no candidates');
      }

      const candidate = data.candidates[0];

      // Check finish reason
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        console.warn(`Gemini finish reason: ${candidate.finishReason}`);

        if (candidate.finishReason === 'SAFETY') {
          throw new Error('Content blocked by Gemini safety filters');
        }

        if (candidate.finishReason === 'MAX_TOKENS') {
          console.warn('Response truncated due to max tokens limit');
        }
      }

      // Extract text content
      const content = candidate?.content?.parts?.[0]?.text || '';

      if (!content) {
        throw new Error('Gemini returned empty content');
      }

      // Parse JSON response
      const parsedData = parseJSON(content);

      return {
        data: parsedData,
        metadata: {
          model,
          provider: 'gemini',
          ...(data.usageMetadata && {
            tokens: {
              inputTokens: data.usageMetadata.promptTokenCount,
              outputTokens: data.usageMetadata.candidatesTokenCount,
              totalTokens: data.usageMetadata.totalTokenCount,
            }
          }),
          finishReason: candidate?.finishReason,
          safetyRatings: candidate?.safetyRatings,
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Gemini API Response Types
 */
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: SafetyRating[];
  };
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiCandidate {
  content?: {
    parts: Array<{
      text: string;
    }>;
    role: string;
  };
  finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  safetyRatings?: SafetyRating[];
  citationMetadata?: {
    citationSources: Array<{
      startIndex: number;
      endIndex: number;
      uri: string;
      license: string;
    }>;
  };
}

interface SafetyRating {
  category: string;
  probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
  blocked?: boolean;
}
