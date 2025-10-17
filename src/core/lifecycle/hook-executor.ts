/**
 * Centralized hook execution with consistent error handling and logging
 *
 * Handles all plugin lifecycle hooks with proper error handling,
 * logging, and fallback behavior.
 *
 * @module lifecycle/hook-executor
 */

import type { Plugin } from "../../plugin.js";
import type {
	ProcessOptions,
	ProcessStartResult,
	ProcessResultContext,
	ProcessResult,
	ProcessFailureContext,
	DimensionContext,
	SectionDimensionContext,
	DimensionResultContext,
	ProviderContext,
	ProviderResultContext,
	DimensionDependencies,
	ProviderRequest,
	ProviderResponse,
	DimensionResult,
	SectionData,
	TransformSectionsContext,
	FinalizeContext,
	RetryContext,
	RetryResponse,
	FallbackContext,
	FallbackResponse,
	FailureContext,
} from "../../types.js";
import type { SkipCheckResult } from "../shared/types.js";

/**
 * Centralized hook execution with consistent error handling
 */
export class HookExecutor {
	constructor(
		private readonly plugin: Plugin,
		private readonly options: ProcessOptions,
	) {}

	// ============================================================================
	// PROCESS LIFECYCLE HOOKS
	// ============================================================================

	/**
	 * Execute beforeProcessStart hook
	 *
	 * @param processId - Process identifier
	 * @param timestamp - Process start timestamp
	 * @param sections - Input sections
	 * @returns Process start result or undefined
	 * @throws Error if hook fails critically
	 */
	async executeBeforeProcessStart(
		processId: string,
		timestamp: number,
		sections: SectionData[],
	): Promise<ProcessStartResult | undefined> {
		if (!this.plugin.beforeProcessStart) {
			return undefined;
		}

		try {
			return await Promise.resolve(
				this.plugin.beforeProcessStart({
					processId,
					timestamp,
					sections,
					options: this.options,
				}),
			);
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError("beforeProcessStart", err);
			this.options.onError?.("beforeProcessStart", err);
			throw err;
		}
	}

	/**
	 * Execute afterProcessComplete hook
	 *
	 * @param processId - Process identifier
	 * @param timestamp - Process start timestamp
	 * @param sections - Input sections
	 * @param metadata - Process metadata
	 * @param result - Process result
	 * @param duration - Process duration in ms
	 * @param sortedDimensions - All dimensions in execution order
	 * @param successfulDimensions - Count of successful dimensions
	 * @param failedDimensions - Count of failed dimensions
	 * @returns Modified process result or undefined
	 */
	async executeAfterProcessComplete(
		processId: string,
		timestamp: number,
		sections: SectionData[],
		metadata: unknown,
		result: ProcessResult,
		duration: number,
		sortedDimensions: string[],
		successfulDimensions: number,
		failedDimensions: number,
	): Promise<ProcessResult | undefined> {
		if (!this.plugin.afterProcessComplete) {
			return undefined;
		}

		try {
			const context: ProcessResultContext = {
				processId,
				timestamp,
				sections,
				options: this.options,
				metadata,
				result,
				duration,
				totalDimensions: sortedDimensions.length,
				successfulDimensions,
				failedDimensions,
			};

			return await Promise.resolve(this.plugin.afterProcessComplete(context));
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError("afterProcessComplete", err);
			this.options.onError?.("afterProcessComplete", err);
			return undefined;
		}
	}

	/**
	 * Handle process failure
	 *
	 * @param error - The error that caused failure
	 * @param partialResults - Partial results collected before failure
	 * @param sections - Input sections
	 * @param processId - Process identifier
	 * @param timestamp - Process start timestamp
	 * @param duration - Process duration in ms
	 * @returns Recovery result or undefined
	 */
	async handleProcessFailure(
		error: Error,
		partialResults: Partial<ProcessResult>,
		sections: SectionData[],
		processId: string,
		timestamp: number,
		duration: number,
	): Promise<ProcessResult | undefined> {
		if (!this.plugin.handleProcessFailure) {
			return undefined;
		}

		try {
			const context: ProcessFailureContext = {
				error,
				partialResults,
				processId,
				timestamp,
				sections,
				options: this.options,
				duration,
			};

			const result = await Promise.resolve(
				this.plugin.handleProcessFailure(context),
			);

			return result ?? undefined;
		} catch (err) {
			const normalizedError = this.normalizeError(err);
			this.options.onError?.("handleProcessFailure", normalizedError);
			return undefined;
		}
	}

	// ============================================================================
	// DEPENDENCY HOOKS
	// ============================================================================

	/**
	 * Execute defineDependencies hook
	 *
	 * @param processId - Process identifier
	 * @param timestamp - Process start timestamp
	 * @param sections - Input sections
	 * @param metadata - Process metadata from beforeProcessStart
	 * @returns Dependency graph
	 * @throws Error if hook fails
	 */
	async executeDefineDependencies(
		processId: string,
		timestamp: number,
		sections: SectionData[],
		metadata: unknown,
	): Promise<Record<string, string[]>> {
		if (!this.plugin.defineDependencies) {
			return {};
		}

		try {
			return await Promise.resolve(
				this.plugin.defineDependencies({
					processId,
					timestamp,
					sections,
					options: this.options,
					metadata,
				}),
			);
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError("defineDependencies", err);
			this.options.onError?.("defineDependencies", err);
			throw err;
		}
	}

