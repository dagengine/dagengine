/**
 * @dagengine/dag-engine
 * AI-powered DAG engine for multi-dimensional data analysis
 *
 * @version 1.0.0
 * @license MIT
 */

// ============================================================================
// MAIN ENGINE
// ============================================================================

export { DagEngine } from "./core/engine/dag-engine.js";

// ============================================================================
// PLUGIN SYSTEM
// ============================================================================

export { Plugin } from "./plugin";
export type { PluginConfig, PromptContext, ProviderSelection } from "./plugin";

// ============================================================================
// CORE TYPES
// ============================================================================

export type {
	SectionData,
	DimensionResult,
	DimensionDependencies,
	DimensionConfig,
	Dimension,
	ProcessResult,
	ProcessOptions,
} from "./types";

// ============================================================================
// PROVIDER ADAPTER (Main Provider Interface)
// ============================================================================

export { ProviderAdapter, createProviderAdapter } from "./providers/adapter";
export type { ProviderAdapterConfig } from "./providers/adapter";

// ============================================================================
// PROVIDER REGISTRY (Advanced Usage)
// ============================================================================

export { ProviderRegistry } from "./providers/registry";

// ============================================================================
// PROVIDER BASE TYPES
// ============================================================================

export { BaseProvider } from "./providers/types";
export type {
	ProviderConfig,
	ProviderRequest,
	ProviderResponse,
} from "./providers/types";

// ============================================================================
// AI PROVIDERS
// ============================================================================

export { AnthropicProvider } from "./providers/ai/anthropic";
export { OpenAIProvider } from "./providers/ai/openai";
export { GeminiProvider } from "./providers/ai/gemini";

// ============================================================================
// SEARCH PROVIDERS
// ============================================================================

export { TavilyProvider } from "./providers/search/tavily";
export type { TavilyResult } from "./providers/search/tavily";

// ============================================================================
// DATA PROVIDERS
// ============================================================================

export { WhoisXMLProvider } from "./providers/data/whoisxml";
export type { WhoisData } from "./providers/data/whoisxml";

// ============================================================================
// INTERNAL CLASSES (Advanced Usage - For Testing & Custom Implementations)
// ============================================================================

export { HookExecutor } from "./core/lifecycle/hook-executor.js";
export { ProviderExecutor } from "./core/execution/provider-executor.js";
export { DependencyGraphManager } from "./core/analysis/graph-manager.js";
export { CostCalculator } from "./core/analysis/cost-calculator.js";

// ============================================================================
// UTILITIES
// ============================================================================

export { parseJSON } from "./utils";

// ============================================================================
// PRICING & COST TYPES
// ============================================================================

export type {
	TokenUsage,
	ProviderMetadata,
	ModelPricing,
	PricingConfig,
	DimensionCost,
	CostSummary,
} from "./types";

// ============================================================================
// HOOK CONTEXT TYPES (For Custom Plugin Development)
// ============================================================================

export type {
	BaseContext,
	ProcessContext,
	ProcessStartResult,
	ProcessResultContext,
	ProcessFailureContext,
	DimensionContext,
	SectionDimensionContext,
	ProviderContext,
	DimensionResultContext,
	ProviderResultContext,
	TransformSectionsContext,
	FinalizeContext,
	RetryContext,
	RetryResponse,
	FallbackContext,
	FallbackResponse,
	FailureContext,
	SkipWithResult,
	BeforeProcessStartContext,
	AfterProcessCompleteContext,
	BeforeProviderExecuteContext,
	AfterProviderExecuteContext,
} from "./types";
