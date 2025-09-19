export interface AIProviderConfig {
  apiKey?: string;
  [key: string]: unknown;
}

export interface AIAdapterConfig {
  openai?: AIProviderConfig;
  anthropic?: AIProviderConfig;
  gemini?: AIProviderConfig;
  serpapi?: AIProviderConfig;
}

export interface ProcessOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  dimension?: string;
  sectionIndex?: number;
  [key: string]: unknown;
}

export interface AIResponse {
  text?: string;
  [key: string]: unknown;
}

export class AIAdapter {
  private readonly config: AIAdapterConfig;
  private readonly providers: Map<string, BaseAIProvider>;

  constructor(config: AIAdapterConfig = {}) {
    this.config = config;
    this.providers = new Map();

    // Initialize built-in providers
    this.initializeProviders();
  }

  async process(
    prompt: string,
    options: ProcessOptions = {},
  ): Promise<AIResponse> {
    const provider = this.getProvider(options.provider);

    if (!provider) {
      throw new Error(`AI provider not available: ${options.provider}`);
    }

    return provider.process(prompt, options);
  }

  private initializeProviders(): void {
    // OpenAI Provider
    if (this.config.openai?.apiKey) {
      this.providers.set(
        "openai",
        new OpenAIProvider({
          apiKey: this.config.openai.apiKey,
          ...this.config.openai,
        }),
      );
    }

    // Anthropic Provider
    if (this.config.anthropic?.apiKey) {
      this.providers.set(
        "anthropic",
        new AnthropicProvider({
          apiKey: this.config.anthropic.apiKey,
          ...this.config.anthropic,
        }),
      );
    }

    // Gemini Provider
    if (this.config.gemini?.apiKey) {
      this.providers.set(
        "gemini",
        new GeminiProvider({
          apiKey: this.config.gemini.apiKey,
          ...this.config.gemini,
        }),
      );
    }

    // SerpApi Provider
    if (this.config.serpapi?.apiKey) {
      this.providers.set(
          "serpapi",
          new SerpApiProvider({
            apiKey: this.config.serpapi.apiKey,
            ...this.config.serpapi,
          }),
      );
    }
  }

  private getProvider(provider?: string): BaseAIProvider | undefined {
    return this.providers.get(provider || "");
  }
}

abstract class BaseAIProvider {
  protected readonly config: AIProviderConfig;
  public name: string;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.name = "base";
  }

  abstract process(
    prompt: string,
    options: ProcessOptions,
  ): Promise<AIResponse>;
}


interface SearchResult {
  query: string;
  success: boolean;
  data?: any;
  error?: string;
  resultCount?: number;
  timestamp: string;
}

interface BatchSearchSummary {
  total: number;
  successful: number;
  failed: number;
  totalResults: number;
  executionTimeMs: number;
}

interface SerpApiResponse extends AIResponse {
  raw: {
    batch_id: string;
    queries: string[];
    results: SearchResult[];
    summary: BatchSearchSummary;
  };
  engine: string;
  type: "batch_search";
}

class SerpApiProvider extends BaseAIProvider {
  private readonly apiKey: string;

  constructor(config: AIProviderConfig) {
    super(config);
    this.name = "serpapi";
    this.apiKey = config.apiKey || "";
  }

  async process(
      prompt: string,
      options: ProcessOptions = {},
  ): Promise<SerpApiResponse> {
    let queries: string[];

    try {
      const parsed: unknown = JSON.parse(prompt);

      if (!Array.isArray(parsed)) {
        throw new Error("SerpApi requires an array of search queries");
      }

      if (parsed.length === 0) {
        throw new Error("SerpApi requires at least one search query");
      }

      // Type guard to ensure all elements are strings
      if (!this.isStringArray(parsed)) {
        throw new Error("All search queries must be non-empty strings");
      }

      queries = parsed;

    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
      throw new Error(`SerpApi requires valid JSON array of queries: ${errorMessage}`);
    }

    return await this.executeBatchSearch(queries, options);
  }

  private isStringArray(value: unknown[]): value is string[] {
    return value.every((item): item is string =>
        typeof item === 'string' && item.trim().length > 0
    );
  }

  private async executeBatchSearch(
      queries: string[],
      options: ProcessOptions,
  ): Promise<SerpApiResponse> {
    const engine: string = options.model as string || "google";
    const num: number = (options.numResults as number) || 10;
    const delay: number = (options.searchDelay as number) || 500;

    const results: SearchResult[] = [];
    const startTime: number = Date.now();

    for (let i = 0; i < queries.length; i++) {
      // @ts-ignore
      const query: string = queries[i].trim();

      try {
        const searchData = await this.executeSearch(query, engine, num);

        results.push({
          query,
          success: true,
          data: searchData,
          resultCount: searchData.organic_results?.length || 0,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          query,
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString()
        });
      }

      // Add delay between requests (except for last one)
      if (i < queries.length - 1) {
        await this.delay(delay);
      }
    }

    const executionTime: number = Date.now() - startTime;
    const successful: SearchResult[] = results.filter(r => r.success);
    const failed: SearchResult[] = results.filter(r => !r.success);

    const summary: BatchSearchSummary = {
      total: queries.length,
      successful: successful.length,
      failed: failed.length,
      totalResults: successful.reduce((sum, r) => sum + (r.resultCount || 0), 0),
      executionTimeMs: executionTime
    };

    return {
      text: JSON.stringify(results, null, 2),
      raw: {
        batch_id: `serpapi_${Date.now()}`,
        queries,
        results,
        summary
      },
      engine,
      type: "batch_search"
    };
  }

  private async executeSearch(
      query: string,
      engine: string,
      num: number
  ): Promise<any> {
    const params = new URLSearchParams({
      engine,
      q: query,
      api_key: this.apiKey,
      num: String(num),
    });

    const response = await globalThis.fetch(
        `https://serpapi.com/search.json?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }
}

class OpenAIProvider extends BaseAIProvider {
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

class AnthropicProvider extends BaseAIProvider {
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

class GeminiProvider extends BaseAIProvider {
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
      return JSON.parse(content) as AIResponse;
    } catch {
      return { text: content };
    }
  }
}
