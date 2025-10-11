import { Plugin } from './plugin';
import { ProviderAdapter, ProviderAdapterConfig } from './providers/adapter';
import { ProviderRegistry } from './providers/registry';
import { SectionData, DimensionResult, DimensionDependencies } from './types';
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
 *
 * @example
 * ```typescript
 * const engine = new DagEngine({
 *   plugin: new MyPlugin(),
 *   providers: {
 *     anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
 *   },
 *   concurrency: 5
 * });
 *
 * const result = await engine.process(sections);
 * const analytics = engine.getGraphAnalytics();
 * ```
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
  private dependencyGraph?: Graph; // Cache for analytics

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

    // Initialize p-queue for concurrency control
    this.queue = new PQueue({
      concurrency: config.concurrency ?? 5,
    });

    // Initialize provider adapter
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
    const sortedDimensions = this.topologicalSort(allDimensions);

    const globalResults: Record<string, DimensionResult> = {};
    const sectionResultsMap = new Map<number, Record<string, DimensionResult>>();
    let currentSections = [...sections];

    currentSections.forEach((_, idx) => {
      sectionResultsMap.set(idx, {});
    });

    // Separate global dimensions into independent groups
    const globalDimensions = sortedDimensions.filter((d) => this.plugin.isGlobalDimension(d));
    const globalGroups = this.groupIndependentGlobals(globalDimensions);

    // Process dimensions in order
    for (const dimension of sortedDimensions) {
      const isGlobal = this.plugin.isGlobalDimension(dimension);

      if (isGlobal) {
        const group = globalGroups.find((g) => g.includes(dimension));
        const isFirstInGroup = group && group[0] === dimension;

        if (isFirstInGroup && group.length > 1) {
          // Process entire group in parallel
          await this.processGlobalGroup(
              group,
              currentSections,
              globalResults,
              sectionResultsMap,
              options
          );

          // Apply transformations for all dimensions in the group
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
          continue; // Already processed in group
        } else {
          // Single global dimension
          await this.processGlobalDimension(
              dimension,
              currentSections,
              globalResults,
              sectionResultsMap,
              options
          );
        }

        // Apply transformation for single global dimension
        currentSections = await this.applyTransformation(
            dimension,
            globalResults[dimension],
            currentSections,
            sectionResultsMap,
            options
        );
      } else {
        // Section dimension - use p-queue for concurrency
        await this.processSectionDimension(
            dimension,
            currentSections,
            globalResults,
            sectionResultsMap,
            options
        );
      }
    }

    const finalSectionResults = currentSections.map((section, idx) => {
      const results = sectionResultsMap.get(idx) || {};
      const processedResults = this.plugin.processResults(results);
      return {
        section,
        results: processedResults,
      };
    });

    return {
      sections: finalSectionResults,
      globalResults,
      transformedSections: currentSections,
    };
  }

  /**
   * Apply transformation if dimension has transform function
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
        const transformed = config.transform(result, currentSections);
        if (Array.isArray(transformed) && transformed.length > 0) {
          // Update sectionResultsMap to match new section count
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

  /**
   * Group independent global dimensions for parallel execution
   * Uses graphlib to analyze dependency graph
   */
  private groupIndependentGlobals(globalDimensions: string[]): string[][] {
    const graph = this.plugin.getDependencies();
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

  /**
   * Process multiple independent global dimensions in parallel
   */
  private async processGlobalGroup(
      dimensions: string[],
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    await Promise.all(
        dimensions.map((dimension) =>
            this.processGlobalDimension(dimension, sections, globalResults, sectionResultsMap, options)
        )
    );
  }

  /**
   * Process a single global dimension
   */
  private async processGlobalDimension(
      dimension: string,
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    try {
      options.onDimensionStart?.(dimension);

      const dependencies = this.resolveGlobalDependencies(
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

  /**
   * Process section dimension using p-queue for concurrency
   */
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

        if (this.shouldSkipDimension(dimension, section, sectionResults, globalResults)) {
          sectionResults[dimension] = {
            data: { skipped: true, reason: 'Skipped by plugin logic' },
          };
          sectionResultsMap.set(sectionIdx, sectionResults);
          return;
        }

        const dependencies = this.resolveDependencies(dimension, sectionResults, globalResults);

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

  /**
   * Check if dimension should be skipped for this section
   */
  private shouldSkipDimension(
      dimension: string,
      section: SectionData,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): boolean {
    if ('shouldSkipDimension' in this.plugin) {
      return (this.plugin as any).shouldSkipDimension(
          dimension,
          section,
          sectionResults,
          globalResults
      );
    }
    return false;
  }

  /**
   * Execute function with timeout
   */
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

  /**
   * Resolve dependencies for global dimensions
   */
  private resolveGlobalDependencies(
      dimension: string,
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      totalSections: number
  ): DimensionDependencies {
    const graph = this.plugin.getDependencies();
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

  /**
   * Resolve dependencies for section dimensions
   */
  private resolveDependencies(
      dimension: string,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): DimensionDependencies {
    const graph = this.plugin.getDependencies();
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
   * Execute dimension with p-retry for automatic retries
   */
  private async executeDimension(
      dimension: string,
      sections: SectionData[],
      dependencies: DimensionDependencies,
      isGlobal: boolean
  ): Promise<DimensionResult> {
    const prompt = this.plugin.createPrompt({
      sections,
      dimension,
      dependencies,
      isGlobal,
    });

    const providerConfig = this.plugin.selectProvider(dimension, sections[0]);

    if (!this.adapter.hasProvider(providerConfig.provider)) {
      throw new Error(
          `Provider "${providerConfig.provider}" not found. Available: ${this.adapter.listProviders().join(', ')}`
      );
    }

    const response = await pRetry(
        async () => {
          const result = await this.adapter.execute(providerConfig.provider, {
            input: prompt,
            options: providerConfig.options,
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
                `Attempt ${error.attemptNumber} failed for dimension "${dimension}". ${error.retriesLeft} retries left.`
            );
          },
        }
    );

    return { data: response.data };
  }

  /**
   * Topological sort using graphlib
   * Provides detailed cycle detection for better debugging
   */
  private topologicalSort(dimensions: string[]): string[] {
    const graph = new Graph();
    const deps = this.plugin.getDependencies();

    // Add all dimensions as nodes
    dimensions.forEach((dim) => graph.setNode(dim));

    // Add edges for dependencies
    Object.entries(deps).forEach(([node, nodeDeps]) => {
      nodeDeps.forEach((dep) => {
        if (dimensions.includes(dep)) {
          graph.setEdge(dep, node);
        }
      });
    });

    // Check for cycles with detailed error message
    if (!alg.isAcyclic(graph)) {
      const cycles = alg.findCycles(graph);
      const cycleStr = cycles[0]?.join(' → ');
      throw new Error(
          `Circular dependency detected: ${cycleStr}\n` +
          `Please review your getDependencies() configuration.`
      );
    }

    // Cache the graph for analytics
    this.dependencyGraph = graph;

    // Return topologically sorted dimensions
    return alg.topsort(graph);
  }

  /**
   * Get comprehensive graph analytics for enterprise reporting
   *
   * @example
   * ```typescript
   * const analytics = engine.getGraphAnalytics();
   * console.log(`Workflow has ${analytics.totalDimensions} dimensions`);
   * console.log(`Critical path: ${analytics.criticalPath.join(' → ')}`);
   * console.log(`Can parallelize: ${analytics.parallelGroups.length} groups`);
   * ```
   */
  getGraphAnalytics(): GraphAnalytics {
    if (!this.dependencyGraph) {
      // Build graph if not cached
      const dimensions = this.plugin.getDimensionNames();
      this.topologicalSort(dimensions);
    }

    const graph = this.dependencyGraph!;
    const dimensions = this.plugin.getDimensionNames();
    const deps = this.plugin.getDependencies();

    // Calculate total dependencies
    const totalDependencies = Object.values(deps).reduce(
        (sum, depList) => sum + depList.length,
        0
    );

    // Find independent dimensions (no dependencies)
    const independentDimensions = dimensions.filter((dim) => {
      const dimDeps = deps[dim] || [];
      return dimDeps.length === 0;
    });

    // Calculate max depth (longest path)
    let maxDepth = 0;
    let criticalPath: string[] = [];

    dimensions.forEach((dim) => {
      const path = this.getLongestPath(graph, dim);
      if (path.length > maxDepth) {
        maxDepth = path.length;
        criticalPath = path;
      }
    });

    // Find parallel groups
    const parallelGroups = this.findParallelGroups(dimensions, deps);

    // Find bottlenecks (dimensions with many dependents)
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

  /**
   * Get longest path to a dimension (for critical path analysis)
   */
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

    // Return longest path
    return paths.reduce((longest, current) =>
            current.length > longest.length ? current : longest,
        []
    ).reverse();
  }

  /**
   * Find dimensions that can be processed in parallel
   */
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

      // Find dimensions with same dependencies
      for (const other of dimensions) {
        if (processed.has(other)) continue;

        const otherDeps = deps[other] || [];

        // Check if dependencies are the same
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

  /**
   * Find bottleneck dimensions (many dimensions depend on them)
   */
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

  /**
   * Export graph in DOT format for visualization
   * Can be rendered with Graphviz or d3-graphviz
   *
   * @example
   * ```typescript
   * const dot = engine.exportGraphDOT();
   * fs.writeFileSync('workflow.dot', dot);
   * // Render with: dot -Tpng workflow.dot -o workflow.png
   * ```
   */
  exportGraphDOT(): string {
    if (!this.dependencyGraph) {
      const dimensions = this.plugin.getDimensionNames();
      this.topologicalSort(dimensions);
    }

    const graph = this.dependencyGraph!;
    const dimensions = this.plugin.getDimensionNames();

    let dot = 'digraph DagWorkflow {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=rounded];\n\n';

    // Add nodes with colors for global vs section
    dimensions.forEach((dim) => {
      const isGlobal = this.plugin.isGlobalDimension(dim);
      const color = isGlobal ? 'lightblue' : 'lightgreen';
      const shape = isGlobal ? 'box' : 'ellipse';
      dot += `  "${dim}" [fillcolor="${color}", style="filled", shape="${shape}"];\n`;
    });

    dot += '\n';

    // Add edges
    graph.edges().forEach((edge) => {
      dot += `  "${edge.v}" -> "${edge.w}";\n`;
    });

    dot += '}\n';

    return dot;
  }

  /**
   * Export graph in JSON format for web visualization
   * Compatible with D3.js, Cytoscape.js, vis.js
   *
   * @example
   * ```typescript
   * const graphData = engine.exportGraphJSON();
   * // Use with D3.js force layout
   * d3.forceSimulation(graphData.nodes)
   *   .force('link', d3.forceLink(graphData.links))
   * ```
   */
  exportGraphJSON(): { nodes: any[]; links: any[] } {
    if (!this.dependencyGraph) {
      const dimensions = this.plugin.getDimensionNames();
      this.topologicalSort(dimensions);
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

  /**
   * Get the provider adapter instance
   */
  getAdapter(): ProviderAdapter {
    return this.adapter;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return this.adapter.listProviders();
  }

  /**
   * Get the queue instance for monitoring
   *
   * @example
   * ```typescript
   * const queue = engine.getQueue();
   * console.log(`Queue: ${queue.size} waiting, ${queue.pending} active`);
   * ```
   */
  getQueue(): PQueue {
    return this.queue;
  }
}