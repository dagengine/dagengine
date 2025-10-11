/**
 * @ivan629/dag-ai
 * AI-powered DAG engine for multi-dimensional data analysis
 *
 * @version 1.0.0
 * @license MIT
 */

// ============================================================================
// MAIN ENGINE
// ============================================================================

export { DagEngine } from './engine';
export type { EngineConfig, ProcessOptions, ProcessResult } from './engine';

// ============================================================================
// PLUGIN SYSTEM
// ============================================================================

export { Plugin } from './plugin';
export type { PluginConfig, PromptContext, ProviderSelection } from './plugin';

// ============================================================================
// CORE TYPES
// ============================================================================

export type {
  SectionData,
  DimensionResult,
  DimensionDependencies,
  DimensionConfig,
  Dimension,
} from './types';

// ============================================================================
// PROVIDER ADAPTER (Main Provider Interface)
// ============================================================================

export { ProviderAdapter, createProviderAdapter } from './providers/adapter';
export type { ProviderAdapterConfig } from './providers/adapter';

// ============================================================================
// PROVIDER REGISTRY (Advanced Usage)
// ============================================================================

export { ProviderRegistry } from './providers/registry';

// ============================================================================
// PROVIDER BASE TYPES
// ============================================================================

export { BaseProvider } from './providers/types';
export type { ProviderConfig, ProviderRequest, ProviderResponse } from './providers/types';

// ============================================================================
// AI PROVIDERS
// ============================================================================

export { AnthropicProvider } from './providers/ai/anthropic';
export { OpenAIProvider } from './providers/ai/openai';
export { GeminiProvider } from './providers/ai/gemini';

// ============================================================================
// SEARCH PROVIDERS
// ============================================================================

export { TavilyProvider } from './providers/search/tavily';
export type { TavilyResult } from './providers/search/tavily';

// ============================================================================
// DATA PROVIDERS
// ============================================================================

export { WhoisXMLProvider } from './providers/data/whoisxml';
export type { WhoisData } from './providers/data/whoisxml';

// ============================================================================
// UTILITIES
// ============================================================================

export { parseJSON } from './utils';

export type {
  TokenUsage,
  ProviderMetadata,
  ModelPricing,
  PricingConfig,
  DimensionCost,
  CostSummary,
} from './types';
