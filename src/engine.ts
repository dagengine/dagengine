import { Plugin } from './plugin';
import { ProviderAdapter, ProviderAdapterConfig } from './providers/adapter';
import { ProviderRegistry } from './providers/registry';
import {
  SectionData,
  DimensionResult,
  DimensionDependencies,
  PricingConfig,
  CostSummary,
  DimensionCost,
  TokenUsage,
  ProcessOptions,
  ProcessResult,
  DimensionContext,
  SectionDimensionContext,
  ProviderContext,
  DimensionResultContext,
  ProviderResultContext,
  RetryContext,
  FallbackContext,
  FailureContext,
  SkipWithResult,
  ProviderRequest,
  ProviderResponse,
  TransformSectionsContext,
} from './types';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { Graph, alg } from '@dagrejs/graphlib';
import crypto from 'crypto';

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
 * DagEngine - AI-powered workflow orchestration
 */
export class DagEngine {
  private readonly plugin: Plugin;
  private readonly adapter: ProviderAdapter;
  private readonly queue: PQueue;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly continueOnError: boolean;
  private readonly timeout: number;
  private readonly dimensionTimeouts: Record<string, number>;
  private dependencyGraph?: Graph;
  private readonly concurrency: number;
  private readonly pricing: PricingConfig | undefined;

  // Process-level state
  private processId: string = '';
  private processStartTime: number = 0;
  private processMetadata: any = undefined;
  private cachedDependencyGraph?: Record<string, string[]>;

  constructor(config: EngineConfig) {
    if (!config.plugin) {
      throw new Error('DagEngine requires a plugin');
    }

    this.plugin = config.plugin;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.continueOnError = config.continueOnError ?? true;
    this.timeout = config.timeout ?? 60000;
    this.dimensionTimeouts = config.dimensionTimeouts ?? {};
    this.concurrency = config.concurrency ?? 5;
    this.pricing = config.pricing;

    if (this.concurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }

    this.queue = new PQueue({
      concurrency: config.concurrency ?? 5,
    });

    if (config.providers) {
      if (config.providers instanceof ProviderAdapter) {
        this.adapter = config.providers;
      } else {
        this.adapter = new ProviderAdapter(config.providers);
      }
    } else if (config.registry) {
      this.adapter = new ProviderAdapter({});
      const registryProviders = config.registry.list();
      registryProviders.forEach((name) => {
        const provider = config.registry!.get(name);
        this.adapter.registerProvider(provider);
      });
    } else {
      throw new Error('DagEngine requires either "providers" or "registry"');
    }

    const availableProviders = this.adapter.listProviders();
    if (availableProviders.length === 0) {
      throw new Error('DagEngine requires at least one provider to be configured');
    }
  }