	/**
	 * Transform dependencies before execution
	 *
	 * @param context - Dimension context with dependencies
	 * @returns Transformed dependencies
	 */
	async transformDependencies(
		context: DimensionContext | SectionDimensionContext,
	): Promise<DimensionDependencies> {
		if (!this.plugin.transformDependencies) {
			return context.dependencies;
		}

		try {
			return await Promise.resolve(this.plugin.transformDependencies(context));
		} catch (error) {
			const err = this.normalizeError(error);
			const contextStr = this.getContextString(context);
			this.logError(`transformDependencies ${contextStr}`, err);
			this.options.onError?.(
				`transformDependencies-${context.dimension}${contextStr}`,
				err,
			);
			return context.dependencies; // Return original on error
		}
	}

	// ============================================================================
	// SKIP LOGIC HOOKS
	// ============================================================================

	/**
	 * Check if global dimension should be skipped
	 *
	 * @param context - Global dimension context
	 * @returns Skip decision (boolean or skip with cached result)
	 */
	async shouldSkipGlobalDimension(
		context: DimensionContext,
	): Promise<SkipCheckResult> {
		if (!this.plugin.shouldSkipGlobalDimension) {
			return false;
		}

		try {
			const result = await Promise.resolve(
				this.plugin.shouldSkipGlobalDimension(context),
			);
			return result ?? false;
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError(`shouldSkipGlobalDimension for ${context.dimension}`, err);
			this.options.onError?.(
				`shouldSkipGlobalDimension-${context.dimension}`,
				err,
			);
			return false; // Continue processing on error
		}
	}

	/**
	 * Check if section dimension should be skipped
	 *
	 * @param context - Section dimension context
	 * @returns Skip decision (boolean or skip with cached result)
	 */
	async shouldSkipSectionDimension(
		context: SectionDimensionContext,
	): Promise<SkipCheckResult> {
		if (!this.plugin.shouldSkipDimension) {
			return false;
		}

		try {
			const result = await Promise.resolve(
				this.plugin.shouldSkipDimension(context),
			);
			return result ?? false;
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError(
				`shouldSkipDimension for ${context.dimension} (section ${context.sectionIndex})`,
				err,
			);
			this.options.onError?.(
				`shouldSkipDimension-${context.dimension}-section-${context.sectionIndex}`,
				err,
			);
			return false; // Continue processing on error
		}
	}

	// ============================================================================
	// DIMENSION LIFECYCLE HOOKS
	// ============================================================================

	/**
	 * Execute beforeDimensionExecute hook
	 *
	 * @param context - Dimension context
	 */
	async executeBeforeDimension(
		context: DimensionContext | SectionDimensionContext,
	): Promise<void> {
		if (!this.plugin.beforeDimensionExecute) {
			return;
		}

		try {
			await Promise.resolve(this.plugin.beforeDimensionExecute(context));
		} catch (error) {
			const err = this.normalizeError(error);
			const contextStr = this.getContextString(context);
			this.logError(`beforeDimensionExecute ${contextStr}`, err);
			this.options.onError?.(
				`beforeDimensionExecute-${context.dimension}${contextStr}`,
				err,
			);
		}
	}

	/**
	 * Execute afterDimensionExecute hook
	 *
	 * @param context - Dimension result context
	 */
	async executeAfterDimension(context: DimensionResultContext): Promise<void> {
		if (!this.plugin.afterDimensionExecute) {
			return;
		}

		try {
			await Promise.resolve(this.plugin.afterDimensionExecute(context));
		} catch (error) {
			const err = this.normalizeError(error);
			const contextStr = this.getContextString(context);
			this.logError(`afterDimensionExecute ${contextStr}`, err);
			this.options.onError?.(
				`afterDimensionExecute-${context.dimension}${contextStr}`,
				err,
			);
		}
	}

	// ============================================================================
	// PROVIDER HOOKS
	// ============================================================================

	/**
	 * Execute beforeProviderExecute hook
	 *
	 * @param context - Dimension context
	 * @param request - Provider request
	 * @param provider - Provider name
	 * @param providerOptions - Provider options
	 * @returns Modified provider request
	 */
	async executeBeforeProvider(
		context: DimensionContext | SectionDimensionContext,
		request: ProviderRequest,
		provider: string,
		providerOptions: Record<string, unknown>,
	): Promise<ProviderRequest> {
		if (!this.plugin.beforeProviderExecute) {
			return request;
		}

		try {
			const providerContext: ProviderContext = {
				...context,
				request,
				provider,
				providerOptions,
			};

			const result = await Promise.resolve(
				this.plugin.beforeProviderExecute(providerContext),
			);

			return result ?? request;
		} catch (error) {
			const err = this.normalizeError(error);
			console.warn(
				`Error in beforeProviderExecute for ${context.dimension}:`,
				err.message,
			);
			return request; // Return original on error
		}
	}

