import { Plugin } from '../plugin.ts';
import { ProviderAdapter, ProviderAdapterConfig } from '../providers/adapter.ts';
import { ProviderRegistry } from '../providers/registry.ts';
import {
  SectionData,
  DimensionResult,
  DimensionDependencies,
  PricingConfig,
  ProcessOptions,
  ProcessResult,
  DimensionContext,
  SectionDimensionContext,
  ProviderRequest,
} from '../types.ts';
import PQueue from 'p-queue';
import crypto from 'crypto';
import { HookExecutor } from './hook-executor.ts';
import { DependencyGraphManager } from './graph-manager.ts';
import { CostCalculator } from './cost-calculator.ts';
import { ProviderExecutor } from './provider-executor.ts';

/**
 * Engine configuration
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
 * DagEngine - AI-powered workflow orchestration (Refactored & Enterprise-Ready)
 */
export class DagEngine {
  // Core components
  private readonly plugin: Plugin;
  private readonly adapter: ProviderAdapter;
  private readonly queue: PQueue;

  // Specialized managers
  private readonly graphManager: DependencyGraphManager;
  private readonly costCalculator?: CostCalculator;
  private hookExecutor?: HookExecutor;
  private providerExecutor?: ProviderExecutor;

  // Configuration
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly continueOnError: boolean;
  private readonly timeout: number;
  private readonly dimensionTimeouts: Record<string, number>;
  private readonly concurrency: number;

  // Process-level state
  private processId: string = '';
  private processStartTime: number = 0;
  private processMetadata: any = undefined;
  private cachedDependencyGraph?: Record<string, string[]>;

  constructor(config: EngineConfig) {
    this.validateConfig(config);

    this.plugin = config.plugin;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.continueOnError = config.continueOnError ?? true;
    this.timeout = config.timeout ?? 60000;
    this.dimensionTimeouts = config.dimensionTimeouts ?? {};
    this.concurrency = config.concurrency ?? 5;

    // Initialize specialized managers
    this.graphManager = new DependencyGraphManager(this.plugin);
    if (config.pricing) {
      this.costCalculator = new CostCalculator(config.pricing);
    }

    // Initialize queue
    this.queue = new PQueue({ concurrency: this.concurrency });

    // Initialize provider adapter
    this.adapter = this.initializeAdapter(config);
  }

