/**
 * Dimension executor
 *
 * Handles the execution of individual dimensions (both global and section-level)
 * with skip checking, dependency validation, timeout protection, and error handling.
 *
 * @module execution/dimension-executor
 */

import type { Plugin } from "../../plugin.js";
import {
	type SectionData,
	type DimensionContext,
	type SectionDimensionContext,
	type ProcessOptions,
} from "../../types.js";
import type PQueue from "p-queue";

import type { HookExecutor } from "../lifecycle/hook-executor.js";
import type { ProviderExecutor } from "./provider-executor.js";
import type { DependencyResolver } from "./dependency-resolver.js";
import type { ProcessState } from "../shared/types.js";
import {
	executeWithTimeout,
	hasFailedDependencies,
	getFailedDependencies,
} from "../shared/utils.js";
import { SKIP_REASONS } from "../shared/constants.js";
import { DependencyError } from "../shared/errors.js";

/**
 * Handles the execution of individual dimensions (both global and section-level)
 *
 * This executor manages:
 * - Skip checking via plugin hooks
 * - Dependency transformation and validation
 * - Timeout protection
 * - Error handling with configurable recovery
 */
export class DimensionExecutor {
	constructor(
		private readonly plugin: Plugin,
		private readonly providerExecutor: ProviderExecutor,
		private readonly hookExecutor: HookExecutor,
		private readonly dependencyResolver: DependencyResolver,
		private readonly queue: PQueue,
		private readonly defaultTimeout: number,
		private readonly dimensionTimeouts: Record<string, number>,
		private readonly continueOnError: boolean,
	) {}

	/**
	 * Processes a global dimension across all sections
	 *
	 * @param dimension - Dimension name
	 * @param state - Process state
	 * @param dependencyGraph - Dependency graph
	 * @param options - Process options
	 */
	async processGlobalDimension(
		dimension: string,
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		try {
			options.onDimensionStart?.(dimension);

			const context = await this.createGlobalContext(
				dimension,
				state,
				dependencyGraph,
			);

			// Check if should skip
			const skipResult = await this.checkGlobalSkip(
				context,
				dimension,
				state,
				options,
			);
			if (skipResult) return;

			// Transform and validate dependencies
			await this.transformAndValidateDependencies(context);

			// Execute dimension
			await this.executeGlobalDimension(dimension, state, context, options);
		} catch (error) {
			this.handleGlobalError(dimension, error, state, options);
		}
	}

	/**
	 * Processes a section-level dimension across all sections
	 *
	 * @param dimension - Dimension name
	 * @param state - Process state
	 * @param dependencyGraph - Dependency graph
	 * @param options - Process options
	 */
	/**
	 * Processes a section-level dimension across all sections
	 *
	 * @param dimension - Dimension name
	 * @param state - Process state
	 * @param dependencyGraph - Dependency graph
	 * @param options - Process options
	 */
	async processSectionDimension(
		dimension: string,
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		options.onDimensionStart?.(dimension);

		const tasks = state.sections.map((section, sectionIdx) =>
			this.createSectionTask(
				dimension,
				section,
				sectionIdx,
				state,
				dependencyGraph,
				options,
			),
		);

		await this.queue.addAll(tasks);
		options.onDimensionComplete?.(dimension, {
			data: "Section dimension complete",
		});
	}

	// ==================== PRIVATE: GLOBAL EXECUTION ====================

	private async createGlobalContext(
		dimension: string,
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
	): Promise<DimensionContext> {
		const dependencies =
			await this.dependencyResolver.resolveGlobalDependencies(
				dimension,
				state.globalResults,
				state.sectionResultsMap,
				state.sections.length,
				dependencyGraph,
			);

		return {
			processId: state.id,
			timestamp: Date.now(),
			dimension,
			isGlobal: true,
			sections: state.sections,
			dependencies,
			globalResults: state.globalResults,
		};
	}

