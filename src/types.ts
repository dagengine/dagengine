export interface SectionData {
  content: string;
  metadata: Record<string, unknown>;
}

export interface DimensionResult<T = unknown> {
  data?: T;
  error?: string;
  metadata?: ProviderMetadata;
}

export interface DimensionDependencies {
  [dimensionName: string]: DimensionResult;
}

export interface DimensionConfig {
  name: string;
  scope: 'section' | 'global';
  transform?: (result: DimensionResult, sections: SectionData[]) => SectionData[];
}

export type Dimension = string | DimensionConfig;

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export interface PricingConfig {
  models: Record<string, ModelPricing>;
  lastUpdated?: string;  // Optional metadata
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ProviderMetadata {
  model?: string;
  tokens?: TokenUsage;
  provider?: string;
  [key: string]: unknown;
}

export interface DimensionCost {
  cost: number;
  tokens: TokenUsage;
  model: string;
  provider: string;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  byDimension: Record<string, DimensionCost>;
  byProvider: Record<string, {
    cost: number;
    tokens: TokenUsage;
    models: string[];
  }>;
  currency: 'USD';
}