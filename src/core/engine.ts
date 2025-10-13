import { Plugin } from '../plugin.ts';
import { ProviderAdapter, ProviderAdapterConfig } from '../providers/adapter.ts';
import { ProviderRegistry } from '../providers/registry.ts';
import {
  SectionData,
  DimensionResult,
  PricingConfig,
  ProcessOptions,
  ProcessResult,
} from '../types.ts';
import PQueue from 'p-queue';
import crypto from 'crypto';

import { HookExecutor } from './lifecycle/hook-executor.ts';
import { DependencyGraphManager } from './graph-manager.ts';
import { CostCalculator } from './analysis';
import { ProviderExecutor } from './execution';

import { DEFAULT_ENGINE_CONFIG } from './constants.ts';
import {
  validateEngineConfig,
  initializeProviderAdapter,
  resetSectionResultsMap,
  applyFinalizedResults,
  countSuccessful,
  countFailed,
} from './utils.ts';
import {
  DimensionExecutor,
  TransformationManager,
  DependencyResolver,
} from './executors/index.ts';

/**
 * Engine configuration interface
 */
export interface EngineConfig {
  plugin: Plugin;
  providers?: ProviderAdapter | ProviderAdapterConfig;
  registry?: ProviderRegistry;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  continueOnError?: boolean;
  timeout?: number;
  dimensionTimeouts?: Record<string, number>;
  pricing?: PricingConfig;
}

/**
 * Graph analytics export interface
 */
export interface GraphAnalytics {
  totalDimensions: number;
  totalDependencies: number;
  maxDepth: number;
  criticalPath: string[];
  parallelGroups: string[][];
  independentDimensions: string[];
  bottlenecks: string[];
}

/**
 * Process state container
 */
interface ProcessState {
  id: string;
  startTime: number;
  metadata?: any;
  sections: SectionData[];
  globalResults: Record<string, DimensionResult>;
  sectionResultsMap: Map<number, Record<string, DimensionResult>>;
}

/**
 * DagEngine - AI-powered workflow orchestration engine
 *
 * Orchestrates the execution of AI dimensions across multiple sections with
 * dependency management, parallel execution, and comprehensive error handling.
 */
export class DagEngine {
  // Core dependencies
  private readonly plugin: Plugin;
  private readonly adapter: ProviderAdapter;
  private readonly queue: PQueue;

  // Specialized managers
  private readonly graphManager: DependencyGraphManager;
  private readonly costCalculator?: CostCalculator;
  private readonly dependencyResolver: DependencyResolver;
  private readonly transformationManager: TransformationManager;

  // Runtime executors (initialized per process)
  private hookExecutor?: HookExecutor;
  private providerExecutor?: ProviderExecutor;
  private dimensionExecutor?: DimensionExecutor;

  // Configuration (kept as individual fields for backward compatibility with tests)
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly continueOnError: boolean;
  private readonly timeout: number;
  private readonly dimensionTimeouts: Record<string, number>;
  private readonly concurrency: number;

  // Process state
  private cachedDependencyGraph?: Record<string, string[]>;

  constructor(config: EngineConfig) {
    validateEngineConfig(config);

    this.plugin = config.plugin;
    this.maxRetries = config.maxRetries ?? DEFAULT_ENGINE_CONFIG.MAX_RETRIES;
    this.retryDelay = config.retryDelay ?? DEFAULT_ENGINE_CONFIG.RETRY_DELAY;
    this.continueOnError = config.continueOnError ?? DEFAULT_ENGINE_CONFIG.CONTINUE_ON_ERROR;
    this.timeout = config.timeout ?? DEFAULT_ENGINE_CONFIG.TIMEOUT;
    this.dimensionTimeouts = config.dimensionTimeouts ?? {};
    this.concurrency = config.concurrency ?? DEFAULT_ENGINE_CONFIG.CONCURRENCY;

    // Initialize managers
    this.graphManager = new DependencyGraphManager(this.plugin);
    this.dependencyResolver = new DependencyResolver(this.plugin);
    this.transformationManager = new TransformationManager(this.plugin);

    if (config.pricing) {
      this.costCalculator = new CostCalculator(config.pricing);
    }

    // Initialize execution queue
    this.queue = new PQueue({ concurrency: this.concurrency });

    // Initialize provider adapter
    this.adapter = initializeProviderAdapter(config);
  }

