export interface ProviderConfig {
  apiKey?: string;
  [key: string]: unknown;
}

export interface ProviderRequest {
  input: string | string[];
  options?: Record<string, unknown>;
}

export interface ProviderResponse<T = unknown> {
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseProvider {
  protected readonly config: ProviderConfig;
  public readonly name: string;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = config;
  }

  abstract execute(request: ProviderRequest): Promise<ProviderResponse>;
}
