import { Plugin } from './plugin';
import { ProviderAdapter, ProviderAdapterConfig } from './providers/adapter';
import { ProviderRegistry } from './providers/registry';
import { SectionData, DimensionResult, DimensionDependencies, PricingConfig, CostSummary, DimensionCost, TokenUsage } from './types';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { Graph, alg } from '@dagrejs/graphlib';

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

export interface ProcessOptions {
  onDimensionStart?: (dimension: string) => void;
  onDimensionComplete?: (dimension: string, result: DimensionResult) => void;
  onSectionStart?: (index: number, total: number) => void;
  onSectionComplete?: (index: number, total: number) => void;
  onError?: (context: string, error: Error) => void;
}

export interface ProcessResult {
  sections: Array<{
    section: SectionData;
    results: Record<string, DimensionResult>;
  }>;
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  costs?: CostSummary;
}

/**
 * Graph analytics for enterprise features
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
 * DagEngine - AI-powered workflow orchestration with advanced graph analytics
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
    if (!sections.length) {
      throw new Error('DagEngine.process() requires at least one section');
    }

    const allDimensions = this.plugin.getDimensionNames();
    const sortedDimensions = await this.topologicalSort(allDimensions);

    const globalResults: Record<string, DimensionResult> = {};
    const sectionResultsMap = new Map<number, Record<string, DimensionResult>>();
    let currentSections = [...sections];

    currentSections.forEach((_, idx) => {
      sectionResultsMap.set(idx, {});
    });

    const globalDimensions = sortedDimensions.filter((d) => this.plugin.isGlobalDimension(d));
    const globalGroups = await this.groupIndependentGlobals(globalDimensions);

    for (const dimension of sortedDimensions) {
      const isGlobal = this.plugin.isGlobalDimension(dimension);

      if (isGlobal) {
        const group = globalGroups.find((g) => g.includes(dimension));
        const isFirstInGroup = group && group[0] === dimension;

        if (isFirstInGroup && group.length > 1) {
          await this.processGlobalGroup(
              group,
              currentSections,
              globalResults,
              sectionResultsMap,
              options
          );

          for (const groupDim of group) {
            currentSections = await this.applyTransformation(
                groupDim,
                globalResults[groupDim],
                currentSections,
                sectionResultsMap,
                options
            );
          }
          continue;
        } else if (group && group[0] !== dimension) {
          continue;
        } else {
          await this.processGlobalDimension(
              dimension,
              currentSections,
              globalResults,
              sectionResultsMap,
              options
          );
        }

        currentSections = await this.applyTransformation(
            dimension,
            globalResults[dimension],
            currentSections,
            sectionResultsMap,
            options
        );
      } else {
        await this.processSectionDimension(
            dimension,
            currentSections,
            globalResults,
            sectionResultsMap,
            options
        );
      }
    }

    // ✅ UPDATED: Process results with async support
    const finalSectionResults = await Promise.all(
        currentSections.map(async (section, idx) => {
          const results = sectionResultsMap.get(idx) || {};
          // ✅ Await processResults (can be async now)
          const processedResults = await Promise.resolve(
              this.plugin.processResults(results)
          );
          return {
            section,
            results: processedResults,
          };
        })
    );

    const costs = this.pricing
        ? this.calculateCosts(finalSectionResults, globalResults)
        : undefined;

    return {
      sections: finalSectionResults,
      globalResults,
      transformedSections: currentSections,
      ...(costs && { costs })
    };
  }

  private async processGlobalGroup(
      dimensions: string[],
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    const dimensionsToProcess: string[] = [];

    for (const dimension of dimensions) {
      if (await this.shouldSkipGlobalDimension(dimension, sections, globalResults, sectionResultsMap)) {
        globalResults[dimension] = {
          data: {
            skipped: true,
            reason: 'Skipped by plugin shouldSkipGlobalDimension'
          },
        };
        options.onDimensionComplete?.(dimension, globalResults[dimension]);
      } else {
        dimensionsToProcess.push(dimension);
      }
    }

    if (dimensionsToProcess.length > 0) {
      await Promise.all(
          dimensionsToProcess.map((dimension) =>
              this.processGlobalDimension(
                  dimension,
                  sections,
                  globalResults,
                  sectionResultsMap,
                  options
              )
          )
      );
    }
  }

  /**
   * ✅ UPDATED: Apply transformation (can be async now)
   */
  private async applyTransformation(
      dimension: string,
      result: DimensionResult | undefined,
      currentSections: SectionData[],
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<SectionData[]> {
    const config = this.plugin.getDimensionConfig(dimension);

    if (config.transform && result?.data) {
      try {
        // ✅ Await transform (can be async now)
        const transformed = await Promise.resolve(
            config.transform(result, currentSections)
        );

        if (Array.isArray(transformed) && transformed.length > 0) {
          const newMap = new Map<number, Record<string, DimensionResult>>();
          transformed.forEach((_, idx) => {
            newMap.set(idx, {});
          });

          sectionResultsMap.clear();
          newMap.forEach((value, key) => {
            sectionResultsMap.set(key, value);
          });

          return transformed;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.(`transform-${dimension}`, err);
      }
    }

    return currentSections;
  }

  private async groupIndependentGlobals(globalDimensions: string[]): Promise<string[][]> {
    const graph = await Promise.resolve(this.plugin.getDependencies());
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (const dim of globalDimensions) {
      if (processed.has(dim)) continue;

      const deps = graph[dim] || [];
      const hasDeps = deps.length > 0;

      if (hasDeps) {
        groups.push([dim]);
        processed.add(dim);
      } else {
        const group = [dim];
        processed.add(dim);

        for (const other of globalDimensions) {
          if (processed.has(other)) continue;

          const otherDeps = graph[other] || [];
          const hasOtherDeps = otherDeps.length > 0;

          if (!hasOtherDeps) {
            group.push(other);
            processed.add(other);
          }
        }

        groups.push(group);
      }
    }

    return groups;
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

      if (await this.shouldSkipGlobalDimension(dimension, sections, globalResults, sectionResultsMap)) {
        globalResults[dimension] = {
          data: {
            skipped: true,
            reason: 'Skipped by plugin shouldSkipGlobalDimension'
          },
        };
        options.onDimensionComplete?.(dimension, globalResults[dimension]);
        return;
      }

      const dependencies = await this.resolveGlobalDependencies(
          dimension,
          globalResults,
          sectionResultsMap,
          sections.length
      );

      const hasFailedDeps = Object.values(dependencies).some((dep) => dep.error);
      if (hasFailedDeps && !this.continueOnError) {
        throw new Error(`Dependencies failed for dimension "${dimension}"`);
      }

      const result = await this.executeWithTimeout(
          () => this.executeDimension(dimension, sections, dependencies, true),
          dimension
      );

      globalResults[dimension] = result;
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

        if (await this.shouldSkipDimension(dimension, section, sectionResults, globalResults)) {
          sectionResults[dimension] = {
            data: {
              skipped: true,
              reason: 'Skipped by plugin shouldSkipDimension'
            },
          };
          sectionResultsMap.set(sectionIdx, sectionResults);

          if (sectionIdx === 0) {
            options.onSectionComplete?.(sectionIdx, sections.length);
          }
          return;
        }

        const dependencies = await this.resolveDependencies(dimension, sectionResults, globalResults);

        const hasFailedDeps = Object.values(dependencies).some((dep) => dep.error);
        if (hasFailedDeps && !this.continueOnError) {
          throw new Error(`Dependencies failed for dimension "${dimension}"`);
        }

        const result = await this.executeWithTimeout(
            () => this.executeDimension(dimension, [section], dependencies, false),
            dimension
        );

        sectionResults[dimension] = result;
        sectionResultsMap.set(sectionIdx, sectionResults);

        if (sectionIdx === 0) {
          options.onSectionComplete?.(sectionIdx, sections.length);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
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

  private async shouldSkipDimension(
      dimension: string,
      section: SectionData,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): Promise<boolean> {
    if (!this.plugin.shouldSkipDimension) {
      return false;
    }

    try {
      const dependencies = await this.resolveDependencies(
          dimension,
          sectionResults,
          globalResults
      );

      const shouldSkip = this.plugin.shouldSkipDimension(
          dimension,
          section,
          {
            dependencies,
            globalResults
          }
      );

      return await Promise.resolve(shouldSkip);

    } catch (error) {
      console.error(
          `Error in shouldSkipDimension for dimension "${dimension}":`,
          error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  private async shouldSkipGlobalDimension(
      dimension: string,
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>
  ): Promise<boolean> {
    if (!this.plugin.shouldSkipGlobalDimension) {
      return false;
    }

    try {
      const dependencies = await this.resolveGlobalDependencies(
          dimension,
          globalResults,
          sectionResultsMap,
          sections.length
      );

      const shouldSkip = this.plugin.shouldSkipGlobalDimension(
          dimension,
          sections,
          {
            dependencies
          }
      );

      return await Promise.resolve(shouldSkip);

    } catch (error) {
      console.error(
          `Error in shouldSkipGlobalDimension for dimension "${dimension}":`,
          error instanceof Error ? error.message : String(error)
      );
      return false;
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
    const graph = await Promise.resolve(this.plugin.getDependencies());
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
    const graph = await Promise.resolve(this.plugin.getDependencies());
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

  /**
   * ✅ UPDATED: executeDimension with async createPrompt and selectProvider
   */
  private async executeDimension(
      dimension: string,
      sections: SectionData[],
      dependencies: DimensionDependencies,
      isGlobal: boolean
  ): Promise<DimensionResult> {
    // ✅ Await createPrompt (can be async now)
    const prompt = await Promise.resolve(
        this.plugin.createPrompt({
          sections,
          dimension,
          dependencies,
          isGlobal,
        })
    );

    // ✅ Await selectProvider (can be async now)
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

    for (let i = 0; i < providersToTry.length; i++) {
      const currentProvider = providersToTry[i]!;

      if (!this.adapter.hasProvider(currentProvider.provider)) {
        const availableProviders = this.adapter.listProviders().join(', ');
        lastError = new Error(
            `Provider "${currentProvider.provider}" not found. Available: ${availableProviders}`
        );
        continue;
      }

      try {
        if (i > 0 && currentProvider.retryAfter) {
          await new Promise(resolve => setTimeout(resolve, currentProvider.retryAfter));
        }

        const response = await pRetry(
            async () => {
              const result = await this.adapter.execute(currentProvider.provider, {
                input: prompt,
                options: currentProvider.options,
                dimension: dimension,
                isGlobal: isGlobal,
                metadata: {
                  totalSections: sections.length,
                }
              });

              if (result.error) {
                throw new Error(result.error);
              }

              return result;
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

        return {
          data: response.data,
          ...(response.metadata && { metadata: response.metadata })
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (i < providersToTry.length - 1) {
          console.warn(
              `Provider "${currentProvider.provider}" failed for dimension "${dimension}". Trying fallback provider "${providersToTry[i + 1]!.provider}"...`
          );
        }
      }
    }

    throw lastError || new Error(`All providers failed for dimension "${dimension}"`);
  }

  /**
   * ✅ UPDATED: topologicalSort with async getDependencies
   */
  private async topologicalSort(dimensions: string[]): Promise<string[]> {
    const graph = new Graph();

    // ✅ Await getDependencies (can be async now)
    const deps = await Promise.resolve(this.plugin.getDependencies());

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
          `Please review your getDependencies() configuration.`
      );
    }

    this.dependencyGraph = graph;

    return alg.topsort(graph);
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
      await this.topologicalSort(dimensions);
    }

    const graph = this.dependencyGraph!;
    const dimensions = this.plugin.getDimensionNames();
    const deps = await Promise.resolve(this.plugin.getDependencies());

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
      const dimensions = this.plugin.getDimensionNames()
      await this.topologicalSort(dimensions);
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
      await this.topologicalSort(dimensions);
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