  async process(sections: SectionData[], options: ProcessOptions = {}): Promise<ProcessResult> {
    // Generate process ID
    this.processId = crypto.randomUUID();
    this.processStartTime = Date.now();

    // ===== HOOK: beforeProcessStart =====
    let processedSections = sections;
    if (this.plugin.beforeProcessStart) {
      try {
        const startResult = await Promise.resolve(
            this.plugin.beforeProcessStart({
              processId: this.processId,
              timestamp: this.processStartTime,
              sections,
              options,
            })
        );

        if (startResult?.sections) {
          processedSections = startResult.sections;
        }
        if (startResult?.metadata) {
          this.processMetadata = startResult.metadata;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.('beforeProcessStart', err);

        if (this.plugin.handleProcessFailure) {
          const failureResult = await this.handleProcessFailureHook(err, {}, processedSections, options);
          if (failureResult) {
            return failureResult;
          }
        }

        throw err;
      }
    }

    if (!processedSections.length) {
      throw new Error('DagEngine.process() requires at least one section');
    }

    // ===== HOOK: defineDependencies =====
    let dependencyGraph: Record<string, string[]> = {};
    if (this.plugin.defineDependencies) {
      try {
        dependencyGraph = await Promise.resolve(
            this.plugin.defineDependencies({
              processId: this.processId,
              timestamp: this.processStartTime,
              sections: processedSections,
              options,
              metadata: this.processMetadata,
            })
        );
        this.cachedDependencyGraph = dependencyGraph;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.('defineDependencies', err);
        throw err;
      }
    }

    const allDimensions = this.plugin.getDimensionNames();
    const sortedDimensions = await this.topologicalSortWithGraph(allDimensions, dependencyGraph);

    const globalResults: Record<string, DimensionResult> = {};
    const sectionResultsMap = new Map<number, Record<string, DimensionResult>>();
    let currentSections = [...processedSections];

    currentSections.forEach((_, idx) => {
      sectionResultsMap.set(idx, {});
    });

    try {
      const executionGroups = this.groupDimensionsForParallelExecution(
          sortedDimensions,
          dependencyGraph
      );

      // Process each group (dimensions within a group execute in parallel)
      for (const group of executionGroups) {
        // Separate globals and sections in this group
        const globalDims = group.filter(dim => this.plugin.isGlobalDimension(dim));
        const sectionDims = group.filter(dim => !this.plugin.isGlobalDimension(dim));

        // ✅ Execute all independent globals in parallel
        if (globalDims.length > 0) {
          await Promise.all(
              globalDims.map(dimension =>
                  this.processGlobalDimension(
                      dimension,
                      currentSections,
                      globalResults,
                      sectionResultsMap,
                      options
                  )
              )
          );

          // ✅ Apply transformations sequentially (they modify sections)
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

        // ✅ Process section dimensions (already parallel via queue)
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
            return {
              section,
              results,
            };
          })
      );

      // ===== HOOK: finalizeResults =====
      let finalizedSectionResults = finalSectionResults;
      if (this.plugin.finalizeResults) {
        try {
          const allResults: Record<string, DimensionResult> = {};

          // Collect all section results
          finalSectionResults.forEach((sr, idx) => {
            Object.entries(sr.results).forEach(([dim, result]) => {
              allResults[`${dim}_section_${idx}`] = result;
            });
          });

          // Merge with global results
          Object.assign(allResults, globalResults);

          const finalizedResults = await Promise.resolve(
              this.plugin.finalizeResults({
                results: allResults,
                sections: currentSections,
                globalResults,
                transformedSections: currentSections,
                processId: this.processId,
                duration: Date.now() - this.processStartTime,
                timestamp: this.processStartTime,
              })
          );

          // Update section results with finalized data
          finalizedSectionResults = finalSectionResults.map((sr, idx) => {
            const updatedResults: Record<string, DimensionResult> = {};
            Object.keys(sr.results).forEach((dim) => {
              // Since we're iterating over existing keys, we know sr.results[dim] exists
              updatedResults[dim] = (finalizedResults[`${dim}_section_${idx}`] || sr.results[dim]) as DimensionResult;
            });
            return {
              section: sr.section,
              results: updatedResults,
            };
          });

          // Update global results
          Object.keys(globalResults).forEach((dim) => {
            if (finalizedResults[dim]) {
              globalResults[dim] = finalizedResults[dim];
            }
          });

        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.('finalizeResults', err);
          // Continue with non-finalized results
        }
      }

      const costs = this.pricing
          ? this.calculateCosts(finalizedSectionResults, globalResults)
          : undefined;

      let result: ProcessResult = {
        sections: finalizedSectionResults,
        globalResults,
        transformedSections: currentSections,
        ...(costs && { costs }),
      };

      // ===== HOOK: afterProcessComplete =====
      if (this.plugin.afterProcessComplete) {
        try {
          const modifiedResult = await Promise.resolve(
              this.plugin.afterProcessComplete({
                processId: this.processId,
                timestamp: this.processStartTime,
                sections: processedSections,
                options,
                metadata: this.processMetadata,
                result,
                duration: Date.now() - this.processStartTime,
                totalDimensions: sortedDimensions.length,
                successfulDimensions: this.countSuccessfulDimensions(globalResults, sectionResultsMap),
                failedDimensions: this.countFailedDimensions(globalResults, sectionResultsMap),
              })
          );

          if (modifiedResult) {
            result = modifiedResult;
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.('afterProcessComplete', err);
          // Continue with original result
        }
      }

      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // ===== HOOK: handleProcessFailure =====
      if (this.plugin.handleProcessFailure) {
        const failureResult = await this.handleProcessFailureHook(
            err,
            {
              sections: currentSections.map((section, idx) => ({
                section,
                results: sectionResultsMap.get(idx) || {},
              })),
              globalResults,
              transformedSections: currentSections,
            },
            processedSections,
            options
        );

        if (failureResult) {
          return failureResult;
        }
      }

      throw err;
    }
  }

  /**
   * Group dimensions into execution batches based on dependencies.
   * Dimensions within the same batch have no dependencies on each other
   * and can safely execute in parallel.
   *
   * @param dimensions - All dimension names in topological order
   * @param deps - Dependency graph
   * @returns Array of dimension groups, where each group can execute in parallel
   */
  private groupDimensionsForParallelExecution(
      dimensions: string[],
      deps: Record<string, string[]>
  ): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();
    const remaining = [...dimensions];
    const validDimensions = new Set(dimensions); // ✅ Track valid dimensions

    while (remaining.length > 0) {
      const currentGroup: string[] = [];

      // Find all dimensions whose dependencies are already processed
      for (const dim of remaining) {
        const dimDeps = deps[dim] || [];

        // ✅ Filter out non-existent dependencies
        const validDeps = dimDeps.filter(dep => validDimensions.has(dep));

        // Check if all VALID dependencies are processed
        const allDepsProcessed = validDeps.every(dep => processed.has(dep));

        if (allDepsProcessed) {
          currentGroup.push(dim);
        }
      }

      // Safety check: ensure we're making progress
      if (currentGroup.length === 0) {
        // ✅ Better error message showing what's stuck
        const stuckDimensions = remaining.map(dim => {
          const dimDeps = deps[dim] || [];
          const validDeps = dimDeps.filter(dep => validDimensions.has(dep));
          const unmetDeps = validDeps.filter(dep => !processed.has(dep));
          return `${dim} (waiting for: ${unmetDeps.join(', ') || 'none'})`;
        });

        throw new Error(
            'Unable to create execution groups. ' +
            'Remaining dimensions: ' + stuckDimensions.join('; ') + '. ' +
            'This indicates a circular dependency or invalid graph.'
        );
      }

      groups.push(currentGroup);

      // Mark as processed and remove from remaining
      currentGroup.forEach(dim => {
        processed.add(dim);
        const idx = remaining.indexOf(dim);
        if (idx !== -1) {
          remaining.splice(idx, 1);
        }
      });
    }

    return groups;
  }

