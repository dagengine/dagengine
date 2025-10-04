import { AIAdapterConfig, AIAdapter } from "./providers/ai-adapter";
import {
  BasePlugin,
  SectionData,
  DimensionResult,
  DependencyOutputs,
} from "./base-plugin";
import { retry } from "./utils";

/**
 * Configuration for the DagEngine
 */
export interface DagEngineConfig {
  ai: AIAdapterConfig;
  plugin: BasePlugin;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Options for customizing processing behavior
 */
export interface ProcessingOptions {
  onSectionStart?: (sectionIndex: number, totalSections: number) => void;
  onSectionComplete?: (
      sectionIndex: number,
      result: unknown,
      totalSections: number,
  ) => void;
  onDimensionStart?: (dimension: string) => void;
  onDimensionComplete?: (dimension: string, result: unknown) => void;
  onError?: (indexOrDimension: number | string, error: Error) => void;
  failOnDependencyError?: boolean;
}

/**
 * Result of processing a single section
 */
export interface SectionResult {
  section: SectionData;
  analysis?: Record<string, DimensionResult>;
  error?: string;
  sectionIndex?: number;
}

/**
 * Overall processing result
 */
export interface ProcessingResult {
  sections?: SectionResult[];
  section?: SectionData;
  analysis?: Record<string, DimensionResult>;
  globalResults?: Record<string, DimensionResult>;
  finalSections?: SectionData[];
}

/**
 * Engine for processing sections through AI-powered analysis dimensions
 */
export class DagEngine {
  private readonly aiAdapter: AIAdapter;
  private readonly plugin: BasePlugin;
  private readonly config: DagEngineConfig;
  private globalResults = new Map<string, DimensionResult>();
  private currentSections: SectionData[] = [];

  // Default configuration values
  public static readonly DEFAULT_CONCURRENCY = 5;
  public static readonly DEFAULT_MAX_RETRIES = 3;
  public static readonly DEFAULT_RETRY_DELAY = 1000;

  constructor(config: DagEngineConfig) {
    this.aiAdapter = new AIAdapter(config.ai || {});
    this.plugin = config.plugin;
    this.config = config;
  }

  /**
   * Process one or more sections through all configured analysis dimensions
   */
  async process(
      sections: SectionData[],
      options: ProcessingOptions = {},
  ): Promise<ProcessingResult> {
    this.validateInput(sections);
    this.currentSections = [...sections]; // Copy for transformation

    // Process global dimensions first
    await this.processGlobalDimensions(options);

    // Process sections (now uses potentially transformed sections)
    const sectionResults = await this.processMultipleSections(this.currentSections, options);

    return {
      ...sectionResults,
    };
  }

  private validateInput(sections: SectionData[]): void {
    if (!sections || sections.length === 0) {
      throw new Error("No sections provided for processing");
    }
  }

  /**
   * Performs topological sort on global dimensions to ensure proper dependency order
   */
  private topologicalSort(globalDimensions: string[]): string[] {
    const graph = this.plugin.getDimensionDependencyGraph?.() || {};
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (dimension: string): void => {
      if (visiting.has(dimension)) {
        throw new Error(`Circular dependency detected in global dimensions at: ${dimension}`);
      }

      if (visited.has(dimension)) {
        return; // Already processed
      }

      visiting.add(dimension);

      // Visit all dependencies first (only global ones)
      const dependencies = graph[dimension] || [];
      dependencies.forEach(depName => {
        if (globalDimensions.includes(depName)) {
          visit(depName);
        }
      });

      visiting.delete(dimension);
      visited.add(dimension);
      result.push(dimension);
    };

    // Visit all global dimensions
    globalDimensions.forEach(dimension => {
      if (!visited.has(dimension)) {
        visit(dimension);
      }
    });

    return result;
  }

