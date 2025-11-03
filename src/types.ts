export type { PromptContext, ProviderSelection } from "./plugin.js";
import type { ProgressDisplayOptions } from "./core/execution/progress-display.js";

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
	cost?: number;
	cached?: boolean;
	skipped?: boolean;
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
	byProvider: Record<
		string,
		{
			cost: number;
			tokens: TokenUsage;
			models: string[];
		}
	>;
	currency: "USD";
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Progress update - all progress information in one object
 */
export interface ProgressUpdate {
	completed: number;
	total: number;
	percent: number;
	cost: number;
	estimatedCost: number;
	elapsedSeconds: number;
	etaSeconds: number;
	currentDimension: string;
	currentSection: number;
	dimensions: {
		[dimension: string]: {
			completed: number;
			total: number;
			percent: number;
			cost: number;
			estimatedCost: number;
			failed: number;
			etaSeconds: number;
		};
	};
}

// ============================================================================
// CONTEXT TYPES - Base
// ============================================================================

export interface BaseContext {
	processId: string;
	timestamp: number;
}

// ============================================================================
// PROCESS-LEVEL CONTEXTS
// ============================================================================

export interface BeforeProcessStartContext extends BaseContext {
	sections: SectionData[];
	options: ProcessOptions;
}

export interface ProcessContext extends BaseContext {
	sections: SectionData[];
	options: ProcessOptions;
	metadata?: unknown;
}

export interface ProcessStartResult {
	sections?: SectionData[];
	metadata?: unknown;
}

export interface ProcessResultContext extends ProcessContext {
	result: ProcessResult;
	duration: number;
	totalDimensions: number;
	successfulDimensions: number;
	failedDimensions: number;
}

export interface ProcessFailureContext extends ProcessContext {
	error: Error;
	partialResults: Partial<ProcessResult>;
	duration: number;
}

// ============================================================================
// DIMENSION-LEVEL CONTEXTS
// ============================================================================

export interface DimensionContext extends BaseContext {
	dimension: string;
	isGlobal: boolean;
	sections: SectionData[];
	dependencies: DimensionDependencies;
	globalResults: Record<string, DimensionResult>;
}

export interface SectionDimensionContext extends DimensionContext {
	section: SectionData;
	sectionIndex: number;
}

// ============================================================================
// PROVIDER CONTEXTS
// ============================================================================

export interface ProviderContext extends DimensionContext {
	request: ProviderRequest;
	provider: string;
	providerOptions: Record<string, unknown>;
}

export type BeforeProviderExecuteContext = ProviderContext;

export interface ProviderResultContext extends ProviderContext {
	result: ProviderResponse;
	duration: number;
	tokensUsed?: TokenUsage;
}

export type AfterProviderExecuteContext = ProviderResultContext;

// ============================================================================
// RESULT CONTEXTS
// ============================================================================

export interface DimensionResultContext extends BaseContext {
	dimension: string;
	isGlobal: boolean;
	sections: SectionData[];
	dependencies: DimensionDependencies;
	globalResults: Record<string, DimensionResult>;
	section?: SectionData;
	sectionIndex?: number;
	result: DimensionResult;
	duration: number;
	provider: string;
	model?: string;
	tokensUsed?: TokenUsage;
	cost?: number;
}

export interface TransformSectionsContext extends ProviderResultContext {
	currentSections: SectionData[];
}

export interface FinalizeContext extends BaseContext {
	results: Record<string, DimensionResult>;
	originalSections: SectionData[];
	currentSections: SectionData[];
	globalResults: Record<string, DimensionResult>;
	duration: number;
}

// ============================================================================
// RETRY & FALLBACK CONTEXTS
// ============================================================================

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

export interface RetryResponse {
	shouldRetry?: boolean;
	delayMs?: number;
	modifiedRequest?: ProviderRequest;
	modifiedProvider?: string;
}

export interface FallbackContext extends RetryContext {
	failedProvider: string;
	fallbackProvider: string;
	fallbackOptions: Record<string, unknown>;
}

export interface FallbackResponse {
	shouldFallback?: boolean;
	delayMs?: number;
	modifiedRequest?: ProviderRequest;
}

export interface FailureContext extends RetryContext {
	totalAttempts: number;
	providers: string[];
}

// ============================================================================
// SKIP RESULT TYPES
// ============================================================================

export interface SkipWithResult {
	skip: true;
	result: DimensionResult;
}

// ============================================================================
// PROCESS OPTIONS & RESULTS
// ============================================================================

export interface CoreProcessOptions {
	processId?: string;
	metadata?: unknown;
}

export interface ProcessCallbacks {
	onDimensionStart?: (dimension: string) => void;
	onDimensionComplete?: (dimension: string, result: DimensionResult) => void;
	onSectionStart?: (index: number, total: number) => void;
	onSectionComplete?: (index: number, total: number) => void;
	onError?: (context: string, error: Error) => void;
}

export interface ProcessOptions extends CoreProcessOptions, ProcessCallbacks {
	onProgress?: (progress: ProgressUpdate) => void;
	updateEvery?: number;
	progressDisplay?: ProgressDisplayOptions | boolean;
	[key: string]: unknown;
}

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

export interface ProviderResponse<T = unknown> {
	data?: T;
	error?: string;
	metadata?: ProviderMetadata;
}

// ============================================================================
// RE-EXPORT PROGRESS DISPLAY OPTIONS
// ============================================================================

export type { ProgressDisplayOptions };

/**
 * Context for afterProcessComplete hook
 * @deprecated Use ProcessResultContext instead
 */
export type AfterProcessCompleteContext = ProcessResultContext;
