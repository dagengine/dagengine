export interface AIProviderConfig {
  apiKey?: string;
  [key: string]: unknown;
}

export interface AIAdapterConfig {
  openai?: AIProviderConfig;
  anthropic?: AIProviderConfig;
  gemini?: AIProviderConfig;
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