  /**
   * Main process method - orchestrates the entire workflow
   */
  async process(sections: SectionData[], options: ProcessOptions = {}): Promise<ProcessResult> {
    // Initialize process state
    this.initializeProcessState();

    // Initialize runtime-dependent executors
    this.hookExecutor = new HookExecutor(this.plugin, options);
    this.providerExecutor = new ProviderExecutor(
        this.adapter,
        this.plugin,
        this.hookExecutor,
        this.maxRetries,
        this.retryDelay
    );

    // State to track for failure handling - declared at function scope
    let currentSections: SectionData[] = [];
    const globalResults: Record<string, DimensionResult> = {};
    const sectionResultsMap = new Map<number, Record<string, DimensionResult>>();

    try {
      // Phase 1: Pre-process hooks and setup
      const processedSections = await this.executePreProcessPhase(sections, options);
      currentSections = [...processedSections];

      // Initialize section results map
      currentSections.forEach((_, idx) => sectionResultsMap.set(idx, {}));

      // Phase 2: Build dependency graph
      const { sortedDimensions, executionGroups } = await this.buildExecutionPlan(
          processedSections,
          options
      );

      // Phase 3: Execute dimensions - pass references so they're updated in place
      const executionResult = await this.executeDimensionsPhaseWithState(
          processedSections,
          executionGroups,
          globalResults,
          sectionResultsMap,
          options
      );

      // Update current sections from execution result
      currentSections = executionResult.currentSections;

      // Phase 4: Finalize results
      const result = await this.finalizeResultsPhase(
          executionResult.finalSectionResults,
          executionResult.globalResults,
          executionResult.currentSections,
          sortedDimensions,
          options
      );

      // Phase 5: Post-process hooks
      return await this.executePostProcessPhase(
          result,
          processedSections,
          sortedDimensions,
          executionResult.globalResults,
          executionResult.finalSectionResults.map((_, idx) => idx),
          options
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Calculate duration for failure context
      const duration = Date.now() - this.processStartTime;

      // Use the mutable references that were updated during execution
      return await this.handleProcessError(
          err,
          sections,
          globalResults,
          currentSections,
          sectionResultsMap,
          options,
          duration
      );
    }
  }

  // ===== PUBLIC API METHODS =====

  async getGraphAnalytics(): Promise<GraphAnalytics> {
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph || {};
    return this.graphManager.getAnalytics(dimensions, deps);
  }

  async exportGraphDOT(): Promise<string> {
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph || {};
    return this.graphManager.exportDOT(dimensions, deps);
  }

  async exportGraphJSON(): Promise<{ nodes: any[]; links: any[] }> {
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph || {};
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

  // ===== PHASE 1: PRE-PROCESS =====

  private async executePreProcessPhase(
      sections: SectionData[],
      options: ProcessOptions
  ): Promise<SectionData[]> {
    const startResult = await this.hookExecutor!.executeBeforeProcessStart(
        this.processId,
        this.processStartTime,
        sections
    );

    if (startResult?.sections) {
      sections = startResult.sections;
    }
    if (startResult?.metadata) {
      this.processMetadata = startResult.metadata;
    }

    if (!sections.length) {
      throw new Error('DagEngine.process() requires at least one section');
    }

    return sections;
  }

  // ===== PHASE 2: BUILD EXECUTION PLAN =====

  private async buildExecutionPlan(
      sections: SectionData[],
      options: ProcessOptions
  ): Promise<{ sortedDimensions: string[]; executionGroups: string[][] }> {
    // Define dependencies
    const dependencyGraph = await this.hookExecutor!.executeDefineDependencies(
        this.processId,
        this.processStartTime,
        sections,
        this.processMetadata
    );
    this.cachedDependencyGraph = dependencyGraph;

    // Topological sort
    const allDimensions = this.plugin.getDimensionNames();
    const sortedDimensions = await this.graphManager.buildAndSort(
        allDimensions,
        dependencyGraph
    );

    // Group for parallel execution
    const executionGroups = this.graphManager.groupForParallelExecution(
        sortedDimensions,
        dependencyGraph
    );

    return { sortedDimensions, executionGroups };
  }

  // ===== PHASE 3: EXECUTE DIMENSIONS =====

  private async executeDimensionsPhaseWithState(
      sections: SectionData[],
      executionGroups: string[][],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<{
    finalSectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>;
    globalResults: Record<string, DimensionResult>;
    currentSections: SectionData[];
  }> {
    let currentSections = [...sections];

    // Execute each group
    for (const group of executionGroups) {
      const globalDims = group.filter((dim) => this.plugin.isGlobalDimension(dim));
      const sectionDims = group.filter((dim) => !this.plugin.isGlobalDimension(dim));

      // Execute global dimensions
      if (globalDims.length > 0) {
        await Promise.all(
            globalDims.map((dimension) =>
                this.processGlobalDimension(
                    dimension,
                    currentSections,
                    globalResults,
                    sectionResultsMap,
                    options
                )
            )
        );

        // Apply transformations sequentially
        for (const dimension of globalDims) {
          currentSections = await this.applyTransformation(
              dimension,
              globalResults[dimension],
              currentSections,
              sectionResultsMap,
              options
          );
        }
      }

      // Execute section dimensions
      // If continueOnError is false, errors will bubble up from here
      for (const dimension of sectionDims) {
        await this.processSectionDimension(
            dimension,
            currentSections,
            globalResults,
            sectionResultsMap,
            options
        );
      }
    }

    // Build final section results
    const finalSectionResults = await Promise.all(
        currentSections.map(async (section, idx) => {
          const results = sectionResultsMap.get(idx) || {};
          return { section, results };
        })
    );

    return { finalSectionResults, globalResults, currentSections };
  }

  // ===== PHASE 4: FINALIZE RESULTS =====

  private async finalizeResultsPhase(
      sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>,
      globalResults: Record<string, DimensionResult>,
      transformedSections: SectionData[],
      sortedDimensions: string[],
      options: ProcessOptions
  ): Promise<ProcessResult> {
    let finalizedSectionResults = sectionResults;

    // Execute finalizeResults hook
    const allResults: Record<string, DimensionResult> = {};
    sectionResults.forEach((sr, idx) => {
      Object.entries(sr.results).forEach(([dim, result]) => {
        allResults[`${dim}_section_${idx}`] = result;
      });
    });
    Object.assign(allResults, globalResults);

    const finalizedResults = await this.hookExecutor!.finalizeResults(
        allResults,
        transformedSections,
        globalResults,
        transformedSections,
        this.processId,
        Date.now() - this.processStartTime,
        this.processStartTime
    );

    if (finalizedResults) {
      finalizedSectionResults = this.applyFinalizedResults(
          sectionResults,
          finalizedResults,
          globalResults
      );
    }

    // Calculate costs
    const costs = this.costCalculator
        ? this.costCalculator.calculate(finalizedSectionResults, globalResults)
        : undefined;

    return {
      sections: finalizedSectionResults,
      globalResults,
      transformedSections,
      ...(costs && { costs }),
    };
  }

  // ===== PHASE 5: POST-PROCESS =====

  private async executePostProcessPhase(
      result: ProcessResult,
      sections: SectionData[],
      sortedDimensions: string[],
      globalResults: Record<string, DimensionResult>,
      sectionIndices: number[],
      options: ProcessOptions
  ): Promise<ProcessResult> {
    const modifiedResult = await this.hookExecutor!.executeAfterProcessComplete(
        this.processId,
        this.processStartTime,
        sections,
        this.processMetadata,
        result,
        Date.now() - this.processStartTime,
        sortedDimensions,
        this.countSuccessful(globalResults, result.sections),
        this.countFailed(globalResults, result.sections)
    );

    return modifiedResult || result;
  }

  // ===== DIMENSION PROCESSING =====

  private async processGlobalDimension(
      dimension: string,
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    try {
      options.onDimensionStart?.(dimension);

      const dependencies = await this.resolveGlobalDependencies(
          dimension,
          globalResults,
          sectionResultsMap,
          sections.length
      );

      const context: DimensionContext = {
        processId: this.processId,
        timestamp: Date.now(),
        dimension,
        isGlobal: true,
        sections,
        dependencies,
        globalResults,
      };

      // Check if should skip
      const skipResult = await this.hookExecutor!.shouldSkipGlobalDimension(context);
      if (skipResult === true) {
        globalResults[dimension] = {
          data: { skipped: true, reason: 'Skipped by plugin shouldSkipGlobalDimension' },
        };
        options.onDimensionComplete?.(dimension, globalResults[dimension]);
        return;
      }

      if (skipResult && typeof skipResult === 'object' && skipResult.skip && skipResult.result) {
        globalResults[dimension] = {
          ...skipResult.result,
          metadata: { ...skipResult.result.metadata, cached: true },
        };
        options.onDimensionComplete?.(dimension, globalResults[dimension]);
        return;
      }

      // Transform dependencies
      const transformedDeps = await this.hookExecutor!.transformDependencies(context);
      context.dependencies = transformedDeps;

      // Check for failed dependencies
      if (!this.continueOnError && this.hasFailedDependencies(transformedDeps)) {
        throw new Error(`Dependencies failed for dimension "${dimension}"`);
      }

      // Execute dimension
      await this.hookExecutor!.executeBeforeDimension(context);

      const startTime = Date.now();
      const result = await this.executeWithTimeout(
          () => this.providerExecutor!.execute(dimension, sections, transformedDeps, true, context),
          dimension
      );
      const duration = Date.now() - startTime;

      globalResults[dimension] = result;

      await this.hookExecutor!.executeAfterDimension({
        ...context,
        request: { input: '', options: {} },
        provider: result.metadata?.provider || 'unknown',
        providerOptions: {},
        result,
        duration,
        ...(result.metadata?.tokens && { tokensUsed: result.metadata.tokens }),
      });

      options.onDimensionComplete?.(dimension, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(`global-${dimension}`, err);
      globalResults[dimension] = { error: err.message };
    }
  }

  private async processSectionDimension(
      dimension: string,
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    options.onDimensionStart?.(dimension);

    const tasks = sections.map((section, sectionIdx) => async () => {
      try {
        if (sectionIdx === 0) options.onSectionStart?.(sectionIdx, sections.length);

        const sectionResults = sectionResultsMap.get(sectionIdx) || {};
        const dependencies = await this.resolveDependencies(
            dimension,
            sectionResults,
            globalResults
        );

        const context: SectionDimensionContext = {
          processId: this.processId,
          timestamp: Date.now(),
          dimension,
          isGlobal: false,
          sections: [section],
          dependencies,
          globalResults,
          section,
          sectionIndex: sectionIdx,
        };

        // Check if should skip
        const skipResult = await this.hookExecutor!.shouldSkipSectionDimension(context);
        if (skipResult === true) {
          sectionResults[dimension] = {
            data: { skipped: true, reason: 'Skipped by plugin shouldSkipDimension' },
          };
          sectionResultsMap.set(sectionIdx, sectionResults);
          if (sectionIdx === 0) options.onSectionComplete?.(sectionIdx, sections.length);
          return;
        }

        if (skipResult && typeof skipResult === 'object' && skipResult.skip && skipResult.result) {
          sectionResults[dimension] = {
            ...skipResult.result,
            metadata: { ...skipResult.result.metadata, cached: true },
          };
          sectionResultsMap.set(sectionIdx, sectionResults);
          if (sectionIdx === 0) options.onSectionComplete?.(sectionIdx, sections.length);
          return;
        }

        // Transform dependencies
        const transformedDeps = await this.hookExecutor!.transformDependencies(context);
        context.dependencies = transformedDeps;

        if (!this.continueOnError && this.hasFailedDependencies(transformedDeps)) {
          throw new Error(`Dependencies failed for dimension "${dimension}"`);
        }

        // Execute dimension
        await this.hookExecutor!.executeBeforeDimension(context);

        const startTime = Date.now();
        const result = await this.executeWithTimeout(
            () =>
                this.providerExecutor!.execute(dimension, [section], transformedDeps, false, context),
            dimension
        );
        const duration = Date.now() - startTime;

        sectionResults[dimension] = result;
        sectionResultsMap.set(sectionIdx, sectionResults);

        await this.hookExecutor!.executeAfterDimension({
          ...context,
          request: { input: '', options: {} },
          provider: result.metadata?.provider || 'unknown',
          providerOptions: {},
          result,
          duration,
          ...(result.metadata?.tokens && { tokensUsed: result.metadata.tokens }),
        });

        if (sectionIdx === 0) options.onSectionComplete?.(sectionIdx, sections.length);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`Error processing dimension "${dimension}" for section ${sectionIdx}:`, err.message);
        options.onError?.(`section-${sectionIdx}-${dimension}`, err);

        const sectionResults = sectionResultsMap.get(sectionIdx) || {};
        sectionResults[dimension] = { error: err.message };
        sectionResultsMap.set(sectionIdx, sectionResults);

        // Always re-throw if continueOnError is false
        if (!this.continueOnError) {
          throw error;
        }
      }
    });

    // If continueOnError is false, any error will be thrown by the task and caught here
    try {
      await this.queue.addAll(tasks);
    } catch (error) {
      // Re-throw to bubble up to executeDimensionsPhase
      throw error;
    }

    options.onDimensionComplete?.(dimension, { data: 'Section dimension complete' });
  }

  // ===== TRANSFORMATION HANDLING =====

  private async applyTransformation(
      dimension: string,
      result: DimensionResult | undefined,
      currentSections: SectionData[],
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<SectionData[]> {
    const config = this.plugin.getDimensionConfig(dimension);

    // Legacy transform
    if (config.transform && result?.data) {
      try {
        const transformed = await Promise.resolve(config.transform(result, currentSections));
        if (Array.isArray(transformed) && transformed.length > 0) {
          this.resetSectionResultsMap(sectionResultsMap, transformed.length);
          return transformed;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`Error in transform for ${dimension}:`, err.message);
        options.onError?.(`transform-${dimension}`, err);
      }
    }

    // New transformSections hook
    if (result) {
      const transformed = await this.hookExecutor!.transformSections({
        processId: this.processId,
        timestamp: Date.now(),
        dimension,
        isGlobal: true,
        sections: currentSections,
        dependencies: {},
        globalResults: {},
        request: { input: '', options: {} },
        provider: result.metadata?.provider || 'unknown',
        providerOptions: {},
        result,
        duration: 0,
        tokensUsed: result.metadata?.tokens,
        currentSections,
      });

      if (transformed) {
        this.resetSectionResultsMap(sectionResultsMap, transformed.length);
        return transformed;
      }
    }

    return currentSections;
  }

  // ===== HELPER METHODS =====

  private validateConfig(config: EngineConfig): void {
    if (!config.plugin) {
      throw new Error('DagEngine requires a plugin');
    }

    if (config.concurrency !== undefined && config.concurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }

    if (!config.providers && !config.registry) {
      throw new Error('DagEngine requires either "providers" or "registry"');
    }
  }

  private initializeAdapter(config: EngineConfig): ProviderAdapter {
    if (config.providers) {
      const adapter = config.providers instanceof ProviderAdapter
          ? config.providers
          : new ProviderAdapter(config.providers);

      // Validate that adapter has at least one provider
      const availableProviders = adapter.listProviders();
      if (availableProviders.length === 0) {
        throw new Error('DagEngine requires at least one provider to be configured');
      }

      return adapter;
    }

    const adapter = new ProviderAdapter({});
    const registryProviders = config.registry!.list();
    registryProviders.forEach((name) => {
      const provider = config.registry!.get(name);
      adapter.registerProvider(provider);
    });

    const availableProviders = adapter.listProviders();
    if (availableProviders.length === 0) {
      throw new Error('DagEngine requires at least one provider to be configured');
    }

    return adapter;
  }

  private initializeProcessState(): void {
    this.processId = crypto.randomUUID();
    this.processStartTime = Date.now();
  }

  private async handleProcessError(
      error: Error,
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      currentSections: SectionData[],
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions,
      duration: number
  ): Promise<ProcessResult> {
    // Build partial results from what we have
    const partialSections = currentSections.length > 0 ? currentSections : sections;
    const partialSectionResults = partialSections.map((section, idx) => ({
      section,
      results: sectionResultsMap.get(idx) || {},
    }));

    // Ensure duration is at least 1ms to avoid test flakiness
    const actualDuration = Math.max(duration, 1);

    const failureResult = await this.hookExecutor!.handleProcessFailure(
        error,
        {
          sections: partialSectionResults,
          globalResults,
          transformedSections: partialSections,
        },
        sections,
        this.processId,
        this.processStartTime,
        actualDuration
    );

    if (failureResult) {
      return failureResult;
    }

    throw error;
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, dimension: string): Promise<T> {
    const timeoutMs = this.dimensionTimeouts[dimension] || this.timeout;
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
          setTimeout(
              () => reject(new Error(`Timeout after ${timeoutMs}ms for dimension "${dimension}"`)),
              timeoutMs
          )
      ),
    ]);
  }

  private async resolveGlobalDependencies(
      dimension: string,
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      totalSections: number
  ): Promise<DimensionDependencies> {
    const graph = this.cachedDependencyGraph || {};
    const deps: DimensionDependencies = {};
    const allDimensions = this.plugin.getDimensionNames();

    for (const depName of graph[dimension] || []) {
      if (!allDimensions.includes(depName)) {
        deps[depName] = { error: `Dependency "${depName}" not found in plugin dimensions` };
        continue;
      }

      if (this.plugin.isGlobalDimension(depName)) {
        deps[depName] = globalResults[depName] || {
          error: `Global dependency "${depName}" not found`,
        };
      } else {
        const sectionDeps: DimensionResult[] = [];
        for (let i = 0; i < totalSections; i++) {
          const sectionResults = sectionResultsMap.get(i);
          if (sectionResults?.[depName]) {
            sectionDeps.push(sectionResults[depName]);
          }
        }

        deps[depName] =
            sectionDeps.length > 0
                ? { data: { sections: sectionDeps, aggregated: true, totalSections } }
                : { error: `Section dependency "${depName}" not yet processed` };
      }
    }

    return deps;
  }

  private async resolveDependencies(
      dimension: string,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): Promise<DimensionDependencies> {
    const graph = this.cachedDependencyGraph || {};
    const deps: DimensionDependencies = {};
    const allDimensions = this.plugin.getDimensionNames();

    for (const depName of graph[dimension] || []) {
      if (!allDimensions.includes(depName)) {
        deps[depName] = { error: `Dependency "${depName}" not found in plugin dimensions` };
        continue;
      }

      deps[depName] = this.plugin.isGlobalDimension(depName)
          ? globalResults[depName] || { error: `Global dependency "${depName}" not found` }
          : sectionResults[depName] || { error: `Section dependency "${depName}" not found` };
    }

    return deps;
  }

  private hasFailedDependencies(deps: DimensionDependencies): boolean {
    return Object.values(deps).some((dep) => dep.error);
  }

  private resetSectionResultsMap(
      map: Map<number, Record<string, DimensionResult>>,
      newLength: number
  ): void {
    map.clear();
    for (let i = 0; i < newLength; i++) {
      map.set(i, {});
    }
  }

  private applyFinalizedResults(
      sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>,
      finalizedResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): Array<{ section: SectionData; results: Record<string, DimensionResult> }> {
    const updated = sectionResults.map((sr, idx) => {
      const updatedResults: Record<string, DimensionResult> = {};
      Object.keys(sr.results).forEach((dim) => {
        updatedResults[dim] =
            (finalizedResults[`${dim}_section_${idx}`] || sr.results[dim]) as DimensionResult;
      });
      return { section: sr.section, results: updatedResults };
    });

    Object.keys(globalResults).forEach((dim) => {
      if (finalizedResults[dim]) {
        globalResults[dim] = finalizedResults[dim];
      }
    });

    return updated;
  }

  private countSuccessful(
      globalResults: Record<string, DimensionResult>,
      sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>
  ): number {
    let count = Object.values(globalResults).filter((r) => !r.error).length;
    const seenSection = new Set<string>();
    sectionResults.forEach((sr) => {
      Object.entries(sr.results).forEach(([dim, result]) => {
        if (!result.error && !seenSection.has(dim)) {
          seenSection.add(dim);
          count++;
        }
      });
    });
    return count;
  }

  private countFailed(
      globalResults: Record<string, DimensionResult>,
      sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>
  ): number {
    let count = Object.values(globalResults).filter((r) => r.error).length;
    const seenSection = new Set<string>();
    sectionResults.forEach((sr) => {
      Object.entries(sr.results).forEach(([dim, result]) => {
        if (result.error && !seenSection.has(dim)) {
          seenSection.add(dim);
          count++;
        }
      });
    });
    return count;
  }
}