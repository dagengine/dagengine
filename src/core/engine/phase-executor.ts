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

import { Plugin } from '../../plugin.ts';
import { ProviderAdapter } from '../../providers/adapter.ts';
import { ProcessOptions, ProcessResult, PricingConfig } from '../../types.ts';
import PQueue from 'p-queue';

import { StateManager } from './state-manager.ts';
import { HookExecutor } from '../lifecycle/hook-executor.ts';
import { DependencyGraphManager } from '../analysis/graph-manager.ts';
import { CostCalculator } from '../analysis/cost-calculator.ts';
import { ProviderExecutor } from '../execution/provider-executor.ts';
import { DimensionExecutor } from '../execution/dimension-executor.ts';
import { DependencyResolver } from '../execution/dependency-resolver.ts';
import { TransformationManager } from '../execution/transformation-manager.ts';

import { ExecutionPlan } from '../shared/types.ts';
import { NoSectionsError } from '../shared/errors.ts';
import { countSuccessful, countFailed, applyFinalizedResults } from '../shared/utils.ts';

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
    private readonly config: ExecutionConfig;
    private readonly graphManager: DependencyGraphManager;
    private readonly costCalculator?: CostCalculator;
    private readonly queue: PQueue;

    // Runtime executors (initialized per process)
    private hookExecutor?: HookExecutor;
    private providerExecutor?: ProviderExecutor;
    private dimensionExecutor?: DimensionExecutor;
    private readonly dependencyResolver: DependencyResolver;
    private readonly transformationManager: TransformationManager;

    constructor(
        plugin: Plugin,
        adapter: ProviderAdapter,
        config: ExecutionConfig,
        pricing?: PricingConfig
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

    // ============================================================================
    // PHASE 1: PRE-PROCESS
    // ============================================================================

    /**
     * Phase 1: Pre-process
     *
     * Executes beforeProcessStart hook and validates sections.
     * Hook can modify sections or add metadata.
     *
     * @param stateManager - State manager
     * @param options - Process options
     * @throws {NoSectionsError} If no sections remain after hook
     */
    async preProcess(
        stateManager: StateManager,
        options: ProcessOptions
    ): Promise<void> {
        const state = stateManager.getState();

        // Initialize hook executor
        this.hookExecutor = new HookExecutor(this.plugin, options);

        // Execute beforeProcessStart hook
        const startResult = await this.hookExecutor.executeBeforeProcessStart(
            state.id,
            state.startTime,
            state.sections
        );

        // Apply hook modifications
        if (startResult?.sections) {
            stateManager.updateSections(startResult.sections);
        }
        if (startResult?.metadata) {
            stateManager.setMetadata(startResult.metadata);
        }

        // Validate we have sections to process
        if (stateManager.getSectionCount() === 0) {
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
     *
     * @param stateManager - State manager
     * @param options - Process options
     * @returns Execution plan with sorted dimensions and groups
     */
    async planExecution(
        stateManager: StateManager,
        options: ProcessOptions
    ): Promise<ExecutionPlan> {
        const state = stateManager.getState();

        // Get dependency graph from plugin
        const dependencyGraph = await this.hookExecutor!.executeDefineDependencies(
            state.id,
            state.startTime,
            state.sections,
            state.metadata
        );

        // Build and sort dependency graph
        const allDimensions = this.plugin.getDimensionNames();
        const sortedDimensions = await this.graphManager.buildAndSort(
            allDimensions,
            dependencyGraph
        );

        // Group dimensions for parallel execution
        const executionGroups = this.graphManager.groupForParallelExecution(
            sortedDimensions,
            dependencyGraph
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
     *
     * @param stateManager - State manager
     * @param plan - Execution plan from planning phase
     * @param options - Process options
     */
    async executeDimensions(
        stateManager: StateManager,
        plan: ExecutionPlan,
        options: ProcessOptions
    ): Promise<void> {
        // Initialize runtime executors
        this.initializeExecutors(options);

        // Execute each group sequentially (groups run in parallel internally)
        for (const group of plan.executionGroups) {
            // Separate global and section dimensions
            const globalDims = group.filter(dim => this.plugin.isGlobalDimension(dim));
            const sectionDims = group.filter(dim => !this.plugin.isGlobalDimension(dim));

            // Execute global dimensions first (they may transform sections)
            await this.executeGlobalDimensions(
                globalDims,
                stateManager,
                plan.dependencyGraph,
                options
            );

            // Execute section dimensions
            await this.executeSectionDimensions(
                sectionDims,
                stateManager,
                plan.dependencyGraph,
                options
            );
        }
    }

    /**
     * Executes global dimensions in parallel
     */
    private async executeGlobalDimensions(
        dimensions: string[],
        stateManager: StateManager,
        dependencyGraph: Record<string, string[]>,
        options: ProcessOptions
    ): Promise<void> {
        if (dimensions.length === 0) return;

        const state = stateManager.getState();

        // Execute all global dimensions in parallel
        await Promise.all(
            dimensions.map(dimension =>
                this.dimensionExecutor!.processGlobalDimension(
                    dimension,
                    state,
                    dependencyGraph,
                    options
                )
            )
        );

        // Apply transformations sequentially (order matters)
        for (const dimension of dimensions) {
            const result = stateManager.getGlobalResult(dimension);
            const newSections = await this.transformationManager.applyTransformation(
                dimension,
                result,
                state,
                this.hookExecutor!,
                options
            );

            // Update sections if transformed
            if (newSections !== state.sections) {
                stateManager.updateSections(newSections);
            }
        }
    }

    /**
     * Executes section dimensions across all sections
     */
    private async executeSectionDimensions(
        dimensions: string[],
        stateManager: StateManager,
        dependencyGraph: Record<string, string[]>,
        options: ProcessOptions
    ): Promise<void> {
        const state = stateManager.getState();

        for (const dimension of dimensions) {
            await this.dimensionExecutor!.processSectionDimension(
                dimension,
                state,
                dependencyGraph,
                options
            );
        }
    }

    // ============================================================================
    // PHASE 4: FINALIZATION
    // ============================================================================

    /**
     * Phase 4: Finalization
     *
     * Aggregates results, executes finalizeResults hook, and calculates costs.
     *
     * @param stateManager - State manager
     * @param plan - Execution plan
     * @param options - Process options
     * @returns Process result with all outputs
     */
    async finalizeResults(
        stateManager: StateManager,
        plan: ExecutionPlan,
        options: ProcessOptions
    ): Promise<ProcessResult> {
        const state = stateManager.getState();

        // Build section results
        const sectionResults = this.buildSectionResults(stateManager);

        // Aggregate all results for finalizeResults hook
        const allResults = this.aggregateAllResults(sectionResults, state.globalResults);

        // Execute finalizeResults hook
        const finalizedResults = await this.hookExecutor!.finalizeResults(
            allResults,
            state.sections,
            state.globalResults,
            state.sections,
            state.id,
            Date.now() - state.startTime,
            state.startTime
        );

        // Apply finalized results if hook modified them
        const finalSectionResults = finalizedResults
            ? applyFinalizedResults(sectionResults, finalizedResults, state.globalResults)
            : sectionResults;

        // Calculate costs if pricing is configured
        const costs = this.costCalculator?.calculate(
            finalSectionResults,
            state.globalResults
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
     *
     * @param stateManager - State manager
     * @param result - Process result from finalization
     * @param plan - Execution plan
     * @param options - Process options
     * @returns Final process result (possibly modified by hook)
     */
    async postProcess(
        stateManager: StateManager,
        result: ProcessResult,
        plan: ExecutionPlan,
        options: ProcessOptions
    ): Promise<ProcessResult> {
        const state = stateManager.getState();
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
            failureCount
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
     *
     * @param stateManager - State manager
     * @param error - Error that occurred
     * @param options - Process options
     * @returns Process result (possibly recovered by hook)
     * @throws Re-throws error if hook doesn't provide recovery
     */
    async handleFailure(
        stateManager: StateManager,
        error: unknown,
        options: ProcessOptions
    ): Promise<ProcessResult> {
        const err = error instanceof Error ? error : new Error(String(error));
        const state = stateManager.getState();
        const duration = Math.max(Date.now() - state.startTime, 1);

        // Build partial result
        const partialResult: ProcessResult = {
            sections: this.buildSectionResults(stateManager),
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
                duration
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
    private initializeExecutors(options: ProcessOptions): void {
        this.providerExecutor = new ProviderExecutor(
            this.adapter,
            this.plugin,
            this.hookExecutor!,
            this.config.maxRetries,
            this.config.retryDelay
        );

        this.dimensionExecutor = new DimensionExecutor(
            this.plugin,
            this.providerExecutor,
            this.hookExecutor!,
            this.dependencyResolver,
            this.queue,
            this.config.timeout,
            this.config.dimensionTimeouts,
            this.config.continueOnError
        );
    }

    /**
     * Builds section results array from state
     */
    private buildSectionResults(stateManager: StateManager) {
        const state = stateManager.getState();
        return state.sections.map((section, idx) => ({
            section,
            results: stateManager.getSectionResults(idx),
        }));
    }

    /**
     * Aggregates all results for finalizeResults hook
     */
    private aggregateAllResults(
        sectionResults: Array<{ section: any; results: Record<string, any> }>,
        globalResults: Record<string, any>
    ): Record<string, any> {
        const allResults: Record<string, any> = { ...globalResults };

        sectionResults.forEach((sr, idx) => {
            Object.entries(sr.results).forEach(([dim, result]) => {
                allResults[`${dim}_section_${idx}`] = result;
            });
        });

        return allResults;
    }

    /**
     * Gets the execution queue
     *
     * @returns PQueue instance used for concurrency control
     */
    getQueue(): PQueue {
        return this.queue;
    }
}