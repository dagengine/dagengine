/**
 * Phase executor for orchestrating workflow execution
 *
 * Handles the 5-phase execution model:
 * 1. Pre-process (beforeProcessStart hook)
 * 2. Planning (build dependency graph and execution plan)
 * 3. Execution (run dimensions in parallel groups)
 * 4. Finalization (finalizeResults hook and cost calculation)
 * 5. Post-process (afterProcessComplete hook)
 *
 * @module engine/phase-executor
 */

import type { Plugin } from "../../plugin.ts";
import type { ProviderAdapter } from "../../providers/adapter.ts";
import type {
	ProcessOptions,
	ProcessResult,
	PricingConfig,
	SectionData,
} from "../../types.ts";
import PQueue from "p-queue";

import { updateStateSections } from "../engine/state-manager.ts";
import { HookExecutor } from "../lifecycle/hook-executor.ts";
import { DependencyGraphManager } from "../analysis/graph-manager.ts";
import { CostCalculator } from "../analysis/cost-calculator.ts";
import { ProviderExecutor } from "./provider-executor.ts";
import { DimensionExecutor } from "./dimension-executor.ts";
import { DependencyResolver } from "./dependency-resolver.ts";
import { TransformationManager } from "./transformation-manager.ts";

import type { ExecutionPlan, ProcessState } from "../shared/types.ts";
import { NoSectionsError } from "../shared/errors.ts";
import { DimensionResult } from "../../types.ts";
import {
	countSuccessful,
	countFailed,
	applyFinalizedResults,
} from "../shared/utils.ts";

/**
 * Execution configuration
 */
interface ExecutionConfig {
	concurrency: number;
	maxRetries: number;
	retryDelay: number;
	continueOnError: boolean;
	timeout: number;
	dimensionTimeouts: Record<string, number>;
}

/**
 * Orchestrates the 5-phase execution model
 *
 * Separates the workflow into clear phases with single responsibilities.
 * Each phase can be tested independently and has well-defined inputs/outputs.
 */
export class PhaseExecutor {
	private readonly plugin: Plugin;
	private readonly adapter: ProviderAdapter;
	public readonly config: ExecutionConfig;
	private readonly graphManager: DependencyGraphManager;
	private readonly costCalculator?: CostCalculator;
	private readonly queue: PQueue;

	// Stateless managers (reusable)
	private readonly dependencyResolver: DependencyResolver;
	private readonly transformationManager: TransformationManager;

	// Runtime executors (initialized per process)
	private hookExecutor?: HookExecutor;
	private providerExecutor?: ProviderExecutor;
	private dimensionExecutor?: DimensionExecutor;

	constructor(
		plugin: Plugin,
		adapter: ProviderAdapter,
		config: ExecutionConfig,
		pricing?: PricingConfig,
	) {
		this.plugin = plugin;
		this.adapter = adapter;
		this.config = config;

		// Initialize managers
		this.graphManager = new DependencyGraphManager(plugin);
		this.dependencyResolver = new DependencyResolver(plugin);
		this.transformationManager = new TransformationManager(plugin);

		if (pricing) {
			this.costCalculator = new CostCalculator(pricing);
		}

		// Initialize execution queue
		this.queue = new PQueue({ concurrency: config.concurrency });
	}

	getPlugin(): Plugin {
		return this.plugin;
	}
	// ============================================================================
	// PHASE 1: PRE-PROCESS
	// ============================================================================