	/**
	 * Execute afterProviderExecute hook
	 *
	 * @param context - Provider result context
	 * @returns Modified provider response
	 */
	async executeAfterProvider(
		context: ProviderResultContext,
	): Promise<ProviderResponse> {
		if (!this.plugin.afterProviderExecute) {
			return context.result;
		}

		try {
			const result = await Promise.resolve(
				this.plugin.afterProviderExecute(context),
			);
			return result ?? context.result;
		} catch (error) {
			const err = this.normalizeError(error);
			console.warn(
				`Error in afterProviderExecute for ${context.dimension}:`,
				err.message,
			);
			return context.result; // Return original on error
		}
	}

	// ============================================================================
	// RETRY & FALLBACK HOOKS
	// ============================================================================

	/**
	 * Handle retry logic
	 *
	 * @param context - Retry context
	 * @returns Retry response with modifications
	 */
	async handleRetry(context: RetryContext): Promise<RetryResponse> {
		if (!this.plugin.handleRetry) {
			return {};
		}

		try {
			const result = await Promise.resolve(this.plugin.handleRetry(context));
			return result ?? {};
		} catch (error) {
			this.logError("handleRetry hook", error);
			return {};
		}
	}

	/**
	 * Handle provider fallback
	 *
	 * @param context - Fallback context
	 * @returns Fallback response with modifications
	 */
	async handleFallback(context: FallbackContext): Promise<FallbackResponse> {
		if (!this.plugin.handleProviderFallback) {
			return {};
		}

		try {
			const result = await Promise.resolve(
				this.plugin.handleProviderFallback(context),
			);
			return result ?? {};
		} catch (error) {
			this.logError("handleProviderFallback hook", error);
			return {};
		}
	}

	/**
	 * Handle dimension failure
	 *
	 * @param context - Failure context
	 * @returns Recovery result or undefined
	 */
	async handleDimensionFailure(
		context: FailureContext,
	): Promise<DimensionResult | undefined> {
		if (!this.plugin.handleDimensionFailure) {
			return undefined;
		}

		try {
			const result = await Promise.resolve(
				this.plugin.handleDimensionFailure(context),
			);
			return result ?? undefined;
		} catch (error) {
			this.logError("handleDimensionFailure hook", error);
			return undefined;
		}
	}

	// ============================================================================
	// TRANSFORMATION HOOKS
	// ============================================================================

	/**
	 * Transform sections after global dimension
	 *
	 * @param context - Transform context
	 * @returns Transformed sections or undefined
	 */
	async transformSections(
		context: TransformSectionsContext,
	): Promise<SectionData[] | undefined> {
		if (!this.plugin.transformSections) {
			return undefined;
		}

		try {
			const transformed = await Promise.resolve(
				this.plugin.transformSections(context),
			);

			if (Array.isArray(transformed) && transformed.length > 0) {
				return transformed;
			}
			return undefined;
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError(`transformSections for ${context.dimension}`, err);
			this.options.onError?.(`transformSections-${context.dimension}`, err);
			return undefined;
		}
	}

	// ============================================================================
	// FINALIZATION HOOKS
	// ============================================================================

	/**
	 * Finalize all results
	 *
	 * @param results - All dimension results
	 * @param sections - Input sections
	 * @param globalResults - Global dimension results
	 * @param transformedSections - Transformed sections
	 * @param processId - Process identifier
	 * @param duration - Process duration in ms
	 * @param timestamp - Process start timestamp
	 * @returns Finalized results or undefined
	 */
	async finalizeResults(
		results: Record<string, DimensionResult>,
		sections: SectionData[],
		globalResults: Record<string, DimensionResult>,
		transformedSections: SectionData[],
		processId: string,
		duration: number,
		timestamp: number,
	): Promise<Record<string, DimensionResult> | undefined> {
		if (!this.plugin.finalizeResults) {
			return undefined;
		}

		try {
			const context: FinalizeContext = {
				results,
				sections,
				globalResults,
				transformedSections,
				processId,
				duration,
				timestamp,
			};

			return await Promise.resolve(this.plugin.finalizeResults(context));
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError("finalizeResults", err);
			this.options.onError?.("finalizeResults", err);
			return undefined;
		}
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Normalize error to Error instance
	 */
	private normalizeError(error: unknown): Error {
		return error instanceof Error ? error : new Error(String(error));
	}

	/**
	 * Log error with context
	 */
	private logError(context: string, error: unknown): void {
		const err = this.normalizeError(error);
		console.error(`Error in ${context}:`, err.message);
	}

	/**
	 * Get context string for logging
	 */
	private getContextString(
		context:
			| DimensionContext
			| SectionDimensionContext
			| DimensionResultContext,
	): string {
		if ("sectionIndex" in context) {
			return `for ${context.dimension} (section ${context.sectionIndex})`;
		}
		return `for ${context.dimension}`;
	}
}
