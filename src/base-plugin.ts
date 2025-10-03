import { ProviderAdapterConfig, DimensionConfig } from "./providers/provider-adapter";

export interface PluginConfig {
  [key: string]: unknown;
}

export interface DimensionSpecConfig {
  name: string;
  scope?: 'section' | 'global';
  transform?: (result: DimensionResult, sections: SectionData[], providerConfig: DimensionConfig) => SectionData[];
}

export type DimensionSpec = string | DimensionSpecConfig;

export interface DimensionResult {
  response?: unknown;
  error?: string;
}

export interface DependencyOutputs {
  [dimension: string]: DimensionResult;
}

export interface SectionData {
  content: string;
  metadata: {
    [key: string]: unknown;
  };
}

export abstract class BasePlugin {
  public readonly config: PluginConfig;
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly dimensions: DimensionSpec[];

  constructor(config: PluginConfig = {}) {
    this.config = config;
    this.id = "base";
    this.name = "Base Plugin";
    this.description = "Base plugin interface";
    this.dimensions = [];
  }

  getDimensionNames(): string[] {
    return this.dimensions.map(dimension =>
        typeof dimension === 'string' ? dimension : dimension.name
    );
  }

  getDimensionConfig(dimensionName: string): DimensionSpecConfig | undefined {
    const dimension = this.dimensions.find(dim =>
        (typeof dim === 'string' ? dim : dim.name) === dimensionName
    );
    return typeof dimension === 'object' ? dimension : { name: dimensionName, scope: 'section' };
  }

  isGlobalDimension(dimensionName: string): boolean {
    const config = this.getDimensionConfig(dimensionName);
    return config?.scope === 'global';
  }

  abstract createDimensionPrompt(
      sections: SectionData[],
      dimension: string,
      dependencies: DependencyOutputs
  ): string;

  abstract getProviderConfigForDimension(
      dimension: string,
      section?: SectionData
  ): DimensionConfig;

  getDimensionDependencyGraph(): Record<string, string[]> {
    return {};
  }

  processResultsBeforeSave(
      dimensionResults: Record<string, DimensionResult>
  ): Record<string, DimensionResult> {
    return dimensionResults;
  }

  getPluginInfo(): {
    id: string;
    name: string;
    description: string;
    dimensions: string[];
    [key: string]: unknown;
  } {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      dimensions: this.getDimensionNames(),
      ...this.config,
    };
  }
}