	/**
	 * Phase 1: Pre-process
	 *
	 * Executes beforeProcessStart hook and validates sections.
	 * Hook can modify sections or add metadata.
	 */
	async preProcess(
		state: ProcessState,
		options: ProcessOptions,
	): Promise<void> {
		// Initialize hook executor
		this.hookExecutor = new HookExecutor(this.plugin, options);

		// Execute beforeProcessStart hook
		const startResult = await this.hookExecutor.executeBeforeProcessStart(
			state.id,
			state.startTime,
			state.sections,
		);

		// Apply hook modifications
		if (startResult?.sections) {
			updateStateSections(state, startResult.sections);
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

	/**
	 * Phase 2: Planning
	 *
	 * Builds dependency graph, performs topological sort, and creates
	 * parallel execution groups.
	 */
	async planExecution(
		state: ProcessState,
	): Promise<ExecutionPlan> {
		// Get dependency graph from plugin
		const dependencyGraph = await this.hookExecutor!.executeDefineDependencies(
			state.id,
			state.startTime,
			state.sections,
			state.metadata,
		);

		// Build and sort dependency graph
		const allDimensions = this.plugin.getDimensionNames();
		const sortedDimensions = await this.graphManager.buildAndSort(
			allDimensions,
			dependencyGraph,
		);

		// Group dimensions for parallel execution
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
		// Initialize runtime executors
		this.initializeExecutors(options);

		// Execute each group sequentially (groups run in parallel internally)
		for (const group of plan.executionGroups) {
			// Separate global and section dimensions
			const globalDims = group.filter((dim) =>
				this.plugin.isGlobalDimension(dim),
			);
			const sectionDims = group.filter(
				(dim) => !this.plugin.isGlobalDimension(dim),
			);

			// Execute global dimensions first (they may transform sections)
			await this.executeGlobalDimensions(
				globalDims,
				state,
				plan.dependencyGraph,
				options,
			);

			// Execute section dimensions
			await this.executeSectionDimensions(
				sectionDims,
				state,
				plan.dependencyGraph,
				options,
			);
		}
	}

	/**
	 * Executes global dimensions in parallel
	 */
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

			// Update sections if transformed
			if (newSections !== state.sections) {
				updateStateSections(state, newSections);
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

	public async executeGroup(
		globalDims: string[],
		sectionDims: string[],
		state: ProcessState,
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		await this.executeGlobalDimensions(
			globalDims,
			state,
			dependencyGraph,
			options,
		);
		await this.executeSectionDimensions(
			sectionDims,
			state,
			dependencyGraph,
			options,
		);
	}

	// ============================================================================
	// PHASE 4: FINALIZATION
	// ============================================================================

	/**
	 * Phase 4: Finalization
	 *
	 * Aggregates results, executes finalizeResults hook, and calculates costs.
	 */
	async finalizeResults(
		state: ProcessState,
	): Promise<ProcessResult> {
		// Build section results
		const sectionResults = state.sections.map((section, idx) => ({
			section,
			results: state.sectionResultsMap.get(idx) ?? {},
		}));

		// Aggregate all results for finalizeResults hook
		const allResults = this.aggregateAllResults(
			sectionResults,
			state.globalResults,
		);

		// Execute finalizeResults hook
		const finalizedResults = await this.hookExecutor!.finalizeResults(
			allResults,
			state.sections,
			state.globalResults,
			state.sections,
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

		// Calculate costs if pricing is configured
		const costs = this.costCalculator?.calculate(
			finalSectionResults,
			state.globalResults,
		);

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

	/**
	 * Phase 5: Post-process
	 *
	 * Executes afterProcessComplete hook with statistics.
	 * Hook can modify the final result.
	 */
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

	/**
	 * Handles process failure
	 *
	 * Builds partial results and executes handleProcessFailure hook.
	 */
	async handleFailure(
		state: ProcessState,
		error: unknown,
	): Promise<ProcessResult> {
		const err = error instanceof Error ? error : new Error(String(error));
		const duration = Math.max(Date.now() - state.startTime, 1);

		// Build partial result
		const partialResult: ProcessResult = {
			sections: state.sections.map((section, idx) => ({
				section,
				results: state.sectionResultsMap.get(idx) ?? {},
			})),
			globalResults: state.globalResults,
			transformedSections: state.sections,
		};

		// Try to recover via hook
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

		// No recovery, re-throw
		throw error;
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	/**
	 * Initializes runtime executors
	 */
	private initializeExecutors(_options: ProcessOptions): void {
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
		);
	}

	/**
	 * Aggregates all results for finalizeResults hook
	 */
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

	/**
	 * Gets the execution queue
	 */
	getQueue(): PQueue {
		return this.queue;
	}
}
