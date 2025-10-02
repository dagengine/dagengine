import {ProviderAdapter, ProviderConfigurations} from "./providers/provider-adapter";
import { BasePlugin, SectionData, DimensionResult } from "./base-plugin";
import { retry } from "./utils";

export interface DagEngineConfig {
  providers: ProviderConfigurations;
  plugin: BasePlugin;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ProcessingOptions {
  onSectionStart?: (sectionIndex: number, totalSections: number) => void;
  onSectionComplete?: (sectionIndex: number, result: DimensionResult, totalSections: number) => void;
  onDimensionStart?: (dimension: string) => void;
  onDimensionComplete?: (dimension: string, result: DimensionResult) => void;
  onError?: (context: string, error: Error) => void;
  failOnDependencyError?: boolean;
}

export interface SectionResult {
  section: SectionData;
  response: Record<string, DimensionResult>;
  error?: string;
  sectionIndex: number;
}

export interface ProcessingResult {
  sections: SectionResult[];
  globalResults: Record<string, DimensionResult>;
  finalSections: SectionData[];
}

export class DagEngine {
  private readonly providerAdapter: ProviderAdapter;
  private readonly plugin: BasePlugin;
  private readonly config: DagEngineConfig;
  private globalResults = new Map<string, DimensionResult>();
  private currentSections: SectionData[] = [];

  public static readonly DEFAULT_CONCURRENCY = 3;
  public static readonly DEFAULT_MAX_RETRIES = 3;
  public static readonly DEFAULT_RETRY_DELAY = 1000;

  constructor(config: DagEngineConfig) {
    this.providerAdapter = new ProviderAdapter(config.providers);
    this.plugin = config.plugin;
    this.config = config;
  }

  async process(
      sections: SectionData[],
      options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    if (!sections?.length) {
      throw new Error("No sections provided for processing");
    }

    this.currentSections = [...sections]; // Copy for potential transformation

    // Process global dimensions first (with dependency order)
    await this.processGlobalDimensions(options);

    // Process section-level dimensions
    const sectionResults = await this.processSections(this.currentSections, options);

    return {
      sections: sectionResults,
      globalResults: Object.fromEntries(this.globalResults),
      finalSections: this.currentSections
    };
  }

  private async processGlobalDimensions(options: ProcessingOptions): Promise<void> {
    const globalDimensions = this.plugin.getDimensionNames().filter(dim =>
        this.plugin.isGlobalDimension(dim)
    );

    // Sort global dimensions by dependencies (topological sort)
    const sortedDimensions = this.topologicalSort(globalDimensions);

    for (const dimension of sortedDimensions) {
      try {
        options.onDimensionStart?.(dimension);

        const result = await this.processGlobalDimension(dimension);
        this.globalResults.set(dimension, result);

        // Apply transformation if needed (preserve original functionality)
        await this.applyTransformation(dimension, result);

        options.onDimensionComplete?.(dimension, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.(`global-dimension-${dimension}`, err);

        this.globalResults.set(dimension, {
          error: err.message
        });
      }
    }
  }

  private topologicalSort(dimensions: string[]): string[] {
    const graph = this.plugin.getDimensionDependencyGraph();
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (dimension: string): void => {
      if (visiting.has(dimension)) {
        throw new Error(`Circular dependency detected in global dimensions at: ${dimension}`);
      }

      if (visited.has(dimension)) {
        return;
      }

      visiting.add(dimension);

      // Visit dependencies first (only global ones)
      const dependencies = graph[dimension] || [];
      dependencies.forEach(depName => {
        if (dimensions.includes(depName)) {
          visit(depName);
        }
      });

      visiting.delete(dimension);
      visited.add(dimension);
      result.push(dimension);
    };

    dimensions.forEach(dimension => {
      if (!visited.has(dimension)) {
        visit(dimension);
      }
    });

    return result;
  }

  private async processGlobalDimension(dimension: string): Promise<DimensionResult> {
    const dependencies = this.getGlobalDependencies(dimension);
    const providerConfig = this.plugin.getProviderConfigForDimension(dimension);

    const prompt = this.plugin.createDimensionPrompt(
        this.currentSections, // Global dimensions analyze all sections
        dimension,
        dependencies
    );

    const serviceResponse = await retry(
        async () => await this.providerAdapter.processPrompt(prompt, providerConfig),
        {
          maxRetries: this.config.maxRetries || DagEngine.DEFAULT_MAX_RETRIES,
          baseDelay: this.config.retryDelay || DagEngine.DEFAULT_RETRY_DELAY
        }
    );

    // Convert ServiceResponse to DimensionResult
    if (serviceResponse.success) {
      return { response: serviceResponse.data };
    } else {
      return { error: serviceResponse.error || 'Unknown error' };
    }
  }

  private async applyTransformation(dimension: string, result: DimensionResult): Promise<void> {
    const dimensionConfig = this.plugin.getDimensionConfig(dimension);
    const providerConfig = this.plugin.getProviderConfigForDimension(dimension);

    if (dimensionConfig?.transform && typeof dimensionConfig.transform === 'function') {
      try {
        const transformedSections = dimensionConfig.transform(result, this.currentSections, providerConfig);
        if (Array.isArray(transformedSections)) {
          this.currentSections = transformedSections;
        }
      } catch (error) {
        console.warn(`Transform function failed for dimension ${dimension}:`, error);
        // Continue with original sections
      }
    }
  }

  private async processSections(
      sections: SectionData[],
      options: ProcessingOptions
  ): Promise<SectionResult[]> {
    const concurrency = this.config.concurrency || DagEngine.DEFAULT_CONCURRENCY;
    const results: SectionResult[] = [];

    // Process sections in concurrent batches
    for (let i = 0; i < sections.length; i += concurrency) {
      const batch = sections.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
          batch.map((section, batchIndex) =>
              this.processSingleSection(section, i + batchIndex, sections.length, options)
          )
      );

      batchResults.forEach((result, batchIndex) => {
        const sectionIndex = i + batchIndex;
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const error = result.reason instanceof Error ? result.reason.message : 'Processing failed';

          if (batch[batchIndex]) {
            results.push({
              section: batch[batchIndex],
              response: {},
              error,
              sectionIndex
            });
          }

          options.onError?.(`section-${sectionIndex}`, result.reason);
        }
      });
    }