  private async handleProcessFailureHook(
      error: Error,
      partialResults: Partial<ProcessResult>,
      sections: SectionData[],
      options: ProcessOptions
  ): Promise<ProcessResult | void> {
    try {
      const failureResult = await Promise.resolve(
          this.plugin.handleProcessFailure!({
            error,
            partialResults,
            processId: this.processId,
            sections,
            duration: Date.now() - this.processStartTime,
            options,
            timestamp: this.processStartTime,
          })
      );

      return failureResult;
    } catch (hookError) {
      const err = hookError instanceof Error ? hookError : new Error(String(hookError));
      options.onError?.('handleProcessFailure', err);
      return undefined;
    }
  }

  private async processGlobalDimension(
      dimension: string,
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    try {
      options.onDimensionStart?.(dimension);

      // Resolve dependencies
      const dependencies = await this.resolveGlobalDependencies(
          dimension,
          globalResults,
          sectionResultsMap,
          sections.length
      );

      // Build dimension context
      const dimensionContext: DimensionContext = {
        processId: this.processId,
        timestamp: Date.now(),
        dimension,
        isGlobal: true,
        sections,
        dependencies,
        globalResults,
      };

      // ===== HOOK: shouldSkipGlobalDimension =====
      if (this.plugin.shouldSkipGlobalDimension) {
        try {
          const skipResult = await Promise.resolve(
              this.plugin.shouldSkipGlobalDimension(dimensionContext)
          );

          if (skipResult === true) {
            globalResults[dimension] = {
              data: {
                skipped: true,
                reason: 'Skipped by plugin shouldSkipGlobalDimension',
              },
            };
            options.onDimensionComplete?.(dimension, globalResults[dimension]);
            return;
          }

          // Check for cached result
          if (
              skipResult &&
              typeof skipResult === 'object' &&
              skipResult.skip === true &&
              skipResult.result
          ) {
            globalResults[dimension] = {
              ...skipResult.result,
              metadata: {
                ...skipResult.result.metadata,
                cached: true,
              },
            };
            options.onDimensionComplete?.(dimension, globalResults[dimension]);
            return;
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`Error in shouldSkipGlobalDimension for ${dimension}:`, err.message);
          options.onError?.(`shouldSkipGlobalDimension-${dimension}`, err);
        }
      }

      // ===== HOOK: transformDependencies =====
      let transformedDependencies = dependencies;
      if (this.plugin.transformDependencies) {
        try {
          transformedDependencies = await Promise.resolve(
              this.plugin.transformDependencies(dimensionContext)
          );
          dimensionContext.dependencies = transformedDependencies;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(`transformDependencies-${dimension}`, err);
          // Continue with original dependencies
        }
      }

      // Check for failed dependencies
      const hasFailedDeps = Object.values(transformedDependencies).some((dep) => dep.error);
      if (hasFailedDeps && !this.continueOnError) {
        throw new Error(`Dependencies failed for dimension "${dimension}"`);
      }

      // ===== HOOK: beforeDimensionExecute =====
      if (this.plugin.beforeDimensionExecute) {
        try {
          await Promise.resolve(
              this.plugin.beforeDimensionExecute(dimensionContext)
          );
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(`beforeDimensionExecute-${dimension}`, err);
        }
      }

      // Execute dimension
      const dimensionStartTime = Date.now();
      const result = await this.executeWithTimeout(
          () => this.executeDimension(dimension, sections, transformedDependencies, true, dimensionContext),
          dimension
      );
      const dimensionDuration = Date.now() - dimensionStartTime;

      globalResults[dimension] = result;

      // ===== HOOK: afterDimensionExecute =====
      if (this.plugin.afterDimensionExecute) {
        try {
          const resultContext: DimensionResultContext = {
            ...dimensionContext,
            request: { input: '', options: {} },
            provider: result.metadata?.provider || 'unknown',
            providerOptions: {},
            result,
            duration: dimensionDuration,
            tokensUsed: result.metadata?.tokens,
          };

          await Promise.resolve(
              this.plugin.afterDimensionExecute(resultContext)
          );
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(`afterDimensionExecute-${dimension}`, err);
        }
      }

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
        if (sectionIdx === 0) {
          options.onSectionStart?.(sectionIdx, sections.length);
        }

        const sectionResults = sectionResultsMap.get(sectionIdx) || {};

        // Resolve dependencies
        const dependencies = await this.resolveDependencies(dimension, sectionResults, globalResults);

        // Build section dimension context
        const sectionDimensionContext: SectionDimensionContext = {
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

        // ===== HOOK: shouldSkipDimension =====
        if (this.plugin.shouldSkipDimension) {
          try {
            const skipResult = await Promise.resolve(
                this.plugin.shouldSkipDimension(sectionDimensionContext)
            );

            // ✅ Explicitly check for true boolean
            if (skipResult === true) {
              sectionResults[dimension] = {
                data: {
                  skipped: true,
                  reason: 'Skipped by plugin shouldSkipDimension',
                },
              };
              sectionResultsMap.set(sectionIdx, sectionResults);

              if (sectionIdx === 0) {
                options.onSectionComplete?.(sectionIdx, sections.length);
              }
              return;
            }

            // ✅ Check for cached result (explicit checks)
            if (
                skipResult &&
                typeof skipResult === 'object' &&
                skipResult.skip === true &&
                skipResult.result
            ) {
              sectionResults[dimension] = {
                ...skipResult.result,
                metadata: {
                  ...skipResult.result.metadata,
                  cached: true,
                },
              };
              sectionResultsMap.set(sectionIdx, sectionResults);

              if (sectionIdx === 0) {
                options.onSectionComplete?.(sectionIdx, sections.length);
              }
              return;
            }

            // ✅ Continue processing for all other cases (null, undefined, false, etc.)
          } catch (error) {
            // ✅ ADDED: Error handling for shouldSkipDimension
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(
                `Error in shouldSkipDimension for dimension "${dimension}" (section ${sectionIdx}):`,
                err.message
            );
            options.onError?.(`shouldSkipDimension-${dimension}-section-${sectionIdx}`, err);
            // Continue with default behavior (don't skip)
          }
        }

        // ===== HOOK: transformDependencies =====
        let transformedDependencies = dependencies;
        if (this.plugin.transformDependencies) {
          try {
            transformedDependencies = await Promise.resolve(
                this.plugin.transformDependencies(sectionDimensionContext)
            );
            sectionDimensionContext.dependencies = transformedDependencies;
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            // ✅ ADDED: console.error
            console.error(
                `Error in transformDependencies for dimension "${dimension}" (section ${sectionIdx}):`,
                err.message
            );
            options.onError?.(`transformDependencies-${dimension}-section-${sectionIdx}`, err);
            // Continue with original dependencies
          }
        }

        // Check for failed dependencies
        const hasFailedDeps = Object.values(transformedDependencies).some((dep) => dep.error);
        if (hasFailedDeps && !this.continueOnError) {
          throw new Error(`Dependencies failed for dimension "${dimension}"`);
        }

        // ===== HOOK: beforeDimensionExecute =====
        if (this.plugin.beforeDimensionExecute) {
          try {
            await Promise.resolve(
                this.plugin.beforeDimensionExecute(sectionDimensionContext)
            );
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            // ✅ ADDED: console.error
            console.error(
                `Error in beforeDimensionExecute for dimension "${dimension}" (section ${sectionIdx}):`,
                err.message
            );
            options.onError?.(`beforeDimensionExecute-${dimension}-section-${sectionIdx}`, err);
            // Continue execution
          }
        }

        // Execute dimension
        const dimensionStartTime = Date.now();
        const result = await this.executeWithTimeout(
            () => this.executeDimension(dimension, [section], transformedDependencies, false, sectionDimensionContext),
            dimension
        );
        const dimensionDuration = Date.now() - dimensionStartTime;

        sectionResults[dimension] = result;
        sectionResultsMap.set(sectionIdx, sectionResults);

        // ===== HOOK: afterDimensionExecute =====
        if (this.plugin.afterDimensionExecute) {
          try {
            const resultContext: DimensionResultContext = {
              ...sectionDimensionContext,
              request: { input: '', options: {} },
              provider: result.metadata?.provider || 'unknown',
              providerOptions: {},
              result,
              duration: dimensionDuration,
              // ✅ FIXED: Use conditional spreading for tokensUsed
              ...(result.metadata?.tokens && { tokensUsed: result.metadata.tokens }),
            };

            await Promise.resolve(
                this.plugin.afterDimensionExecute(resultContext)
            );
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            // ✅ ADDED: console.error
            console.error(
                `Error in afterDimensionExecute for dimension "${dimension}" (section ${sectionIdx}):`,
                err.message
            );
            options.onError?.(`afterDimensionExecute-${dimension}-section-${sectionIdx}`, err);
            // Continue with result as-is
          }
        }

        if (sectionIdx === 0) {
          options.onSectionComplete?.(sectionIdx, sections.length);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        // ✅ ADDED: console.error for section-level errors
        console.error(
            `Error processing dimension "${dimension}" for section ${sectionIdx}:`,
            err.message
        );
        options.onError?.(`section-${sectionIdx}-${dimension}`, err);

        const sectionResults = sectionResultsMap.get(sectionIdx) || {};
        sectionResults[dimension] = { error: err.message };
        sectionResultsMap.set(sectionIdx, sectionResults);

        if (!this.continueOnError) {
          throw error;
        }
      }
    });

    await this.queue.addAll(tasks);

    options.onDimensionComplete?.(dimension, { data: 'Section dimension complete' });
  }

