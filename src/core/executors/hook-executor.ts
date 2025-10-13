import { Plugin } from '../../plugin.ts';
import {
    ProcessOptions,
    ProcessStartResult,
    DimensionContext,
    SectionDimensionContext,
    SkipWithResult,
    DimensionDependencies,
    ProviderRequest,
    ProviderResultContext,
    ProviderResponse,
    DimensionResult,
    DimensionResultContext,
    ProcessResult,
    SectionData,
    TransformSectionsContext,
    RetryContext,
    RetryResponse,
    FallbackContext,
    FallbackResponse,
    FailureContext,
} from '../../types.ts';

/**
 * Centralized hook execution with consistent error handling and logging
 */
export class HookExecutor {
    constructor(
        private readonly plugin: Plugin,
        private readonly options: ProcessOptions
    ) {}

    /**
     * Execute beforeProcessStart hook with error handling
     */
    async executeBeforeProcessStart(
        processId: string,
        timestamp: number,
        sections: SectionData[]
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
                })
            );
        } catch (error) {
            const err = this.normalizeError(error);
            this.logError('beforeProcessStart', err);
            this.options.onError?.('beforeProcessStart', err);
            throw err;
        }
    }

    /**
     * Execute defineDependencies hook
     */
    async executeDefineDependencies(
        processId: string,
        timestamp: number,
        sections: SectionData[],
        metadata: any
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
                })
            );
        } catch (error) {
            const err = this.normalizeError(error);
            this.logError('defineDependencies', err);
            this.options.onError?.('defineDependencies', err);
            throw err;
        }
    }

    /**
     * Check if global dimension should be skipped
     */
    async shouldSkipGlobalDimension(
        context: DimensionContext
    ): Promise<boolean | SkipWithResult> {
        if (!this.plugin.shouldSkipGlobalDimension) {
            return false;
        }

        try {
            return await Promise.resolve(
                this.plugin.shouldSkipGlobalDimension(context)
            );
        } catch (error) {
            const err = this.normalizeError(error);
            this.logError(`shouldSkipGlobalDimension for ${context.dimension}`, err);
            this.options.onError?.(`shouldSkipGlobalDimension-${context.dimension}`, err);
            return false; // Continue processing on error
        }
    }

    /**
     * Check if section dimension should be skipped
     */
    async shouldSkipSectionDimension(
        context: SectionDimensionContext
    ): Promise<boolean | SkipWithResult> {
        if (!this.plugin.shouldSkipDimension) {
            return false;
        }

        try {
            return await Promise.resolve(
                this.plugin.shouldSkipDimension(context)
            );
        } catch (error) {
            const err = this.normalizeError(error);
            this.logError(
                `shouldSkipDimension for ${context.dimension} (section ${context.sectionIndex})`,
                err
            );
            this.options.onError?.(
                `shouldSkipDimension-${context.dimension}-section-${context.sectionIndex}`,
                err
            );
            return false; // Continue processing on error
        }
    }

    /**
     * Transform dependencies before execution
     */
    async transformDependencies(
        context: DimensionContext | SectionDimensionContext
    ): Promise<DimensionDependencies> {
        if (!this.plugin.transformDependencies) {
            return context.dependencies;
        }

        try {
            return await Promise.resolve(
                this.plugin.transformDependencies(context)
            );
        } catch (error) {
            const err = this.normalizeError(error);
            const contextStr = this.getContextString(context);
            this.logError(`transformDependencies ${contextStr}`, err);
            this.options.onError?.(`transformDependencies-${context.dimension}${contextStr}`, err);
            return context.dependencies; // Return original on error
        }
    }

    /**
     * Execute before dimension hook
     */
    async executeBeforeDimension(
        context: DimensionContext | SectionDimensionContext
    ): Promise<void> {
        if (!this.plugin.beforeDimensionExecute) {
            return;
        }

        try {
            await Promise.resolve(
                this.plugin.beforeDimensionExecute(context)
            );
        } catch (error) {
            const err = this.normalizeError(error);
            const contextStr = this.getContextString(context);
            this.logError(`beforeDimensionExecute ${contextStr}`, err);
            this.options.onError?.(`beforeDimensionExecute-${context.dimension}${contextStr}`, err);
        }
    }

    /**
     * Execute after dimension hook
     */
    async executeAfterDimension(
        context: DimensionResultContext
    ): Promise<void> {
        if (!this.plugin.afterDimensionExecute) {
            return;
        }

        try {
            await Promise.resolve(
                this.plugin.afterDimensionExecute(context)
            );
        } catch (error) {
            const err = this.normalizeError(error);
            const contextStr = this.getContextString(context);
            this.logError(`afterDimensionExecute ${contextStr}`, err);
            this.options.onError?.(`afterDimensionExecute-${context.dimension}${contextStr}`, err);
        }
    }

    /**
     * Execute before provider hook
     */
    async executeBeforeProvider(
        context: DimensionContext | SectionDimensionContext,
        request: ProviderRequest,
        provider: string,
        providerOptions: Record<string, unknown>
    ): Promise<ProviderRequest> {
        if (!this.plugin.beforeProviderExecute) {
            return request;
        }

        try {
            return await Promise.resolve(
                this.plugin.beforeProviderExecute({
                    ...context,
                    request,
                    provider,
                    providerOptions,
                })
            );
        } catch (error) {
            const err = this.normalizeError(error);
            console.warn(`Error in beforeProviderExecute for ${context.dimension}:`, err.message);
            return request; // Return original on error
        }
    }

    /**
     * Execute after provider hook
     */
    async executeAfterProvider(
        context: ProviderResultContext
    ): Promise<ProviderResponse> {
        if (!this.plugin.afterProviderExecute) {
            return context.result;
        }

        try {
            return await Promise.resolve(
                this.plugin.afterProviderExecute(context)
            );
        } catch (error) {
            const err = this.normalizeError(error);
            console.warn(`Error in afterProviderExecute for ${context.dimension}:`, err.message);
            return context.result; // Return original on error
        }
    }

    /**
     * Handle retry logic
     */
    async handleRetry(context: RetryContext): Promise<RetryResponse> {
        if (!this.plugin.handleRetry) {
            return {};
        }

        try {
            return await Promise.resolve(
                this.plugin.handleRetry(context)
            );
        } catch (error) {
            this.logError('handleRetry hook', error);
            return {};
        }
    }

    /**
     * Handle provider fallback
     */
    async handleFallback(context: FallbackContext): Promise<FallbackResponse> {
        if (!this.plugin.handleProviderFallback) {
            return {};
        }

        try {
            return await Promise.resolve(
                this.plugin.handleProviderFallback(context)
            );
        } catch (error) {
            this.logError('handleProviderFallback hook', error);
            return {};
        }
    }

    /**
     * Handle dimension failure
     */
    async handleDimensionFailure(
        context: FailureContext
    ): Promise<DimensionResult | undefined> {
        if (!this.plugin.handleDimensionFailure) {
            return undefined;
        }

        try {
            const result = await Promise.resolve(
                this.plugin.handleDimensionFailure(context)
            );

            // Handle void return (treat as undefined)
            return result ?? undefined;
        } catch (error) {
            this.logError('handleDimensionFailure hook', error);
            return undefined;
        }
    }

    /**
     * Transform sections after global dimension
     */
    async transformSections(
        context: TransformSectionsContext
    ): Promise<SectionData[] | undefined> {
        if (!this.plugin.transformSections) {
            return undefined;
        }

        try {
            const transformed = await Promise.resolve(
                this.plugin.transformSections(context)
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

    /**
     * Finalize all results
     */
    async finalizeResults(
        results: Record<string, DimensionResult>,
        sections: SectionData[],
        globalResults: Record<string, DimensionResult>,
        transformedSections: SectionData[],
        processId: string,
        duration: number,
        timestamp: number
    ): Promise<Record<string, DimensionResult> | undefined> {
        if (!this.plugin.finalizeResults) {
            return undefined;
        }

        try {
            return await Promise.resolve(
                this.plugin.finalizeResults({
                    results,
                    sections,
                    globalResults,
                    transformedSections,
                    processId,
                    duration,
                    timestamp,
                })
            );
        } catch (error) {
            const err = this.normalizeError(error);
            this.logError('finalizeResults', err);
            this.options.onError?.('finalizeResults', err);
            return undefined;
        }
    }

    /**
     * Execute afterProcessComplete hook
     */
    async executeAfterProcessComplete(
        processId: string,
        timestamp: number,
        sections: SectionData[],
        metadata: any,
        result: ProcessResult,
        duration: number,
        sortedDimensions: string[],
        successfulDimensions: number,
        failedDimensions: number
    ): Promise<ProcessResult | undefined> {
        if (!this.plugin.afterProcessComplete) {
            return undefined;
        }

        try {
            return await Promise.resolve(
                this.plugin.afterProcessComplete({
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
                })
            );
        } catch (error) {
            const err = this.normalizeError(error);
            this.logError('afterProcessComplete', err);
            this.options.onError?.('afterProcessComplete', err);
            return undefined;
        }
    }

    /**
     * Handle process failure
     */
    async handleProcessFailure(
        error: Error,
        partialResults: Partial<ProcessResult>,
        sections: SectionData[],
        processId: string,
        timestamp: number,
        duration: number
    ): Promise<ProcessResult | undefined> {
        if (!this.plugin.handleProcessFailure) {
            return undefined;
        }

        try {
            const result = await Promise.resolve(
                this.plugin.handleProcessFailure({
                    error,
                    partialResults,
                    processId,
                    sections,
                    duration,
                    options: this.options,
                    timestamp,
                })
            );

            // Handle void return (treat as undefined)
            return result ?? undefined;
        } catch (error) {
            const err = this.normalizeError(error);
            this.options.onError?.('handleProcessFailure', err);
            return undefined;
        }
    }

    // ===== Helper Methods =====

    private normalizeError(error: unknown): Error {
        return error instanceof Error ? error : new Error(String(error));
    }

    private logError(context: string, error: unknown): void {
        const err = this.normalizeError(error);
        console.error(`Error in ${context}:`, err.message);
    }

    private getContextString(
        context: DimensionContext | SectionDimensionContext
    ): string {
        if ('sectionIndex' in context) {
            return ` (section ${context.sectionIndex})`;
        }
        return '';
    }
}