  /**
   * Main orchestration method - processes sections through all dimensions
   */
  async process(sections: SectionData[], options: ProcessOptions = {}): Promise<ProcessResult> {
    const state = this.initializeProcessState(sections);

    // Initialize runtime executors
    this.initializeExecutors(state, options);

    try {
      await this.executePreProcessPhase(state, options);
      const { sortedDimensions, executionGroups } = await this.buildExecutionPlan(state, options);
      await this.executeDimensionsPhase(state, executionGroups, options);
      const result = await this.finalizeResultsPhase(state, sortedDimensions, options);

      return await this.executePostProcessPhase(result, state, sortedDimensions, options);
    } catch (error) {
      return await this.handleProcessError(error, state, options);
    }
  }

  // ==================== PUBLIC API ====================

  async getGraphAnalytics(): Promise<GraphAnalytics> {
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph ?? {};
    return this.graphManager.getAnalytics(dimensions, deps);
  }

  async exportGraphDOT(): Promise<string> {
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph ?? {};
    return this.graphManager.exportDOT(dimensions, deps);
  }

  async exportGraphJSON(): Promise<{ nodes: any[]; links: any[] }> {
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph ?? {};
    return this.graphManager.exportJSON(dimensions, deps);
  }

  getAdapter(): ProviderAdapter {
    return this.adapter;
  }

  getAvailableProviders(): string[] {
    return this.adapter.listProviders();
  }

  getQueue(): PQueue {
    return this.queue;
  }

  // ==================== INITIALIZATION ====================

  private initializeProcessState(sections: SectionData[]): ProcessState {
    return {
      id: crypto.randomUUID(),
      startTime: Date.now(),
      sections: [...sections],
      globalResults: {},
      sectionResultsMap: new Map(sections.map((_, idx) => [idx, {}])),
    };
  }

  private initializeExecutors(state: ProcessState, options: ProcessOptions): void {
    this.hookExecutor = new HookExecutor(this.plugin, options);
    this.providerExecutor = new ProviderExecutor(
        this.adapter,
        this.plugin,
        this.hookExecutor,
        this.maxRetries,
        this.retryDelay
    );
    this.dimensionExecutor = new DimensionExecutor(
        this.plugin,
        this.providerExecutor,
        this.hookExecutor,
        this.dependencyResolver,
        this.queue,
        this.timeout,
        this.dimensionTimeouts,
        this.continueOnError
    );
  }

  // ==================== PHASE 1: PRE-PROCESS ====================

  private async executePreProcessPhase(
      state: ProcessState,
      options: ProcessOptions
  ): Promise<void> {
    const startResult = await this.hookExecutor!.executeBeforeProcessStart(
        state.id,
        state.startTime,
        state.sections
    );

    if (startResult?.sections) {
      state.sections = startResult.sections;
    }
    if (startResult?.metadata) {
      state.metadata = startResult.metadata;
    }

    if (state.sections.length === 0) {
      throw new Error('DagEngine.process() requires at least one section');
    }
  }

  // ==================== PHASE 2: BUILD EXECUTION PLAN ====================

  private async buildExecutionPlan(
      state: ProcessState,
      options: ProcessOptions
  ): Promise<{ sortedDimensions: string[]; executionGroups: string[][] }> {
    const dependencyGraph = await this.hookExecutor!.executeDefineDependencies(
        state.id,
        state.startTime,
        state.sections,
        state.metadata
    );
    this.cachedDependencyGraph = dependencyGraph;

    const allDimensions = this.plugin.getDimensionNames();
    const sortedDimensions = await this.graphManager.buildAndSort(
        allDimensions,
        dependencyGraph
    );

    const executionGroups = this.graphManager.groupForParallelExecution(
        sortedDimensions,
        dependencyGraph
    );

    return { sortedDimensions, executionGroups };
  }

  // ==================== PHASE 3: EXECUTE DIMENSIONS ====================

