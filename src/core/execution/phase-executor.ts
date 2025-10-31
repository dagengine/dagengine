import type { Plugin } from "../../plugin";
import type { ProviderAdapter } from "../../providers/adapter";
import type {
	ProcessOptions,
	ProcessResult,
	PricingConfig,
	SectionData,
	DimensionResult,
} from "../../types";
import PQueue from "p-queue";

import { HookExecutor } from "../lifecycle/hook-executor";
import { DependencyGraphManager } from "../analysis/graph-manager";
import { CostCalculator } from "../analysis/cost-calculator";
import { ProviderExecutor } from "./provider-executor";
import { DimensionExecutor } from "./dimension-executor";
import { DependencyResolver } from "./dependency-resolver";
import { TransformationManager } from "./transformation-manager";
import { ProgressTracker } from "./progress-tracker";
import {
	ProgressDisplay,
	type ProgressDisplayOptions,
} from "./progress-display";

import type { ExecutionPlan, ProcessState } from "../shared/types";
import { NoSectionsError } from "../shared/errors";
import {
	countSuccessful,
	countFailed,
	applyFinalizedResults,
	resetSectionResultsMap,
} from "../shared/utils";

interface ExecutionConfig {
	concurrency: number;
	maxRetries: number;
	retryDelay: number;
	continueOnError: boolean;
	timeout: number;
	dimensionTimeouts: Record<string, number>;
	pricing?: PricingConfig;
}

export class PhaseExecutor {
	private readonly plugin: Plugin;
	private readonly adapter: ProviderAdapter;
	public readonly config: ExecutionConfig;
	private readonly graphManager: DependencyGraphManager;
	private readonly costCalculator?: CostCalculator;
	private readonly queue: PQueue;
	private originalSectionResults?: Array<{
		section: SectionData;
		results: Record<string, DimensionResult>;
	}>;

	// Stateless managers
	private readonly dependencyResolver: DependencyResolver;
	private readonly transformationManager: TransformationManager;

	// Runtime executors
	private hookExecutor?: HookExecutor;
	private providerExecutor?: ProviderExecutor;
	private dimensionExecutor?: DimensionExecutor;

	// Progress tracking
	private progressTracker?: ProgressTracker;
	private progressDisplay?: ProgressDisplay;

	constructor(
		plugin: Plugin,
		adapter: ProviderAdapter,
		config: ExecutionConfig,
	) {
		this.plugin = plugin;
		this.adapter = adapter;
		this.config = config;

		this.graphManager = new DependencyGraphManager(plugin);
		this.dependencyResolver = new DependencyResolver(plugin);
		this.transformationManager = new TransformationManager(plugin);

		if (this.config.pricing) {
			this.costCalculator = new CostCalculator(this.config.pricing);
		}

		this.queue = new PQueue({ concurrency: config.concurrency });
	}

	getPlugin(): Plugin {
		return this.plugin;
	}

	// ============================================================================
	// PHASE 1: PRE-PROCESS
	// ============================================================================

	async preProcess(
		state: ProcessState,
		options: ProcessOptions,
	): Promise<void> {
		this.hookExecutor = new HookExecutor(this.plugin, options);

		const startResult = await this.hookExecutor.executeBeforeProcessStart(
			state.id,
			state.startTime,
			state.sections,
			options,
		);

		// Apply hook modifications
		if (startResult?.sections) {
			const oldCount = state.sections.length;
			const newCount = startResult.sections.length;

			state.sections = startResult.sections;

			if (oldCount !== newCount) {
				state.originalSections = [...startResult.sections];
			}

			if (oldCount !== newCount) {
				resetSectionResultsMap(state.sectionResultsMap, newCount);
			}
		}
		if (startResult?.metadata) {
			state.metadata = startResult.metadata;
		}

		// Validate we have sections to process
		if (state.sections.length === 0) {
			throw new NoSectionsError();
		}
	}

	// ============================================================================
	// PHASE 2: PLANNING
	// ============================================================================

