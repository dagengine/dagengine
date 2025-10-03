// Main Engine
export { DagEngine } from "./engine";
export type {
  DagEngineConfig,
  ProcessingOptions as EngineProcessingOptions,
  SectionResult,
  ProcessingResult,
} from "./engine";

// Provider System
export { ProviderAdapter } from "./providers/provider-adapter";
export type {
  ProviderAdapterConfig,
  ProviderName
} from "./providers/provider-adapter";

// Base Provider and Response Types
export {
  BaseProvider,
  type ProviderConfig,
  type ProviderResponse,
  type BaseProviderDimensionOptions
} from "./providers/base-provider";

// Individual Providers with Constants
export {
  OpenAIProvider,
  OPENAI_DEFAULTS,
  type OpenAIConfig
} from "./providers/openai-provider";

export {
  AnthropicProvider,
  ANTHROPIC_DEFAULTS,
  type AnthropicConfig
} from "./providers/anthropic-provider";

export {
  GeminiProvider,
  GEMINI_DEFAULTS,
  type GeminiConfig
} from "./providers/gemini-provider";

export {
  TavilyProvider,
  TAVILY_DEFAULTS,
  type TavilyConfig,
  type TavilySearchConfig,
  type TavilyResult,
  type TavilySearchResponse
} from "./providers/tavily-provider";

// Base Plugin System
export { BasePlugin } from "./base-plugin";
export type {
  PluginConfig,
  DimensionSpecConfig,
  DimensionSpec,
  SectionData,
  DimensionResult,
  DependencyOutputs
} from "./base-plugin";

// Utilities
export { retry } from "./utils";
export type { RetryOptions } from "./utils";

// Constants
export {
  MAX_RETRIES,
  BASE_DELAY_BETWEEN_RETRIES,
  MAX_DELAY_BETWEEN_RETRIES,
  MAX_RATE_LIMIT_WAIT,
  RATE_LIMIT_KEYWORDS
} from "./const";