  /**
   * Process global dimensions with concurrent section processing
   */
  private async processGlobalDimensions(options: ProcessingOptions): Promise<void> {
    const globalDimensions = this.getGlobalDimensions();
    const sortedGlobalDimensions = this.topologicalSort(globalDimensions);

    for (const dimension of sortedGlobalDimensions) {
      try {
        options.onDimensionStart?.(dimension);

        const result = await this.processSingleGlobalDimension(dimension, options);
        this.globalResults.set(dimension, result);

        // Apply transformation if defined
        const config = this.plugin.getDimensionConfig?.(dimension);
        const aiConfig = this.plugin.getAIConfigForDimension(dimension);

        if (config?.transform) {
          const transformed = config.transform(result, this.currentSections, aiConfig);
          if (transformed && Array.isArray(transformed) && transformed.length > 0) {
            this.currentSections = transformed;
          } else {
            console.warn(`Transform function for dimension "${dimension}" returned invalid result`);
          }
        }

        options.onDimensionComplete?.(dimension, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options.onError?.(dimension, err);

        // Store error result
        this.globalResults.set(dimension, { response: { error: err.message } });
      }
    }
  }

  /**
   * Get list of global dimensions
   */
  private getGlobalDimensions(): string[] {
    return this.plugin.getDimensions().filter(dim =>
        this.plugin.isGlobalDimension?.(dim)
    );
  }

  /**
   * Process a single global dimension across all sections with concurrency control
   */
  private async processSingleGlobalDimension(
      dimension: string,
      options: ProcessingOptions
  ): Promise<DimensionResult> {
    // Process all sections concurrently
    const sectionResults = await this.processAllSectionsForGlobalDimension(dimension, options);

    // Aggregate internally (no plugin method needed)
    const aggregatedResult: DimensionResult = {
      response: {
        sectionResults: sectionResults,
        totalSections: sectionResults.length,
        // @ts-ignore
        successfulSections: sectionResults.filter(r => !r.error && !r.response?.error).length,
        // @ts-ignore
        failedSections: sectionResults.filter(r => r.error || r.response?.error).length,
        dimension: dimension
      }
    };

    return aggregatedResult;
  }

  /**
   * Process a batch of sections for a global dimension
   */
  private async processGlobalDimensionBatch(
      batch: SectionData[],
      startIndex: number,
      totalSections: number,
      results: DimensionResult[],
      dimension: string,
      options: ProcessingOptions,
  ): Promise<void> {
    const batchPromises = batch.map((section, batchIndex) =>
        this.processSectionForGlobalDimension(
            section,
            startIndex + batchIndex,
            totalSections,
            dimension,
            options,
        ),
    );

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, batchIndex) => {
      const sectionIndex = startIndex + batchIndex;

      if (result.status === "fulfilled") {
        results[sectionIndex] = result.value;
      } else {
        const error = result.reason instanceof Error
            ? result.reason.message
            : "Global dimension processing failed";

        results[sectionIndex] = { response: { error } };
        options.onError?.(sectionIndex, result.reason);
      }
    });
  }

  /**
   * Process all sections for a global dimension with concurrency control
   */
  private async processAllSectionsForGlobalDimension(
      dimension: string,
      options: ProcessingOptions
  ): Promise<DimensionResult[]> {
    const concurrency = this.config.concurrency || DagEngine.DEFAULT_CONCURRENCY;
    const sectionResults: DimensionResult[] = new Array(this.currentSections.length);

    // Process sections in concurrent batches
    for (let i = 0; i < this.currentSections.length; i += concurrency) {
      const batch = this.currentSections.slice(i, i + concurrency);
      await this.processGlobalDimensionBatch(
          batch,
          i,
          this.currentSections.length,
          sectionResults,
          dimension,
          options
      );
    }

    return sectionResults;
  }

  /**
   * Process a single section for a global dimension
   */
  private async processSectionForGlobalDimension(
      section: SectionData,
      sectionIndex: number,
      totalSections: number,
      dimension: string,
      options: ProcessingOptions,
  ): Promise<DimensionResult> {
    try {
      // Optional: notify about section processing within global dimension
      options.onSectionStart?.(sectionIndex, totalSections);

      const aiConfig = this.plugin.getAIConfigForDimension(dimension, section);
      const dependencies = this.getAllDependencies(dimension);

      // Process single section for global dimension
      const prompt = this.plugin.createDimensionPrompt(
          [section], // Single section in array (consistent interface)
          dimension,
          dependencies
      );

      const result = await retry(
          async () => await this.aiAdapter.process(prompt, {
            ...aiConfig,
            dimension,
            sectionIndex,
            globalDimension: true
          }),
          {
            maxRetries: this.config.maxRetries || DagEngine.DEFAULT_MAX_RETRIES,
            baseDelay: this.config.retryDelay || DagEngine.DEFAULT_RETRY_DELAY,
          }
      );

      options.onSectionComplete?.(sectionIndex, result, totalSections);
      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(sectionIndex, err);
      return { response: { error: err.message } };
    }
  }

  /**
   * Aggregate results from all sections for a global dimension
   */


  private getAllDependencies(dimension: string): DependencyOutputs {
    const graph = this.plugin.getDimensionDependencyGraph() || {};
    const deps: DependencyOutputs = {};

    for (const depName of graph[dimension] || []) {
      if (this.globalResults.has(depName)) {
        deps[depName] = this.globalResults.get(depName)!;
      } else {
        console.warn(`Dependency "${depName}" not found for global dimension "${dimension}"`);
        deps[depName] = { response: { error: `Missing dependency: ${depName}` } };
      }
    }

    return deps;
  }