  private async executeDimension(
      dimension: string,
      sections: SectionData[],
      dependencies: DimensionDependencies,
      isGlobal: boolean,
      dimensionContext: DimensionContext | SectionDimensionContext
  ): Promise<DimensionResult> {
    // Create prompt
    const prompt = await Promise.resolve(
        this.plugin.createPrompt({
          sections,
          dimension,
          dependencies,
          isGlobal,
        })
    );

    // Select provider
    const providerConfig = await Promise.resolve(
        this.plugin.selectProvider(dimension, sections[0])
    );

    const providersToTry: Array<{
      provider: string;
      options: Record<string, unknown>;
      retryAfter?: number;
    }> = [
      {
        provider: providerConfig.provider,
        options: providerConfig.options,
      },
      ...(providerConfig.fallbacks || []),
    ];

    let lastError: Error | null = null;
    const previousAttempts: Array<{
      attempt: number;
      error: Error;
      provider: string;
      timestamp: number;
    }> = [];

    // ✅ FIXED: Declare currentRequest outside the loop
    let currentRequest: ProviderRequest = {
      input: prompt,
      options: {},
      dimension: dimension,
      isGlobal: isGlobal,
      metadata: {
        totalSections: sections.length,
      }
    };

    // ✅ FIXED: Track the last provider context for failure hook
    let lastProviderContext: ProviderContext | undefined;

    for (let providerIdx = 0; providerIdx < providersToTry.length; providerIdx++) {
      const currentProvider = providersToTry[providerIdx]!;

      if (!this.adapter.hasProvider(currentProvider.provider)) {
        const availableProviders = this.adapter.listProviders().join(', ');
        lastError = new Error(
            `Provider "${currentProvider.provider}" not found. Available: ${availableProviders}`
        );
        continue;
      }

      // Wait before fallback if specified
      if (providerIdx > 0 && currentProvider.retryAfter) {
        await new Promise(resolve => setTimeout(resolve, currentProvider.retryAfter));
      }

      // ✅ FIXED: Update currentRequest for this provider
      currentRequest = {
        input: prompt,
        options: currentProvider.options,
        dimension: dimension,
        isGlobal: isGlobal,
        metadata: {
          totalSections: sections.length,
        }
      };

      // Build provider context for hooks
      const baseProviderContext: ProviderContext = {
        ...dimensionContext,
        request: currentRequest,
        provider: currentProvider.provider,
        providerOptions: currentProvider.options,
      };

      // ✅ FIXED: Store this context for failure hook
      lastProviderContext = baseProviderContext;

      // ===== HOOK: beforeProviderExecute =====
      if (this.plugin.beforeProviderExecute) {
        try {
          currentRequest = await Promise.resolve(
              this.plugin.beforeProviderExecute(baseProviderContext)
          );
          baseProviderContext.request = currentRequest;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.warn(`Error in beforeProviderExecute for ${dimension}:`, err.message);
        }
      }

      // Try executing with retries
      try {
        const executeStartTime = Date.now();

        const response = await pRetry(
            async (attemptNumber) => {
              try {
                const result = await this.adapter.execute(currentProvider.provider, currentRequest);

                if (result.error) {
                  throw new Error(result.error);
                }

                return result;
              } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));

                // Record attempt
                previousAttempts.push({
                  attempt: attemptNumber,
                  error: err,
                  provider: currentProvider.provider,
                  timestamp: Date.now(),
                });

                // ===== HOOK: handleRetry =====
                if (this.plugin.handleRetry && attemptNumber < this.maxRetries) {
                  try {
                    const retryContext: RetryContext = {
                      ...baseProviderContext,
                      error: err,
                      attempt: attemptNumber,
                      maxAttempts: this.maxRetries,
                      previousAttempts: [...previousAttempts],
                    };

                    const retryResponse = await Promise.resolve(
                        this.plugin.handleRetry(retryContext)
                    );

                    if (retryResponse.shouldRetry === false) {
                      throw err;
                    }

                    if (retryResponse.delayMs) {
                      await new Promise(resolve => setTimeout(resolve, retryResponse.delayMs));
                    }

                    if (retryResponse.modifiedRequest) {
                      currentRequest = retryResponse.modifiedRequest;
                    }

                    if (retryResponse.modifiedProvider) {
                      currentProvider.provider = retryResponse.modifiedProvider;
                    }
                  } catch (hookError) {
                    console.warn(`Error in handleRetry hook:`, hookError);
                  }
                }

                throw err;
              }
            },
            {
              retries: this.maxRetries,
              factor: 2,
              minTimeout: this.retryDelay,
              maxTimeout: this.retryDelay * Math.pow(2, this.maxRetries),
              onFailedAttempt: (error) => {
                console.warn(
                    `Attempt ${error.attemptNumber} failed for dimension "${dimension}" with provider "${currentProvider.provider}". ${error.retriesLeft} retries left.`
                );
              },
            }
        );

