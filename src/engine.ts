import { Plugin } from './plugin';
import { ProviderAdapter, ProviderAdapterConfig } from './providers/adapter';
import { ProviderRegistry } from './providers/registry';
import { SectionData, DimensionResult, DimensionDependencies } from './types';

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

  // NEW: Error handling
  continueOnError?: boolean;  // Continue processing when dimension fails (default: true)

  // NEW: Timeout handling
  timeout?: number;  // Global timeout in ms (default: 60000)
  dimensionTimeouts?: Record<string, number>;  // Per-dimension timeouts
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

export class DagEngine {
  private readonly plugin: Plugin;
  private readonly adapter: ProviderAdapter;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly continueOnError: boolean;
  private readonly timeout: number;
  private readonly dimensionTimeouts: Record<string, number>;

  constructor(config: EngineConfig) {
    this.plugin = config.plugin;
    this.concurrency = config.concurrency || 5;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.continueOnError = config.continueOnError ?? true;  // Default: continue
    this.timeout = config.timeout || 60000;  // Default: 60 seconds
    this.dimensionTimeouts = config.dimensionTimeouts || {};

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
      registryProviders.forEach(name => {
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

    // NEW: Separate global dimensions into independent groups
    const globalDimensions = sortedDimensions.filter(d => this.plugin.isGlobalDimension(d));
    const globalGroups = this.groupIndependentGlobals(globalDimensions);

    // Process dimensions in order
    for (const dimension of sortedDimensions) {
      const isGlobal = this.plugin.isGlobalDimension(dimension);

      if (isGlobal) {
        // Check if this global is part of a parallel group
        const group = globalGroups.find(g => g.includes(dimension));
        const isFirstInGroup = group && group[0] === dimension;

        if (isFirstInGroup && group.length > 1) {
          // NEW: Process entire group in parallel
          await this.processGlobalGroup(
              group,
              currentSections,
              globalResults,
              sectionResultsMap,
              options
          );

          // Skip other dimensions in this group (already processed)
          continue;
        } else if (group && group[0] !== dimension) {
          // Already processed in group
          continue;
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

        // Apply transformation
        const config = this.plugin.getDimensionConfig(dimension);
        const result = globalResults[dimension];

        if (config.transform && result?.data) {
          const transformed = config.transform(result, currentSections);
          if (Array.isArray(transformed) && transformed.length > 0) {
            const newMap = new Map<number, Record<string, DimensionResult>>();
            transformed.forEach((_, idx) => {
              newMap.set(idx, {});
            });

            sectionResultsMap.clear();
            newMap.forEach((value, key) => {
              sectionResultsMap.set(key, value);
            });

            currentSections = transformed;
          }
        }
      } else {
        // Section dimension
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
        results: processedResults
      };
    });

    return {
      sections: finalSectionResults,
      globalResults,
      transformedSections: currentSections,
    };
  }

  /**
   * NEW: Group independent global dimensions for parallel processing
   */
  private groupIndependentGlobals(globalDimensions: string[]): string[][] {
    const graph = this.plugin.getDependencies();
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (const dim of globalDimensions) {
      if (processed.has(dim)) continue;

      const deps = graph[dim] || [];
      const hasDeps = deps.some(d => globalDimensions.includes(d));

      if (hasDeps) {
        // Has dependencies, process alone
        groups.push([dim]);
        processed.add(dim);
      } else {
        // No dependencies, can be grouped
        const group = [dim];
        processed.add(dim);

        // Find other independent globals
        for (const other of globalDimensions) {
          if (processed.has(other)) continue;

          const otherDeps = graph[other] || [];
          const hasOtherDeps = otherDeps.some(d => globalDimensions.includes(d));

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
   * NEW: Process multiple independent global dimensions in parallel
   */
  private async processGlobalGroup(
      dimensions: string[],
      sections: SectionData[],
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      options: ProcessOptions
  ): Promise<void> {
    await Promise.all(
        dimensions.map(dimension =>
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

      // NEW: Check if dependencies have errors
      const hasFailedDeps = Object.values(dependencies).some(dep => dep.error);
      if (hasFailedDeps && !this.continueOnError) {
        throw new Error(`Dependencies failed for dimension "${dimension}"`);
      }

      // NEW: Apply timeout
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
    for (let i = 0; i < sections.length; i += this.concurrency) {
      const batch = sections.slice(i, i + this.concurrency);

      await Promise.all(
          batch.map(async (section, batchIdx) => {
            const sectionIdx = i + batchIdx;

            try {
              if (batchIdx === 0) {
                options.onSectionStart?.(sectionIdx, sections.length);
              }

              const sectionResults = sectionResultsMap.get(sectionIdx) || {};

              // NEW: Check if should skip this dimension for this section
              if (this.shouldSkipDimension(dimension, section, sectionResults, globalResults)) {
                sectionResults[dimension] = {
                  data: { skipped: true, reason: 'Skipped by plugin logic' }
                };
                sectionResultsMap.set(sectionIdx, sectionResults);
                return;
              }

              const dependencies = this.resolveDependencies(
                  dimension,
                  sectionResults,
                  globalResults
              );

              // NEW: Check if dependencies have errors
              const hasFailedDeps = Object.values(dependencies).some(dep => dep.error);
              if (hasFailedDeps && !this.continueOnError) {
                throw new Error(`Dependencies failed for dimension "${dimension}"`);
              }

              // NEW: Apply timeout
              const result = await this.executeWithTimeout(
                  () => this.executeDimension(dimension, [section], dependencies, false),
                  dimension
              );

              sectionResults[dimension] = result;
              sectionResultsMap.set(sectionIdx, sectionResults);

              if (batchIdx === 0) {
                options.onSectionComplete?.(sectionIdx, sections.length);
              }
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              options.onError?.(`section-${sectionIdx}-${dimension}`, err);

              const sectionResults = sectionResultsMap.get(sectionIdx) || {};
              sectionResults[dimension] = { error: err.message };
              sectionResultsMap.set(sectionIdx, sectionResults);

              // NEW: Don't throw, continue to next section if continueOnError is true
              if (!this.continueOnError) {
                throw error;
              }
            }
          })
      );
    }
  }

  /**
   * NEW: Check if dimension should be skipped for this section
   */
  private shouldSkipDimension(
      dimension: string,
      section: SectionData,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): boolean {
    // Check if plugin implements shouldSkipDimension
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
   * NEW: Execute function with timeout
   */
  private async executeWithTimeout<T>(
      fn: () => Promise<T>,
      dimension: string
  ): Promise<T> {
    const timeoutMs = this.dimensionTimeouts[dimension] || this.timeout;

    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
          setTimeout(
              () => reject(new Error(`Timeout after ${timeoutMs}ms for dimension "${dimension}"`)),
              timeoutMs
          )
      )
    ]);
  }

  private resolveGlobalDependencies(
      dimension: string,
      globalResults: Record<string, DimensionResult>,
      sectionResultsMap: Map<number, Record<string, DimensionResult>>,
      totalSections: number
  ): DimensionDependencies {
    const graph = this.plugin.getDependencies();
    const deps: DimensionDependencies = {};

    for (const depName of graph[dimension] || []) {
      if (this.plugin.isGlobalDimension(depName)) {
        deps[depName] = globalResults[depName] || {
          error: `Global dependency "${depName}" not found`
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
              totalSections
            }
          };
        } else {
          deps[depName] = {
            error: `Section dependency "${depName}" not yet processed`
          };
        }
      }
    }

    return deps;
  }

  private resolveDependencies(
      dimension: string,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): DimensionDependencies {
    const graph = this.plugin.getDependencies();
    const deps: DimensionDependencies = {};

    for (const depName of graph[dimension] || []) {
      if (this.plugin.isGlobalDimension(depName)) {
        deps[depName] = globalResults[depName] || {
          error: `Global dependency "${depName}" not found`
        };
      } else {
        deps[depName] = sectionResults[depName] || {
          error: `Section dependency "${depName}" not found`
        };
      }
    }

    return deps;
  }

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

    const response = await this.retry(() =>
        this.adapter.execute(providerConfig.provider, {
          input: prompt,
          options: providerConfig.options,
        })
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return { data: response.data };
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private topologicalSort(dimensions: string[]): string[] {
    const graph = this.plugin.getDependencies();
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (dim: string): void => {
      if (visiting.has(dim)) {
        throw new Error(`Circular dependency detected: ${dim}`);
      }
      if (visited.has(dim)) return;

      visiting.add(dim);
      const deps = graph[dim] || [];
      deps.forEach(dep => {
        if (dimensions.includes(dep)) visit(dep);
      });
      visiting.delete(dim);
      visited.add(dim);
      result.push(dim);
    };

    dimensions.forEach(dim => {
      if (!visited.has(dim)) visit(dim);
    });

    return result;
  }

  getAdapter(): ProviderAdapter {
    return this.adapter;
  }

  getAvailableProviders(): string[] {
    return this.adapter.listProviders();
  }
}