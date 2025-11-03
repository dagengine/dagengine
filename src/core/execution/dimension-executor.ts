import type { Plugin } from "../../plugin.js";
import {
	type SectionData,
	type DimensionContext,
	type SectionDimensionContext,
	type ProcessOptions,
	type DimensionResult,
} from "../../types.js";
import type PQueue from "p-queue";

import type { HookExecutor } from "../lifecycle/hook-executor.js";
import type { ProviderExecutor } from "./provider-executor.js";
import type { DependencyResolver } from "./dependency-resolver.js";
import type { ProgressTracker } from "./progress-tracker.js";
import type { ProcessState } from "../shared/types.js";
import {
	executeWithTimeout,
	hasFailedDependencies,
	getFailedDependencies,
} from "../shared/utils.js";
import { SKIP_REASONS } from "../shared/constants.js";
import { DependencyError } from "../shared/errors.js";

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
		private readonly progressTracker?: ProgressTracker,
	) {}

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

			const skipResult = await this.checkGlobalSkip(
				context,
				dimension,
				state,
				options,
			);
			if (skipResult) return;

			await this.transformAndValidateDependencies(context);

			await this.executeGlobalDimension(dimension, state, context, options);
		} catch (error) {
			this.handleGlobalError(dimension, error, state, options);
		}
	}

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
			const result: DimensionResult = {
				data: {
					skipped: true,
					reason: SKIP_REASONS.PLUGIN_SKIP_GLOBAL,
				},
				metadata: {
					skipped: true,
					reason: SKIP_REASONS.PLUGIN_SKIP_GLOBAL,
				},
			};
			state.globalResults[dimension] = result;

			this.progressTracker?.record(dimension, 0, true, true, 0, result);
			options.onDimensionComplete?.(dimension, result);
			return true;
		}

		if (
			skipResult &&
			typeof skipResult === "object" &&
			skipResult.skip &&
			skipResult.result
		) {
			const result: DimensionResult = {
				...skipResult.result,
				metadata: { ...skipResult.result.metadata, cached: true },
			};
			state.globalResults[dimension] = result;

			this.progressTracker?.record(dimension, 0, true, true, 0, result);
			options.onDimensionComplete?.(dimension, result);
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

		const success = !result.error;
		this.progressTracker?.record(
			dimension,
			0,
			success,
			false,
			duration,
			result,
		);

		await this.hookExecutor.executeAfterDimension({
			processId: context.processId,
			timestamp: context.timestamp,
			dimension: context.dimension,
			isGlobal: context.isGlobal,
			sections: context.sections,
			dependencies: context.dependencies,
			globalResults: context.globalResults,
			result,
			duration,
			provider: result.metadata?.provider ?? "unknown",
			model: result.metadata?.model,
			tokensUsed: result.metadata?.tokens,
			cost: result.metadata?.cost,
		});

		options.onDimensionComplete?.(dimension, result);
	}

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

		const skipResult = await this.checkSectionSkip(
			context,
			dimension,
			sectionIdx,
			state,
		);
		if (skipResult) {
			const sectionResults = state.sectionResultsMap.get(sectionIdx) ?? {};
			const result = sectionResults[dimension] ?? { data: { skipped: true } };
			this.progressTracker?.record(
				dimension,
				sectionIdx,
				true,
				true,
				0,
				result,
			);
			return;
		}

		await this.transformAndValidateDependencies(context);

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

		const success = !result.error;
		this.progressTracker?.record(
			dimension,
			sectionIdx,
			success,
			false,
			duration,
			result,
		);

		await this.hookExecutor.executeAfterDimension({
			processId: context.processId,
			timestamp: context.timestamp,
			dimension: context.dimension,
			isGlobal: context.isGlobal,
			sections: context.sections,
			dependencies: context.dependencies,
			globalResults: context.globalResults,
			section: context.section,
			sectionIndex: context.sectionIndex,
			result,
			duration,
			provider: result.metadata?.provider ?? "unknown",
			model: result.metadata?.model,
			tokensUsed: result.metadata?.tokens,
			cost: result.metadata?.cost,
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
				data: {
					skipped: true,
					reason: SKIP_REASONS.PLUGIN_SKIP_SECTION,
				},
				metadata: {
					skipped: true,
					reason: SKIP_REASONS.PLUGIN_SKIP_SECTION,
				},
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

	private async transformAndValidateDependencies(
		context: DimensionContext | SectionDimensionContext,
	): Promise<void> {
		const transformedDeps =
			await this.hookExecutor.transformDependencies(context);
		context.dependencies = transformedDeps;

		if (hasFailedDependencies(transformedDeps)) {
			if (!this.continueOnError) {
				const failedDeps = getFailedDependencies(transformedDeps);
				const failedDepErrors: Record<string, string> = {};
				failedDeps.forEach((depName) => {
					failedDepErrors[depName] =
						transformedDeps[depName]?.error || "unknown error";
				});

				throw new DependencyError(context.dimension, failedDepErrors);
			}

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

		const result: DimensionResult = { error: err.message };
		state.globalResults[dimension] = result;
		this.progressTracker?.record(dimension, 0, false, false, 0, result);
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

		const result: DimensionResult = { error: err.message };
		const sectionResults = state.sectionResultsMap.get(sectionIdx) ?? {};
		sectionResults[dimension] = result;
		state.sectionResultsMap.set(sectionIdx, sectionResults);

		this.progressTracker?.record(
			dimension,
			sectionIdx,
			false,
			false,
			0,
			result,
		);

		if (!this.continueOnError) {
			throw error;
		}
	}
}
