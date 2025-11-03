import type {
	SectionData,
	DimensionResult,
	DimensionDependencies,
	Dimension,
	DimensionConfig,
	ProcessContext,
	ProcessStartResult,
	ProcessResultContext,
	ProcessFailureContext,
	ProcessResult,
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
	ProviderRequest,
	ProviderResponse,
	SkipWithResult,
	BeforeProcessStartContext,
} from "./types";

export interface PluginConfig {
	[key: string]: unknown;
}

export interface PromptContext {
	sections: SectionData[];
	dimension: string;
	dependencies: DimensionDependencies;
	isGlobal: boolean;
}

export interface ProviderSelection {
	provider: string;
	options: Record<string, unknown>;
	fallbacks?: Array<{
		provider: string;
		options: Record<string, unknown>;
		retryAfter?: number;
	}>;
}

export abstract class Plugin {
	public readonly id: string;
	public name: string;
	public readonly description: string;
	public dimensions: Dimension[];
	protected readonly config: PluginConfig;

	constructor(
		id: string,
		name: string,
		description: string,
		config: PluginConfig = {},
	) {
		this.id = id;
		this.name = name;
		this.description = description;
		this.config = config;
		this.dimensions = [];
	}

	getDimensionNames(): string[] {
		return this.dimensions.map((d) => (typeof d === "string" ? d : d.name));
	}

	getDimensionConfig(name: string): DimensionConfig {
		const dim = this.dimensions.find(
			(d) => (typeof d === "string" ? d : d.name) === name,
		);

		if (!dim) {
			throw new Error(`Dimension "${name}" not found in plugin "${this.id}"`);
		}

		return typeof dim === "string" ? { name, scope: "section" } : dim;
	}

	isGlobalDimension(name: string): boolean {
		return this.getDimensionConfig(name).scope === "global";
	}

	/**
	 * Build prompt for each dimension (REQUIRED)
	 *
	 * @param context - Prompt context with sections, dimension, dependencies
	 * @returns Prompt string to send to provider
	 */
	abstract createPrompt(context: PromptContext): string | Promise<string>;

	/**
	 * Select provider for each dimension (REQUIRED)
	 *
	 * @param dimension - Dimension name
	 * @param sections - Sections to process (1 for section dims, all for global dims)
	 * @param context - Execution context
	 * @returns Provider selection with options and fallbacks
	 */
	abstract selectProvider(
		dimension: string,
		sections?: SectionData[],
		context?: {
			isGlobal: boolean;
			sectionIndex?: number; // Only present for section dimensions
			totalSections?: number; // Total number of sections in process
		},
	): ProviderSelection | Promise<ProviderSelection>;

	/**
	 * Define dimension dependencies (optional)
	 * Called once at process start
	 *
	 * @param context - Process context with sections and options
	 * @returns Dependency graph mapping dimensions to their dependencies
	 */
	defineDependencies?(
		context: ProcessContext,
	): Record<string, string[]> | Promise<Record<string, string[]>>;

	/**
	 * Decide if section dimension should skip (optional)
	 * Can return boolean or cached result
	 *
	 * @param context - Section dimension context with all data
	 * @returns true to skip, false to execute, or {skip: true, result: cached}
	 */
	shouldSkipSectionDimension?(
		context: SectionDimensionContext,
	): boolean | SkipWithResult | Promise<boolean | SkipWithResult>;

	/**
	 * Decide if global dimension should skip (optional)
	 * Can return boolean or cached result
	 *
	 * @param context - Dimension context with all data
	 * @returns true to skip, false to execute, or {skip: true, result: cached}
	 */
	shouldSkipGlobalDimension?(
		context: DimensionContext,
	): boolean | SkipWithResult | Promise<boolean | SkipWithResult>;

	/**
	 * Transform dependencies before use (optional)
	 * Called after dependencies are resolved, before prompt creation
	 *
	 * @param context - Dimension context with dependencies
	 * @returns Modified dependencies
	 */
	transformDependencies?(
		context: DimensionContext,
	): DimensionDependencies | Promise<DimensionDependencies>;

	/**
	 * Transform sections after global dimension (optional)
	 * Can split, merge, filter, or add sections
	 *
	 * @param context - Context with result and current sections
	 * @returns Modified sections array
	 */
	transformSections?(
		context: TransformSectionsContext,
	): SectionData[] | Promise<SectionData[]>;

	/**
	 * Finalize all results before return (optional)
	 * Last chance to modify results before returning to user
	 *
	 * @param context - Context with all results
	 * @returns Modified results
	 */
	finalizeResults?(
		context: FinalizeContext,
	): Record<string, DimensionResult> | Promise<Record<string, DimensionResult>>;

	/**
	 * Called before process starts (optional)
	 * Setup phase for entire workflow
	 *
	 * @param context - Process context
	 * @returns Modified sections and/or metadata
	 */
	beforeProcessStart?(
		context: BeforeProcessStartContext,
	): ProcessStartResult | Promise<ProcessStartResult>;

	/**
	 * Called after process completes (optional)
	 * Cleanup and finalization phase
	 *
	 * @param context - Process result context
	 * @returns Modified result
	 */
	afterProcessComplete?(
		context: ProcessResultContext,
	): ProcessResult | Promise<ProcessResult>;

	/**
	 * Handle process-level failure (optional)
	 * Called when entire process fails
	 *
	 * @param context - Failure context with error and partial results
	 * @returns Partial result or void to throw
	 */
	handleProcessFailure?(
		context: ProcessFailureContext,
	): ProcessResult | void | Promise<ProcessResult | void>;

	/**
	 * Called before dimension executes (optional)
	 * Setup phase for specific dimension
	 *
	 * @param context - Dimension context
	 */
	beforeDimensionExecute?(context: DimensionContext): void | Promise<void>;

	/**
	 * Called after dimension executes (optional)
	 * Cleanup phase for specific dimension
	 *
	 * @param context - Dimension result context
	 */
	afterDimensionExecute?(context: DimensionResultContext): void | Promise<void>;

	/**
	 * Called before provider executes (optional)
	 * Last chance to modify request before API call
	 *
	 * @param context - Provider context with request
	 * @returns Modified request
	 */
	beforeProviderExecute?(
		context: ProviderContext,
	): ProviderRequest | Promise<ProviderRequest>;

	/**
	 * Called after provider executes (optional)
	 * Validate and transform raw provider response
	 *
	 * @param context - Provider result context
	 * @returns Modified response
	 */
	afterProviderExecute?(
		context: ProviderResultContext,
	): ProviderResponse | Promise<ProviderResponse>;

	/**
	 * Handle retry attempts (optional)
	 * Called when dimension execution fails and will retry
	 *
	 * @param context - Retry context with error and attempt info
	 * @returns Retry configuration
	 */
	handleRetry?(context: RetryContext): RetryResponse | Promise<RetryResponse>;

	/**
	 * Handle provider fallback (optional)
	 * Called when switching to fallback provider
	 *
	 * @param context - Fallback context
	 * @returns Fallback configuration
	 */
	handleProviderFallback?(
		context: FallbackContext,
	): FallbackResponse | Promise<FallbackResponse>;

	/**
	 * Handle dimension failure (optional)
	 * Called when all retries and fallbacks exhausted.
	 *
	 * @param context - Failure context
	 * @returns Fallback result or void to throw
	 */
	handleDimensionFailure?(
		context: FailureContext,
	): DimensionResult | void | Promise<DimensionResult | void>;
}