	async planExecution(state: ProcessState): Promise<ExecutionPlan> {
		const dependencyGraph = await this.hookExecutor!.executeDefineDependencies(
			state.id,
			state.startTime,
			state.sections,
			state.metadata,
		);

		const allDimensions = this.plugin.getDimensionNames();
		const sortedDimensions = await this.graphManager.buildAndSort(
			allDimensions,
			dependencyGraph,
		);

		const executionGroups = this.graphManager.groupForParallelExecution(
			sortedDimensions,
			dependencyGraph,
		);

		return {
			sortedDimensions,
			executionGroups,
			dependencyGraph,
		};
	}

	// ============================================================================
	// PHASE 3: EXECUTION
	// ============================================================================

	/**
	 * Phase 3: Execution
	 *
	 * Executes all dimensions according to the execution plan.
	 * Processes dimensions in parallel groups, respecting dependencies.
	 */
	async executeDimensions(
		state: ProcessState,
		plan: ExecutionPlan,
		options: ProcessOptions,
	): Promise<void> {
		// Initialize progress display if configured
		const displayOptions = this.resolveProgressDisplay(options.progressDisplay);
		if (displayOptions) {
			this.progressDisplay = new ProgressDisplay(displayOptions);
		}

		const globalDimensions = plan.sortedDimensions.filter((dim) =>
			this.plugin.isGlobalDimension(dim),
		);

		// Create progress tracker with pricing config (not CostCalculator)
		this.progressTracker = new ProgressTracker(
			state.sections.length,
			plan.sortedDimensions,
			{
				onProgress: (progress): void => {
					// Update built-in display
					this.progressDisplay?.update(progress);

					// Call user callback
					options.onProgress?.(progress);
				},
				updateEvery: options.updateEvery ?? 1,
				pricing: this.config.pricing,
				globalDimensions,
			},
		);

		// Initialize runtime executors with progress tracker
		this.initializeExecutors(options, this.progressTracker);

		try {
			// Execute each group sequentially
			for (const group of plan.executionGroups) {
				const globalDims = group.filter((dim) =>
					this.plugin.isGlobalDimension(dim),
				);
				const sectionDims = group.filter(
					(dim) => !this.plugin.isGlobalDimension(dim),
				);

				await this.executeGlobalDimensions(
					globalDims,
					state,
					plan.dependencyGraph,
					options,
				);

				await this.executeSectionDimensions(
					sectionDims,
					state,
					plan.dependencyGraph,
					options,
				);
			}
		} finally {
			// Stop progress display
			this.progressDisplay?.stop();
		}
	}

	public async executeGlobalDimensions(
		dimensions: string[],
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		if (dimensions.length === 0) return;

		// Execute all global dimensions in parallel
		await Promise.all(
			dimensions.map((dimension) =>
				this.dimensionExecutor!.processGlobalDimension(
					dimension,
					state,
					dependencyGraph,
					options,
				),
			),
		);

		// Apply transformations sequentially (order matters)
		for (const dimension of dimensions) {
			const result = state.globalResults[dimension];

			const newSections = await this.transformationManager.applyTransformation(
				dimension,
				result,
				state,
				this.hookExecutor!,
				options,
			);

			// If transformation changed sections, update state and progress
			if (newSections !== state.sections) {
				const oldCount = state.sections.length;
				const newCount = newSections.length;

				if (oldCount !== newCount && !this.originalSectionResults) {
					this.originalSectionResults = state.sections.map((section, idx) => ({
						section,
						results: state.sectionResultsMap.get(idx) ?? {},
					}));
				}

				state.sections = newSections;

				// Only reset results map if section COUNT changed
				if (oldCount !== newCount) {
					resetSectionResultsMap(state.sectionResultsMap, newCount);

					if (this.progressTracker) {
						this.progressTracker.updateTotalSections(newCount);
					}
				}
			}
		}
	}

	/**
	 * Executes section dimensions across all sections
	 */
	public async executeSectionDimensions(
		dimensions: string[],
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		for (const dimension of dimensions) {
			await this.dimensionExecutor!.processSectionDimension(
				dimension,
				state,
				dependencyGraph,
				options,
			);
		}
	}

	// ============================================================================
	// PHASE 4: FINALIZATION
	// ============================================================================