    return results;
  }

  private async processSingleSection(
      section: SectionData,
      sectionIndex: number,
      totalSections: number,
      options: ProcessingOptions
  ): Promise<SectionResult> {
    options.onSectionStart?.(sectionIndex, totalSections);

    try {
      const sectionDimensions = this.plugin.getDimensionNames().filter(dim =>
          !this.plugin.isGlobalDimension(dim)
      );

      const response = await this.processSectionDimensions(section, sectionDimensions, options);

      const result: SectionResult = {
        section,
        response,
        sectionIndex
      };

      options.onSectionComplete?.(sectionIndex, { response }, totalSections);
      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(`section-${sectionIndex}`, err);
      return {
        section,
        response: {},
        error: err.message,
        sectionIndex
      };
    }
  }

  private async processSectionDimensions(
      section: SectionData,
      dimensions: string[],
      options: ProcessingOptions
  ): Promise<Record<string, DimensionResult>> {
    const analysis: Record<string, DimensionResult> = {};
    const dependencyGraph = this.plugin.getDimensionDependencyGraph();

    // Sort dimensions by dependencies
    const sortedDimensions = this.topologicalSortSection(dimensions, dependencyGraph);

    for (const dimension of sortedDimensions) {
      try {
        options.onDimensionStart?.(dimension);

        const dependencies = this.getSectionDependencies(dimension, analysis);
        const result = await this.processSectionDimension(section, dimension, dependencies);
        analysis[dimension] = result;

        options.onDimensionComplete?.(dimension, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        analysis[dimension] = { error: err.message };
        options.onError?.(`dimension-${dimension}`, err);

        // Stop processing if failOnDependencyError is true
        if (options.failOnDependencyError !== false) {
          break;
        }
      }
    }

    return analysis;
  }

  private topologicalSortSection(dimensions: string[], graph: Record<string, string[]>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (dimension: string): void => {
      if (visiting.has(dimension)) {
        throw new Error(`Circular dependency detected at: ${dimension}`);
      }

      if (visited.has(dimension)) {
        return;
      }

      visiting.add(dimension);

      const dependencies = graph[dimension] || [];
      dependencies.forEach(depName => {
        if (dimensions.includes(depName)) {
          visit(depName);
        }
      });

      visiting.delete(dimension);
      visited.add(dimension);
      result.push(dimension);
    };

    dimensions.forEach(dimension => {
      if (!visited.has(dimension)) {
        visit(dimension);
      }
    });

    return result;
  }

  private async processSectionDimension(
      section: SectionData,
      dimension: string,
      dependencies: Record<string, DimensionResult>
  ): Promise<DimensionResult> {
    const dimensionConfig = this.plugin.getProviderConfigForDimension(dimension);

    const prompt = this.plugin.createDimensionPrompt(
        [section],
        dimension,
        dependencies
    );

    const serviceResponse = await retry(
        async () => await this.providerAdapter.processPrompt(prompt, dimensionConfig),
        {
          maxRetries: this.config.maxRetries || DagEngine.DEFAULT_MAX_RETRIES,
          baseDelay: this.config.retryDelay || DagEngine.DEFAULT_RETRY_DELAY
        }
    );

    // Convert ServiceResponse to DimensionResult
    if (serviceResponse.success) {
      return { response: serviceResponse.data };
    } else {
      return { error: serviceResponse.error || 'Unknown error' };
    }
  }

  private getGlobalDependencies(dimension: string): Record<string, DimensionResult> {
    const graph = this.plugin.getDimensionDependencyGraph();
    const deps: Record<string, DimensionResult> = {};

    for (const depName of graph[dimension] || []) {
      const result = this.globalResults.get(depName);
      if (result) {
        deps[depName] = result;
      } else {
        deps[depName] = { error: `Missing dependency: ${depName}` };
      }
    }

    return deps;
  }

  private getSectionDependencies(
      dimension: string,
      currentAnalysis: Record<string, DimensionResult>
  ): Record<string, DimensionResult> {
    const graph = this.plugin.getDimensionDependencyGraph();
    const deps: Record<string, DimensionResult> = {};

    for (const depName of graph[dimension] || []) {
      if (this.plugin.isGlobalDimension(depName)) {
        // Global dependency
        const result = this.globalResults.get(depName);
        if (result) {
          deps[depName] = result;
        } else {
          deps[depName] = { error: `Missing global dependency: ${depName}` };
        }
      } else {
        // Section dependency
        const result = currentAnalysis[depName];
        if (result) {
          deps[depName] = result;
        } else {
          deps[depName] = { error: `Missing section dependency: ${depName}` };
        }
      }
    }

    return deps;
  }
}