	private async checkGlobalSkip(
		context: DimensionContext,
		dimension: string,
		state: ProcessState,
		options: ProcessOptions,
	): Promise<boolean> {
		const skipResult =
			await this.hookExecutor.shouldSkipGlobalDimension(context);

		if (skipResult === true) {
			state.globalResults[dimension] = {
				data: { skipped: true, reason: SKIP_REASONS.PLUGIN_SKIP_GLOBAL },
			};
			options.onDimensionComplete?.(dimension, state.globalResults[dimension]);
			return true;
		}

		if (
			skipResult &&
			typeof skipResult === "object" &&
			skipResult.skip &&
			skipResult.result
		) {
			state.globalResults[dimension] = {
				...skipResult.result,
				metadata: { ...skipResult.result.metadata, cached: true },
			};
			options.onDimensionComplete?.(dimension, state.globalResults[dimension]);
			return true;
		}

		return false;
	}

	private async executeGlobalDimension(
		dimension: string,
		state: ProcessState,
		context: DimensionContext,
		options: ProcessOptions,
	): Promise<void> {
		await this.hookExecutor.executeBeforeDimension(context);

		const startTime = Date.now();
		const timeoutMs = this.dimensionTimeouts[dimension] ?? this.defaultTimeout;

		const result = await executeWithTimeout(
			() =>
				this.providerExecutor.execute(
					dimension,
					state.sections,
					context.dependencies,
					true,
					context,
				),
			dimension,
			timeoutMs,
		);

		const duration = Date.now() - startTime;
		state.globalResults[dimension] = result;

		await this.hookExecutor.executeAfterDimension({
			...context,
			request: { input: "", options: {} },
			provider: result.metadata?.provider ?? "unknown",
			providerOptions: {},
			result,
			duration,
			...(result.metadata?.tokens && { tokensUsed: result.metadata.tokens }),
		});

		options.onDimensionComplete?.(dimension, result);
	}

	// ==================== PRIVATE: SECTION EXECUTION ====================

	private createSectionTask(
		dimension: string,
		section: SectionData,
		sectionIdx: number,
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): () => Promise<void> {
		return async () => {
			try {
				if (sectionIdx === 0) {
					options.onSectionStart?.(sectionIdx, state.sections.length);
				}

				await this.executeSectionDimension(
					dimension,
					section,
					sectionIdx,
					state,
					dependencyGraph,
				);

				if (sectionIdx === 0) {
					options.onSectionComplete?.(sectionIdx, state.sections.length);
				}
			} catch (error) {
				this.handleSectionError(dimension, sectionIdx, error, state, options);
			}
		};
	}

	private async executeSectionDimension(
		dimension: string,
		section: SectionData,
		sectionIdx: number,
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
	): Promise<void> {
		const context = await this.createSectionContext(
			dimension,
			section,
			sectionIdx,
			state,
			dependencyGraph,
		);

		// Check if should skip
		const skipResult = await this.checkSectionSkip(
			context,
			dimension,
			sectionIdx,
			state,
		);
		if (skipResult) return;

		// Transform and validate dependencies
		await this.transformAndValidateDependencies(context);

		// Execute dimension
		await this.hookExecutor.executeBeforeDimension(context);

		const startTime = Date.now();
		const timeoutMs = this.dimensionTimeouts[dimension] ?? this.defaultTimeout;

		const result = await executeWithTimeout(
			() =>
				this.providerExecutor.execute(
					dimension,
					[section],
					context.dependencies,
					false,
					context,
				),
			dimension,
			timeoutMs,
		);

		const duration = Date.now() - startTime;

		const sectionResults = state.sectionResultsMap.get(sectionIdx) ?? {};
		sectionResults[dimension] = result;
		state.sectionResultsMap.set(sectionIdx, sectionResults);

		await this.hookExecutor.executeAfterDimension({
			...context,
			request: { input: "", options: {} },
			provider: result.metadata?.provider ?? "unknown",
			providerOptions: {},
			result,
			duration,
			...(result.metadata?.tokens && { tokensUsed: result.metadata.tokens }),
		});
	}