	async finalizeResults(state: ProcessState): Promise<ProcessResult> {
		const sectionResults = state.sections.map((section, idx) => ({
			section,
			results: state.sectionResultsMap.get(idx) ?? {},
		}));

		const allResults = this.aggregateAllResults(
			sectionResults,
			state.globalResults,
		);

		const finalizedResults = await this.hookExecutor!.finalizeResults(
			allResults,
			state.originalSections,
			state.sections,
			state.globalResults,
			state.id,
			Date.now() - state.startTime,
			state.startTime,
		);

		// Apply finalized results if hook modified them
		const finalSectionResults = finalizedResults
			? applyFinalizedResults(
					sectionResults,
					finalizedResults,
					state.globalResults,
				)
			: sectionResults;

		// ✅ FIX: Merge original and transformed section results for cost calculation
		let costsInput = finalSectionResults;

		if (this.originalSectionResults) {
			// Combine original results (before transformation) with current results (after transformation)
			costsInput = [
				...this.originalSectionResults, // Has: filter_spam, sentiment, categorize
				...finalSectionResults, // Has: analyze_category
			];
		}

		const costs = this.costCalculator?.calculate(
			costsInput,
			state.globalResults,
		);

		// Clear stored results after use
		this.originalSectionResults = undefined;

		return {
			sections: finalSectionResults,
			globalResults: state.globalResults,
			transformedSections: state.sections,
			...(costs && { costs }),
		};
	}

	// ============================================================================
	// PHASE 5: POST-PROCESS
	// ============================================================================

	async postProcess(
		state: ProcessState,
		result: ProcessResult,
		plan: ExecutionPlan,
	): Promise<ProcessResult> {
		const duration = Date.now() - state.startTime;
		const successCount = countSuccessful(state.globalResults, result.sections);
		const failureCount = countFailed(state.globalResults, result.sections);

		const modifiedResult = await this.hookExecutor!.executeAfterProcessComplete(
			state.id,
			state.startTime,
			state.sections,
			state.metadata,
			result,
			duration,
			plan.sortedDimensions,
			successCount,
			failureCount,
		);

		return modifiedResult ?? result;
	}

	// ============================================================================
	// ERROR HANDLING
	// ============================================================================

	async handleFailure(
		state: ProcessState,
		error: unknown,
	): Promise<ProcessResult> {
		const err = error instanceof Error ? error : new Error(String(error));
		const duration = Math.max(Date.now() - state.startTime, 1);

		const partialResult: ProcessResult = {
			sections: state.sections.map((section, idx) => ({
				section,
				results: state.sectionResultsMap.get(idx) ?? {},
			})),
			globalResults: state.globalResults,
			transformedSections: state.sections,
		};

		if (this.hookExecutor) {
			const failureResult = await this.hookExecutor.handleProcessFailure(
				err,
				partialResult,
				state.sections,
				state.id,
				state.startTime,
				duration,
			);

			if (failureResult) {
				return failureResult;
			}
		}

		throw error;
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	private initializeExecutors(
		options: ProcessOptions,
		progressTracker?: ProgressTracker,
	): void {
		this.providerExecutor = new ProviderExecutor(
			this.adapter,
			this.plugin,
			this.hookExecutor!,
			this.config.maxRetries,
			this.config.retryDelay,
		);

		this.dimensionExecutor = new DimensionExecutor(
			this.plugin,
			this.providerExecutor,
			this.hookExecutor!,
			this.dependencyResolver,
			this.queue,
			this.config.timeout,
			this.config.dimensionTimeouts,
			this.config.continueOnError,
			progressTracker,
		);
	}

	private aggregateAllResults(
		sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}>,
		globalResults: Record<string, DimensionResult>,
	): Record<string, DimensionResult> {
		const allResults: Record<string, DimensionResult> = { ...globalResults };

		sectionResults.forEach((sr, idx) => {
			Object.entries(sr.results).forEach(([dim, result]) => {
				allResults[`${dim}_section_${idx}`] = result;
			});
		});

		return allResults;
	}

	private resolveProgressDisplay(
		option: ProgressDisplayOptions | boolean | undefined,
	): ProgressDisplayOptions | undefined {
		if (option === undefined || option === false) {
			return undefined;
		}

		if (option === true) {
			return { display: "bar" };
		}

		return option;
	}

	getProgressTracker(): ProgressTracker | undefined {
		return this.progressTracker;
	}

	getQueue(): PQueue {
		return this.queue;
	}
}
