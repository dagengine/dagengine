import {
  SectionData,
  DimensionResult,
  DimensionDependencies,
  Dimension,
  DimensionConfig,
} from './types';

export interface PluginConfig {
  [key: string]: unknown;
}

export interface PromptContext {
  sections: SectionData[];
  dimension: string;
  dependencies: DimensionDependencies;
  isGlobal: boolean;
}

export interface ProviderSelection {
  provider: string;
  options: Record<string, unknown>;
  fallbacks?: Array<{
    provider: string;
    options: Record<string, unknown>;
    retryAfter?: number;
  }>;
}

export abstract class Plugin {
  public readonly id: string;
  public name: string;
  public readonly description: string;
  public dimensions: Dimension[];
  protected readonly config: PluginConfig;

  constructor(id: string, name: string, description: string, config: PluginConfig = {}) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.config = config;
    this.dimensions = [];
  }

  getDimensionNames(): string[] {
    return this.dimensions.map((d) => (typeof d === 'string' ? d : d.name));
  }

  getDimensionConfig(name: string): DimensionConfig {
    const dim = this.dimensions.find((d) => (typeof d === 'string' ? d : d.name) === name);

    if (!dim) {
      throw new Error(`Dimension "${name}" not found in plugin "${this.id}"`);
    }

    return typeof dim === 'string' ? { name, scope: 'section' } : dim;
  }

  isGlobalDimension(name: string): boolean {
    return this.getDimensionConfig(name).scope === 'global';
  }

  abstract createPrompt(context: PromptContext): string;

  abstract selectProvider(dimension: string, section?: SectionData): ProviderSelection;

  getDependencies(): Record<string, string[]> {
    return {};
  }

  processResults(results: Record<string, DimensionResult>): Record<string, DimensionResult> {
    return results;
  }

  /**
   * Optional method to skip dimensions dynamically per section
   * Return true to skip this dimension for this specific section
   */
  shouldSkipDimension?(
      dimension: string,
      section: SectionData,
      sectionResults: Record<string, DimensionResult>,
      globalResults: Record<string, DimensionResult>
  ): boolean;
}