	private async createSectionContext(
		dimension: string,
		section: SectionData,
		sectionIdx: number,
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
	): Promise<SectionDimensionContext> {
		const sectionResults = state.sectionResultsMap.get(sectionIdx) ?? {};
		const dependencies =
			await this.dependencyResolver.resolveSectionDependencies(
				dimension,
				sectionResults,
				state.globalResults,
				dependencyGraph,
			);

		return {
			processId: state.id,
			timestamp: Date.now(),
			dimension,
			isGlobal: false,
			sections: [section],
			dependencies,
			globalResults: state.globalResults,
			section,
			sectionIndex: sectionIdx,
		};
	}

	private async checkSectionSkip(
		context: SectionDimensionContext,
		dimension: string,
		sectionIdx: number,
		state: ProcessState,
	): Promise<boolean> {
		const skipResult =
			await this.hookExecutor.shouldSkipSectionDimension(context);

		const sectionResults = state.sectionResultsMap.get(sectionIdx) ?? {};

		if (skipResult === true) {
			sectionResults[dimension] = {
				data: { skipped: true, reason: SKIP_REASONS.PLUGIN_SKIP_SECTION },
			};
			state.sectionResultsMap.set(sectionIdx, sectionResults);
			return true;
		}

		if (
			skipResult &&
			typeof skipResult === "object" &&
			skipResult.skip &&
			skipResult.result
		) {
			sectionResults[dimension] = {
				...skipResult.result,
				metadata: { ...skipResult.result.metadata, cached: true },
			};
			state.sectionResultsMap.set(sectionIdx, sectionResults);
			return true;
		}

		return false;
	}

	// ==================== PRIVATE: SHARED ====================

	/**
	 * Transforms and validates dependencies before execution
	 *
	 * Checks for failed dependencies and throws detailed error if found.
	 */
	private async transformAndValidateDependencies(
		context: DimensionContext | SectionDimensionContext,
	): Promise<void> {
		const transformedDeps =
			await this.hookExecutor.transformDependencies(context);
		context.dependencies = transformedDeps;

		if (hasFailedDependencies(transformedDeps)) {
			// Only throw if continueOnError is false
			if (!this.continueOnError) {
				const failedDeps = getFailedDependencies(transformedDeps);
				const failedDepErrors: Record<string, string> = {};
				failedDeps.forEach((depName) => {
					failedDepErrors[depName] =
						transformedDeps[depName]?.error || "unknown error";
				});

				throw new DependencyError(context.dimension, failedDepErrors);
			}

			// If continueOnError: true, just log a warning and continue
			const failedDeps = getFailedDependencies(transformedDeps);
			console.warn(
				`Dimension "${context.dimension}" executing with failed dependencies: ${failedDeps.join(", ")}`,
			);
		}
	}

	private handleGlobalError(
		dimension: string,
		error: unknown,
		state: ProcessState,
		options: ProcessOptions,
	): void {
		const err = error instanceof Error ? error : new Error(String(error));
		options.onError?.(`global-${dimension}`, err);
		state.globalResults[dimension] = { error: err.message };
	}

	private handleSectionError(
		dimension: string,
		sectionIdx: number,
		error: unknown,
		state: ProcessState,
		options: ProcessOptions,
	): void {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error(
			`Error processing dimension "${dimension}" for section ${sectionIdx}:`,
			err.message,
		);
		options.onError?.(`section-${sectionIdx}-${dimension}`, err);

		const sectionResults = state.sectionResultsMap.get(sectionIdx) ?? {};
		sectionResults[dimension] = { error: err.message };
		state.sectionResultsMap.set(sectionIdx, sectionResults);

		if (!this.continueOnError) {
			throw error;
		}
	}
}