  private async executeDimensionsPhase(
      state: ProcessState,
      executionGroups: string[][],
      options: ProcessOptions
  ): Promise<void> {
    for (const group of executionGroups) {
      const globalDims = group.filter(dim => this.plugin.isGlobalDimension(dim));
      const sectionDims = group.filter(dim => !this.plugin.isGlobalDimension(dim));

      await this.executeGlobalDimensions(globalDims, state, options);
      await this.executeSectionDimensions(sectionDims, state, options);
    }
  }

  private async executeGlobalDimensions(
      dimensions: string[],
      state: ProcessState,
      options: ProcessOptions
  ): Promise<void> {
    if (dimensions.length === 0) return;

    await Promise.all(
        dimensions.map(dimension =>
            this.dimensionExecutor!.processGlobalDimension(
                dimension,
                state,
                this.cachedDependencyGraph ?? {},
                options
            )
        )
    );

    // Apply transformations sequentially
    for (const dimension of dimensions) {
      state.sections = await this.transformationManager.applyTransformation(
          dimension,
          state.globalResults[dimension],
          state,
          this.hookExecutor!,
          options
      );
    }
  }

  private async executeSectionDimensions(
      dimensions: string[],
      state: ProcessState,
      options: ProcessOptions
  ): Promise<void> {
    for (const dimension of dimensions) {
      await this.dimensionExecutor!.processSectionDimension(
          dimension,
          state,
          this.cachedDependencyGraph ?? {},
          options
      );
    }
  }

  // ==================== PHASE 4: FINALIZE RESULTS ====================

  private async finalizeResultsPhase(
      state: ProcessState,
      sortedDimensions: string[],
      options: ProcessOptions
  ): Promise<ProcessResult> {
    const sectionResults = this.buildSectionResults(state);
    const allResults = this.aggregateAllResults(sectionResults, state.globalResults);

    const finalizedResults = await this.hookExecutor!.finalizeResults(
        allResults,
        state.sections,
        state.globalResults,
        state.sections,
        state.id,
        Date.now() - state.startTime,
        state.startTime
    );

    const finalSectionResults = finalizedResults
        ? applyFinalizedResults(sectionResults, finalizedResults, state.globalResults)
        : sectionResults;

    const costs = this.costCalculator?.calculate(finalSectionResults, state.globalResults);

    return {
      sections: finalSectionResults,
      globalResults: state.globalResults,
      transformedSections: state.sections,
      ...(costs && { costs }),
    };
  }

  // ==================== PHASE 5: POST-PROCESS ====================

  private async executePostProcessPhase(
      result: ProcessResult,
      state: ProcessState,
      sortedDimensions: string[],
      options: ProcessOptions
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
        sortedDimensions,
        successCount,
        failureCount
    );

    return modifiedResult ?? result;
  }

  // ==================== ERROR HANDLING ====================

  private async handleProcessError(
      error: unknown,
      state: ProcessState,
      options: ProcessOptions
  ): Promise<ProcessResult> {
    const err = error instanceof Error ? error : new Error(String(error));
    const duration = Math.max(Date.now() - state.startTime, 1);

    const partialResult: ProcessResult = {
      sections: this.buildSectionResults(state),
      globalResults: state.globalResults,
      transformedSections: state.sections,
    };

    const failureResult = await this.hookExecutor!.handleProcessFailure(
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

    throw error;
  }

  // ==================== HELPER METHODS ====================

  private buildSectionResults(
      state: ProcessState
  ): Array<{ section: SectionData; results: Record<string, DimensionResult> }> {
    return state.sections.map((section, idx) => ({
      section,
      results: state.sectionResultsMap.get(idx) ?? {},
    }));
  }

  private aggregateAllResults(
      sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>,
      globalResults: Record<string, DimensionResult>
  ): Record<string, DimensionResult> {
    const allResults: Record<string, DimensionResult> = { ...globalResults };

    sectionResults.forEach((sr, idx) => {
      Object.entries(sr.results).forEach(([dim, result]) => {
        allResults[`${dim}_section_${idx}`] = result;
      });
    });

    return allResults;
  }
}