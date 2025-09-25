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
}

/**
 * Engine for processing sections through AI-powered analysis dimensions
 */
export class DagEngine {
  private readonly aiAdapter: AIAdapter;
  private readonly plugin: BasePlugin;
  private readonly config: DagEngineConfig;

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

    return this.processMultipleSections(sections, options);
  }

  private validateInput(sections: SectionData[]): void {
    if (!sections || sections.length === 0) {
      throw new Error("No sections provided for processing");
    }
  }

  /**
   * Process multiple sections with controlled concurrency
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
   * Process a batch of sections concurrently
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
   * Process a single section with comprehensive error handling
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

      // Convert ProcessingResult to SectionResult
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
   * Extract section result from Promise.allSettled result
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
   * Process a single section through all its analysis dimensions
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
    );

    const analysis = await dimensionsProcessor.processAllDimensions(section);
    const finalAnalysis = this.applyPostProcessing(analysis);

    return { section, analysis: finalAnalysis };
  }

  /**
   * Apply plugin's post-processing if available
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
 * Handles processing of dimensions with dependency management
 */
class DimensionProcessor {
  private readonly plugin: BasePlugin;
  private readonly aiAdapter: AIAdapter;
  private readonly config: DagEngineConfig;
  private readonly options: ProcessingOptions;

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
  ) {
    this.plugin = plugin;
    this.aiAdapter = aiAdapter;
    this.config = config;
    this.options = options;
  }

  /**
   * Process all dimensions for a section, respecting dependencies
   */
  async processAllDimensions(
    section: SectionData,
  ): Promise<Record<string, DimensionResult>> {
    const dimensions = this.plugin.getDimensions?.() || [];
    const dependencyGraph = this.plugin.getDimensionDependencyGraph?.() || {};

    // Process all dimensions concurrently while respecting dependencies
    await Promise.all(
      dimensions.map((dimension) =>
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
    const dependencyResults = await Promise.all(
      dependencies.map((dep) =>
        this.processDimensionWithDependencies(section, dep, dependencyGraph),
      ),
    );

    const dependencyOutputs: DependencyOutputs = {};
    dependencies.forEach((depName, index) => {
      //@ts-expect-error
      dependencyOutputs[depName] = dependencyResults[index];
    });

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

    const errorResult: DimensionResult = { dimension, error: err.message };
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
          section,
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