  /**
   * Process multiple sections with controlled concurrency (unchanged)
   */
  private async processMultipleSections(
      sections: SectionData[],
      options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    const concurrency =
        this.config.concurrency || DagEngine.DEFAULT_CONCURRENCY;
    const results: SectionResult[] = new Array(sections.length);

    for (let i = 0; i < sections.length; i += concurrency) {
      const batch = sections.slice(i, i + concurrency);
      await this.processBatch(batch, i, sections.length, results, options);
    }

    return { sections: results };
  }

  /**
   * Process a batch of sections concurrently (unchanged)
   */
  private async processBatch(
      batch: SectionData[],
      startIndex: number,
      totalSections: number,
      results: SectionResult[],
      options: ProcessingOptions,
  ): Promise<void> {
    const batchPromises = batch.map((section, batchIndex) =>
        this.processSectionWithErrorHandling(
            section,
            startIndex + batchIndex,
            totalSections,
            options,
        ),
    );

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, batchIndex) => {
      const sectionIndex = startIndex + batchIndex;
      results[sectionIndex] = this.extractSectionResult(
          result,
          //@ts-expect-error
          batch[batchIndex],
          sectionIndex,
      );
    });
  }

  /**
   * Process a single section with comprehensive error handling (unchanged)
   */
  private async processSectionWithErrorHandling(
      section: SectionData,
      sectionIndex: number,
      totalSections: number,
      options: ProcessingOptions,
  ): Promise<SectionResult> {
    try {
      options.onSectionStart?.(sectionIndex, totalSections);

      const result = await this.processSingleSection(section, options);

      options.onSectionComplete?.(sectionIndex, result, totalSections);

      //@ts-expect-error
      return {
        section: result.section || section,
        analysis: result.analysis,
        sectionIndex,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(sectionIndex, err);
      return { section, error: err.message, sectionIndex };
    }
  }

  /**
   * Extract section result from Promise.allSettled result (unchanged)
   */
  private extractSectionResult(
      settledResult: PromiseSettledResult<SectionResult>,
      section: SectionData,
      sectionIndex: number,
  ): SectionResult {
    if (settledResult.status === "fulfilled") {
      return settledResult.value;
    }

    const error =
        settledResult.reason instanceof Error
            ? settledResult.reason.message
            : "Processing failed";

    return { section, error, sectionIndex };
  }

  /**
   * Process a single section through all its analysis dimensions (unchanged)
   */
  private async processSingleSection(
      section: SectionData,
      options: ProcessingOptions = {},
  ): Promise<ProcessingResult> {
    const dimensionsProcessor = new DimensionProcessor(
        this.plugin,
        this.aiAdapter,
        this.config,
        options,
        this.globalResults
    );

    const analysis = await dimensionsProcessor.processAllDimensions(section);
    const finalAnalysis = this.applyPostProcessing(analysis);

    return { section, analysis: finalAnalysis };
  }

  /**
   * Apply plugin's post-processing if available (unchanged)
   */
  private applyPostProcessing(
      analysis: Record<string, DimensionResult>,
  ): Record<string, DimensionResult> {
    return this.plugin.processSectionResultBeforeSave
        ? this.plugin.processSectionResultBeforeSave(analysis)
        : analysis;
  }
}

/**
 * Handles processing of dimensions with dependency management (unchanged)
 */
class DimensionProcessor {
  private readonly plugin: BasePlugin;
  private readonly aiAdapter: AIAdapter;
  private readonly config: DagEngineConfig;
  private readonly options: ProcessingOptions;
  private readonly globalResults: Map<string, DimensionResult>;

  // State for dependency processing
  private readonly results = new Map<string, DimensionResult>();
  private readonly inFlightPromises = new Map<
      string,
      Promise<DimensionResult>
  >();
  private readonly visitingNodes = new Set<string>();

  constructor(
      plugin: BasePlugin,
      aiAdapter: AIAdapter,
      config: DagEngineConfig,
      options: ProcessingOptions,
      globalResults: Map<string, DimensionResult> = new Map()
  ) {
    this.plugin = plugin;
    this.aiAdapter = aiAdapter;
    this.config = config;
    this.options = options;
    this.globalResults = globalResults;
  }

  /**
   * Process all section-level dimensions for a section, respecting dependencies
   */
  async processAllDimensions(
      section: SectionData,
  ): Promise<Record<string, DimensionResult>> {
    const allDimensions = this.plugin.getDimensions?.() || [];
    // Filter out global dimensions - they're already processed
    const sectionDimensions = allDimensions.filter(dim =>
        !this.plugin.isGlobalDimension?.(dim)
    );
    const dependencyGraph = this.plugin.getDimensionDependencyGraph?.() || {};

    // Process section dimensions concurrently while respecting dependencies
    await Promise.all(
        sectionDimensions.map((dimension) =>
            this.processDimensionWithDependencies(
                section,
                dimension,
                dependencyGraph,
            ),
        ),
    );

    return Object.fromEntries(this.results);
  }

