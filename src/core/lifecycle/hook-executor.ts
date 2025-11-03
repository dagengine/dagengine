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

export class HookExecutor {
	constructor(
		private readonly plugin: Plugin,
		private readonly options: ProcessOptions,
	) {}

	async executeBeforeProcessStart(
		processId: string,
		timestamp: number,
		sections: SectionData[],
		options: ProcessOptions,
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
					options,
				}),
			);
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError("beforeProcessStart", err);
			this.options.onError?.("beforeProcessStart", err);
			throw err;
		}
	}

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
			return context.dependencies;
		}
	}

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
			return false;
		}
	}

	async shouldSkipSectionDimension(
		context: SectionDimensionContext,
	): Promise<SkipCheckResult> {
		if (!this.plugin.shouldSkipSectionDimension) {
			return false;
		}

		try {
			const result = await Promise.resolve(
				this.plugin.shouldSkipSectionDimension(context),
			);
			return result ?? false;
		} catch (error) {
			const err = this.normalizeError(error);
			this.logError(
				`shouldSkipSectionDimension for ${context.dimension} (section ${context.sectionIndex})`,
				err,
			);
			this.options.onError?.(
				`shouldSkipSectionDimension-${context.dimension}-section-${context.sectionIndex}`,
				err,
			);
			return false;
		}
	}

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
			return request;
		}
	}

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
			return context.result;
		}
	}

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

	async finalizeResults(
		results: Record<string, DimensionResult>,
		originalSections: SectionData[],
		currentSections: SectionData[],
		globalResults: Record<string, DimensionResult>,
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
				originalSections,
				currentSections,
				globalResults,
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

	private normalizeError(error: unknown): Error {
		return error instanceof Error ? error : new Error(String(error));
	}

	private logError(context: string, error: unknown): void {
		const err = this.normalizeError(error);
		console.error(`Error in ${context}:`, err.message);
	}

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
