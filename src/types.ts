export type{ PromptContext, ProviderSelection } from './plugin';

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

export interface DimensionConfig {
	name: string;
	scope: "section" | "global";
	transform?: (
		result: DimensionResult,
		sections: SectionData[],
	) => SectionData[] | Promise<SectionData[]>;
}

export type Dimension = string | DimensionConfig;

export interface ModelPricing {
	inputPer1M: number;
	outputPer1M: number;
}

export interface PricingConfig {
	models: Record<string, ModelPricing>;
	lastUpdated?: string;
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
	byProvider: Record<string,{
	cost: number;
	tokens: TokenUsage;
	models: string[];
}
>;
currency: "USD";
}

// ============================================================================
// CONTEXT TYPES - Base
// ============================================================================

/**
 * Base context present in all hooks
 */
export interface BaseContext {
	processId: string;
	timestamp: number;
}

// ============================================================================
// PROCESS-LEVEL CONTEXTS
// ============================================================================

/**
 * Process-level context (start of process)
 */
export interface ProcessContext extends BaseContext {
	sections: SectionData[];
	options: ProcessOptions;
	metadata?: unknown;
}

/**
 * Result from beforeProcessStart hook
 */
export interface ProcessStartResult {
	sections?: SectionData[];
	metadata?: unknown;
}

/**
 * Context after process completes
 */
export interface ProcessResultContext extends ProcessContext {
	result: ProcessResult;
	duration: number;
	totalDimensions: number;
	successfulDimensions: number;
	failedDimensions: number;
}

/**
 * Context when process fails
 */
export interface ProcessFailureContext extends ProcessContext {
	error: Error;
	partialResults: Partial<ProcessResult>;
	duration: number;
}

// ============================================================================
// DIMENSION-LEVEL CONTEXTS
// ============================================================================

/**
 * Dimension-level context (base for dimension execution)
 */
export interface DimensionContext extends BaseContext {
	dimension: string;
	isGlobal: boolean;
	sections: SectionData[];
	dependencies: DimensionDependencies;
	globalResults: Record<string, DimensionResult>;
}

/**
 * Section dimension context (includes section info)
 */
export interface SectionDimensionContext extends DimensionContext {
	section: SectionData;
	sectionIndex: number;
}

// ============================================================================
// PROVIDER CONTEXTS
// ============================================================================

/**
 * Context during provider execution (base)
 */
export interface ProviderContext extends DimensionContext {
	request: ProviderRequest;
	provider: string;
	providerOptions: Record<string, unknown>;
}

/**
 * Context before provider execution
 */
export interface BeforeProviderExecuteContext extends ProviderContext {}

/**
 * Context after provider execution (with result)
 */
export interface ProviderResultContext extends ProviderContext {
	result: ProviderResponse;
	duration: number;
	tokensUsed?: TokenUsage;
}

/**
 * Alias for backward compatibility
 * @deprecated Use ProviderResultContext instead
 */
export interface AfterProviderExecuteContext extends ProviderResultContext {}

// ============================================================================
// RESULT CONTEXTS
// ============================================================================

/**
 * Context after dimension execution
 */
export interface DimensionResultContext extends ProviderResultContext {}

/**
 * Context for section transformation
 */
export interface TransformSectionsContext extends ProviderResultContext {
	currentSections: SectionData[];
}

/**
 * Context for final result processing
 */
export interface FinalizeContext extends BaseContext {
	results: Record<string, DimensionResult>;
	sections: SectionData[];
	globalResults: Record<string, DimensionResult>;
	transformedSections: SectionData[];
	duration: number;
}

// ============================================================================
// RETRY & FALLBACK CONTEXTS
// ============================================================================

/**
 * Context during retry attempts
 */
export interface RetryContext extends ProviderContext {
	error: Error;
	attempt: number;
	maxAttempts: number;
	previousAttempts: Array<{
		attempt: number;
		error: Error;
		provider: string;
		timestamp: number;
	}>;
}

/**
 * Response from retry handler
 */
export interface RetryResponse {
	shouldRetry?: boolean;
	delayMs?: number;
	modifiedRequest?: ProviderRequest;
	modifiedProvider?: string;
}

/**
 * Context during provider fallback
 */
export interface FallbackContext extends RetryContext {
	failedProvider: string;
	fallbackProvider: string;
	fallbackOptions: Record<string, unknown>;
}

/**
 * Response from fallback handler
 */
export interface FallbackResponse {
	shouldFallback?: boolean;
	delayMs?: number;
	modifiedRequest?: ProviderRequest;
}

/**
 * Context when dimension fails completely
 */
export interface FailureContext extends RetryContext {
	totalAttempts: number;
	providers: string[];
}

// ============================================================================
// SKIP RESULT TYPES
// ============================================================================

/**
 * Skip result with cached data
 */
export interface SkipWithResult {
	skip: true;
	result: DimensionResult;
}

// ============================================================================
// PROCESS OPTIONS & RESULTS
// ============================================================================

/**
 * Core process options (required/known options)
 */
export interface CoreProcessOptions {
	/**
	 * Unique process identifier
	 * If not provided, a UUID will be generated
	 */
	processId?: string;

	/**
	 * Custom metadata to pass through the process
	 */
	metadata?: unknown;
}

/**
 * Process lifecycle callbacks
 */
export interface ProcessCallbacks {
	/**
	 * Called when a dimension starts processing
	 */
	onDimensionStart?: (dimension: string) => void;

	/**
	 * Called when a dimension completes
	 */
	onDimensionComplete?: (dimension: string, result: DimensionResult) => void;

	/**
	 * Called when section processing starts
	 */
	onSectionStart?: (index: number, total: number) => void;

	/**
	 * Called when section processing completes
	 */
	onSectionComplete?: (index: number, total: number) => void;

	/**
	 * Called when an error occurs
	 */
	onError?: (context: string, error: Error) => void;
}

/**
 * Complete process options
 */
export interface ProcessOptions extends CoreProcessOptions, ProcessCallbacks {
	[key: string]: unknown;
}

/**
 * Process result
 */
export interface ProcessResult {
	sections: Array<{
		section: SectionData;
		results: Record<string, DimensionResult>;
	}>;
	globalResults: Record<string, DimensionResult>;
	transformedSections: SectionData[];
	costs?: CostSummary;
	metadata?: unknown;
}

// ============================================================================
// PROVIDER REQUEST & RESPONSE
// ============================================================================

/**
 * Provider request
 */
export interface ProviderRequest {
	input: string | string[];
	options?: Record<string, unknown>;
	dimension?: string;
	isGlobal?: boolean;
	metadata?: {
		sectionIndex?: number;
		totalSections?: number;
		[key: string]: unknown;
	};
}

/**
 * Provider response
 */
export interface ProviderResponse<T = unknown> {
	data?: T;
	error?: string;
	metadata?: ProviderMetadata;
}

// ============================================================================
// DEPRECATED ALIASES (for backward compatibility)
// ============================================================================

/**
 * Context for beforeProcessStart hook
 * @deprecated Use ProcessContext instead
 */
export interface BeforeProcessStartContext extends ProcessContext {}

/**
 * Context for afterProcessComplete hook
 * @deprecated Use ProcessResultContext instead
 */
export interface AfterProcessCompleteContext extends ProcessResultContext {}