  /**
   * Process a dimension and its dependencies recursively
   */
  private async processDimensionWithDependencies(
      section: SectionData,
      dimension: string,
      dependencyGraph: Record<string, string[]>,
  ): Promise<DimensionResult> {
    // Return cached in-flight promise to avoid duplicate work
    const existingPromise = this.inFlightPromises.get(dimension);
    if (existingPromise) {
      return existingPromise;
    }

    const processingPromise = this.createDimensionProcessingPromise(
        section,
        dimension,
        dependencyGraph,
    );
    this.inFlightPromises.set(dimension, processingPromise);

    return processingPromise;
  }

  /**
   * Create the actual processing promise for a dimension
   */
  private async createDimensionProcessingPromise(
      section: SectionData,
      dimension: string,
      dependencyGraph: Record<string, string[]>,
  ): Promise<DimensionResult> {
    try {
      this.checkForCircularDependency(dimension);

      const dependencies = dependencyGraph[dimension] || [];
      const dependencyOutputs = await this.resolveDependencies(
          section,
          dependencies,
          dependencyGraph,
      );

      this.checkDependencyErrors(dimension, dependencyOutputs);

      return await this.executeDimensionProcessing(
          section,
          dimension,
          dependencyOutputs,
      );
    } catch (error) {
      return this.handleDimensionError(dimension, error);
    } finally {
      this.visitingNodes.delete(dimension);
    }
  }

  private checkForCircularDependency(dimension: string): void {
    if (this.visitingNodes.has(dimension)) {
      throw new Error(`Circular dependency detected at "${dimension}"`);
    }
    this.visitingNodes.add(dimension);
  }

  private async resolveDependencies(
      section: SectionData,
      dependencies: string[],
      dependencyGraph: Record<string, string[]>,
  ): Promise<DependencyOutputs> {
    const dependencyOutputs: DependencyOutputs = {};

    for (const depName of dependencies) {
      if (this.plugin.isGlobalDimension?.(depName)) {
        // Global dependency - get from global results
        const globalResult = this.globalResults.get(depName);
        if (globalResult) {
          dependencyOutputs[depName] = globalResult;
        } else {
          console.warn(`Global dependency "${depName}" not available for dimension "${depName}"`);
        }
      } else {
        // Section-level dependency - process normally
        const result = await this.processDimensionWithDependencies(
            section, depName, dependencyGraph
        );
        dependencyOutputs[depName] = result;
      }
    }

    return dependencyOutputs;
  }

  private checkDependencyErrors(
      dimension: string,
      dependencyOutputs: DependencyOutputs,
  ): void {
    const shouldFailOnDependencyError =
        this.options.failOnDependencyError ?? true;

    if (shouldFailOnDependencyError) {
      const failedDependency = Object.values(dependencyOutputs).find(
          (dep) => dep?.error,
      );
      if (failedDependency) {
        throw new Error(`Blocked by dependency error for "${dimension}"`);
      }
    }
  }

  private async executeDimensionProcessing(
      section: SectionData,
      dimension: string,
      dependencyOutputs: DependencyOutputs,
  ): Promise<DimensionResult> {
    this.options.onDimensionStart?.(dimension);

    const result = await this.processSingleDimension(
        section,
        dimension,
        dependencyOutputs,
    );

    this.results.set(dimension, result);
    this.options.onDimensionComplete?.(dimension, result);

    return result;
  }

  private handleDimensionError(
      dimension: string,
      error: unknown,
  ): DimensionResult {
    const err = error instanceof Error ? error : new Error(String(error));
    globalThis.console.error(`Error processing dimension ${dimension}:`, err);

    const errorResult: DimensionResult = { response: { error: err.message } };
    this.results.set(dimension, errorResult);
    this.options.onError?.(dimension, err);

    return errorResult;
  }

  /**
   * Process a single dimension through the AI adapter
   */
  private async processSingleDimension(
      section: SectionData,
      dimension: string,
      dependencyOutputs: DependencyOutputs,
  ): Promise<DimensionResult> {
    return retry(
        async () => {
          const aiConfig = this.plugin.getAIConfigForDimension(
              dimension,
              section,
          );
          const prompt = this.plugin.createDimensionPrompt(
              [section],
              dimension,
              dependencyOutputs,
          );

          return await this.aiAdapter.process(prompt, {
            ...aiConfig,
            dimension,
            //@ts-expect-error
            sectionIndex: section.metadata?.index,
          });
        },
        {
          maxRetries: this.config.maxRetries || DagEngine.DEFAULT_MAX_RETRIES,
          baseDelay: this.config.retryDelay || DagEngine.DEFAULT_RETRY_DELAY,
        },
    );
  }
}