        const executeDuration = Date.now() - executeStartTime;

        // ===== HOOK: afterProviderExecute =====
        let finalResponse = response;
        if (this.plugin.afterProviderExecute) {
          try {
            const providerResultContext: ProviderResultContext = {
              ...baseProviderContext,
              result: response,
              duration: executeDuration,
              ...(response.metadata?.tokens && { tokensUsed: response.metadata.tokens }),
            };

            finalResponse = await Promise.resolve(
                this.plugin.afterProviderExecute(providerResultContext)
            );
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.warn(`Error in afterProviderExecute for ${dimension}:`, err.message);
          }
        }

        return {
          data: finalResponse.data,
          ...(finalResponse.metadata && { metadata: finalResponse.metadata })
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Try fallback if available
        if (providerIdx < providersToTry.length - 1) {
          const nextProvider = providersToTry[providerIdx + 1]!;

          // ===== HOOK: handleProviderFallback =====
          if (this.plugin.handleProviderFallback) {
            try {
              const fallbackContext: FallbackContext = {
                ...baseProviderContext,
                error: lastError,
                attempt: previousAttempts.length,
                maxAttempts: this.maxRetries,
                previousAttempts: [...previousAttempts],
                failedProvider: currentProvider.provider,
                fallbackProvider: nextProvider.provider,
                fallbackOptions: nextProvider.options,
              };

              const fallbackResponse = await Promise.resolve(
                  this.plugin.handleProviderFallback(fallbackContext)
              );

              if (fallbackResponse.shouldFallback === false) {
                break;
              }

              if (fallbackResponse.delayMs) {
                await new Promise(resolve => setTimeout(resolve, fallbackResponse.delayMs));
              }

              if (fallbackResponse.modifiedRequest) {
                currentRequest = fallbackResponse.modifiedRequest;
                providersToTry[providerIdx + 1]!.options = {
                  ...providersToTry[providerIdx + 1]!.options,
                  ...fallbackResponse.modifiedRequest.options,
                };
              }
            } catch (hookError) {
              console.warn(`Error in handleProviderFallback hook:`, hookError);
            }
          }

          console.warn(
              `Provider "${currentProvider.provider}" failed for dimension "${dimension}". Trying fallback provider "${nextProvider.provider}"...`
          );
        }
      }
    }

    // ✅ FIXED: Now currentRequest and lastProviderContext are in scope
    // All providers failed - call handleDimensionFailure hook
    if (this.plugin.handleDimensionFailure) {
      try {
        const failureContext: FailureContext = {
          ...(lastProviderContext || {
            ...dimensionContext,
            request: currentRequest,
            provider: 'unknown',
            providerOptions: {},
          }),
          error: lastError!,
          attempt: previousAttempts.length,
          maxAttempts: this.maxRetries,
          previousAttempts,
          totalAttempts: previousAttempts.length,
          providers: providersToTry.map(p => p.provider),
        };

        const fallbackResult = await Promise.resolve(
            this.plugin.handleDimensionFailure(failureContext)
        );

        if (fallbackResult) {
          return fallbackResult;
        }
      } catch (hookError) {
        console.warn(`Error in handleDimensionFailure hook:`, hookError);
      }
    }

    throw lastError || new Error(`All providers failed for dimension "${dimension}"`);
  }

  private async applyTransformation(
      dimension: string,
      result: DimensionResult | undefined,
      currentSections: SectionData[],
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<SectionData[]> {
    const config = this.plugin.getDimensionConfig(dimension);

    // Check legacy transform config first
    if (config.transform && result?.data) {
      try {
        const transformed = await Promise.resolve(
            config.transform(result, currentSections)
        );

        if (Array.isArray(transformed) && transformed.length > 0) {
          this.resetSectionResultsMap(sectionResultsMap, transformed.length);
          return transformed;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.(`transform-${dimension}`, err);
      }
    }

    // ===== HOOK: transformSections =====
    if (this.plugin.transformSections && result) {
      try {
        const transformContext: TransformSectionsContext = {
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
        };

        const transformed = await Promise.resolve(
            this.plugin.transformSections(transformContext)
        );

        if (Array.isArray(transformed) && transformed.length > 0) {
          this.resetSectionResultsMap(sectionResultsMap, transformed.length);
          return transformed;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.(`transformSections-${dimension}`, err);
      }
    }

    return currentSections;
  }

  private resetSectionResultsMap(
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      newLength: number
  ): void {
    sectionResultsMap.clear();
    for (let i = 0; i < newLength; i++) {
      sectionResultsMap.set(i, {});
    }
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
        deps[depName] = {
          error: `Dependency "${depName}" not found in plugin dimensions`,
        };
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

        if (sectionDeps.length > 0) {
          deps[depName] = {
            data: {
              sections: sectionDeps,
              aggregated: true,
              totalSections,
            },
          };
        } else {
          deps[depName] = {
            error: `Section dependency "${depName}" not yet processed`,
          };
        }
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
        deps[depName] = {
          error: `Dependency "${depName}" not found in plugin dimensions`,
        };
        continue;
      }

      if (this.plugin.isGlobalDimension(depName)) {
        deps[depName] = globalResults[depName] || {
          error: `Global dependency "${depName}" not found`,
        };
      } else {
        deps[depName] = sectionResults[depName] || {
          error: `Section dependency "${depName}" not found`,
        };
      }
    }

    return deps;
  }

  private async topologicalSortWithGraph(
      dimensions: string[],
      deps: Record<string, string[]>
  ): Promise<string[]> {
    const graph = new Graph();

    dimensions.forEach((dim) => graph.setNode(dim));

    Object.entries(deps).forEach(([node, nodeDeps]) => {
      nodeDeps.forEach((dep) => {
        if (dimensions.includes(dep)) {
          graph.setEdge(dep, node);
        }
      });
    });

    if (!alg.isAcyclic(graph)) {
      const cycles = alg.findCycles(graph);
      const cycleStr = cycles[0]?.join(' → ');
      throw new Error(
          `Circular dependency detected: ${cycleStr}\n` +
          `Please review your defineDependencies() configuration.`
      );
    }

    this.dependencyGraph = graph;

    return alg.topsort(graph);
  }

  private countSuccessfulDimensions(
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>
  ): number {
    let count = 0;

    Object.values(globalResults).forEach(result => {
      if (!result.error) count++;
    });

    const sectionDimensions = new Set<string>();
    sectionResultsMap.forEach(results => {
      Object.entries(results).forEach(([dim, result]) => {
        if (!result.error && !sectionDimensions.has(dim)) {
          sectionDimensions.add(dim);
          count++;
        }
      });
    });

    return count;
  }

  private countFailedDimensions(
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>
  ): number {
    let count = 0;

    Object.values(globalResults).forEach(result => {
      if (result.error) count++;
    });

    const failedSectionDimensions = new Set<string>();
    sectionResultsMap.forEach(results => {
      Object.entries(results).forEach(([dim, result]) => {
        if (result.error && !failedSectionDimensions.has(dim)) {
          failedSectionDimensions.add(dim);
          count++;
        }
      });
    });

    return count;
  }

  private calculateCosts(
      sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>,
      globalResults: Record<string, DimensionResult>
  ): CostSummary {
    if (!this.pricing) {
      throw new Error('Pricing config not provided');
    }

    const byDimension: Record<string, DimensionCost> = {};
    const byProvider: Record<string, { cost: number; tokens: TokenUsage; models: string[] }> = {};

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const processResult = (dimension: string, result: DimensionResult): void => {
      const metadata = result.metadata;

      if (!metadata?.tokens || !metadata?.model) {
        return;
      }

      const { tokens, model, provider = 'unknown' } = metadata;

      const modelPricing = this.pricing!.models[model];

      if (!modelPricing) {
        console.warn(`No pricing data for model "${model}". Skipping cost calculation for this dimension.`);
        return;
      }

      const cost = (
          (tokens.inputTokens * modelPricing.inputPer1M +
              tokens.outputTokens * modelPricing.outputPer1M) / 1_000_000
      );

      totalCost += cost;
      totalInputTokens += tokens.inputTokens;
      totalOutputTokens += tokens.outputTokens;

      if (!byDimension[dimension]) {
        byDimension[dimension] = {
          cost: 0,
          tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          model,
          provider,
        };
      }
      byDimension[dimension].cost += cost;
      byDimension[dimension].tokens.inputTokens += tokens.inputTokens;
      byDimension[dimension].tokens.outputTokens += tokens.outputTokens;
      byDimension[dimension].tokens.totalTokens += tokens.totalTokens;

      if (!byProvider[provider]) {
        byProvider[provider] = {
          cost: 0,
          tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          models: [],
        };
      }
      byProvider[provider].cost += cost;
      byProvider[provider].tokens.inputTokens += tokens.inputTokens;
      byProvider[provider].tokens.outputTokens += tokens.outputTokens;
      byProvider[provider].tokens.totalTokens += tokens.totalTokens;

      if (!byProvider[provider].models.includes(model)) {
        byProvider[provider].models.push(model);
      }
    };

    for (const { results } of sectionResults) {
      for (const [dimension, result] of Object.entries(results)) {
        processResult(dimension, result);
      }
    }

    for (const [dimension, result] of Object.entries(globalResults)) {
      processResult(dimension, result);
    }

    return {
      totalCost,
      totalTokens: totalInputTokens + totalOutputTokens,
      byDimension,
      byProvider,
      currency: 'USD',
    };
  }

  async getGraphAnalytics(): Promise<GraphAnalytics> {
    if (!this.dependencyGraph) {
      const dimensions = this.plugin.getDimensionNames();
      const deps = this.cachedDependencyGraph || {};
      await this.topologicalSortWithGraph(dimensions, deps);
    }

    const graph = this.dependencyGraph!;
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.cachedDependencyGraph || {};

    const totalDependencies = Object.values(deps).reduce(
        (sum, depList) => sum + depList.length,
        0
    );

    const independentDimensions = dimensions.filter((dim) => {
      const dimDeps = deps[dim] || [];
      return dimDeps.length === 0;
    });

    let maxDepth = 0;
    let criticalPath: string[] = [];

    dimensions.forEach((dim) => {
      const path = this.getLongestPath(graph, dim);
      if (path.length > maxDepth) {
        maxDepth = path.length;
        criticalPath = path;
      }
    });

    const parallelGroups = this.findParallelGroups(dimensions, deps);
    const bottlenecks = this.findBottlenecks(graph, dimensions);

    return {
      totalDimensions: dimensions.length,
      totalDependencies,
      maxDepth,
      criticalPath,
      parallelGroups,
      independentDimensions,
      bottlenecks,
    };
  }

  private getLongestPath(graph: Graph, endNode: string): string[] {
    const paths: string[][] = [];

    const findPaths = (node: string, currentPath: string[] = []): void => {
      const newPath = [...currentPath, node];

      const predecessors = graph.predecessors(node) || [];

      if (predecessors.length === 0) {
        paths.push(newPath);
        return;
      }

      predecessors.forEach((pred) => {
        findPaths(pred, newPath);
      });
    };

    findPaths(endNode);

    return paths.reduce((longest, current) =>
            current.length > longest.length ? current : longest,
        []
    ).reverse();
  }

  private findParallelGroups(
      dimensions: string[],
      deps: Record<string, string[]>
  ): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (const dim of dimensions) {
      if (processed.has(dim)) continue;

      const dimDeps = deps[dim] || [];
      const group = [dim];
      processed.add(dim);

      for (const other of dimensions) {
        if (processed.has(other)) continue;

        const otherDeps = deps[other] || [];

        if (
            dimDeps.length === otherDeps.length &&
            dimDeps.every((d) => otherDeps.includes(d))
        ) {
          group.push(other);
          processed.add(other);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  private findBottlenecks(graph: Graph, dimensions: string[]): string[] {
    const bottlenecks: Array<{ dim: string; dependents: number }> = [];

    dimensions.forEach((dim) => {
      const successors = graph.successors(dim) || [];
      if (successors.length >= 3) {
        bottlenecks.push({ dim, dependents: successors.length });
      }
    });

    return bottlenecks
        .sort((a, b) => b.dependents - a.dependents)
        .map((b) => b.dim);
  }

  async exportGraphDOT(): Promise<string> {
    if (!this.dependencyGraph) {
      const dimensions = this.plugin.getDimensionNames();
      const deps = this.cachedDependencyGraph || {};
      await this.topologicalSortWithGraph(dimensions, deps);
    }

    const graph = this.dependencyGraph!;
    const dimensions = this.plugin.getDimensionNames();

    let dot = 'digraph DagWorkflow {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=rounded];\n\n';

    dimensions.forEach((dim) => {
      const isGlobal = this.plugin.isGlobalDimension(dim);
      const color = isGlobal ? 'lightblue' : 'lightgreen';
      const shape = isGlobal ? 'box' : 'ellipse';
      dot += `  "${dim}" [fillcolor="${color}", style="filled", shape="${shape}"];\n`;
    });

    dot += '\n';

    graph.edges().forEach((edge) => {
      dot += `  "${edge.v}" -> "${edge.w}";\n`;
    });

    dot += '}\n';

    return dot;
  }

  async exportGraphJSON(): Promise<{ nodes: any[]; links: any[] }> {
    if (!this.dependencyGraph) {
      const dimensions = this.plugin.getDimensionNames();
      const deps = this.cachedDependencyGraph || {};
      await this.topologicalSortWithGraph(dimensions, deps);
    }

    const graph = this.dependencyGraph!;
    const dimensions = this.plugin.getDimensionNames();

    const nodes = dimensions.map((dim) => ({
      id: dim,
      label: dim,
      type: this.plugin.isGlobalDimension(dim) ? 'global' : 'section',
    }));

    const links = graph.edges().map((edge) => ({
      source: edge.v,
      target: edge.w,
    }));

    return { nodes, links };
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
}