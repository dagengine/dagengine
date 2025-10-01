export interface PluginConfig {
  [key: string]: unknown;
}

export interface DimensionConfig {
  name: string;
  scope?: 'section' | 'global';
  transform?: (result: DimensionResult, sections: SectionData[]) => SectionData[];
}

export type DimensionSpec = string | DimensionConfig;

export interface DimensionResult {
  response?: object;
  error?: unknown;
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

export interface AIConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  [key: string]: unknown;
}

export class BasePlugin {
  public config: PluginConfig;
  public id: string;
  public name: string;
  public description: string;
  public dimensions: DimensionSpec[];

  constructor(config: PluginConfig = {}) {
    this.config = config;
    this.id = "base";
    this.name = "Base Plugin";
    this.description = "Base plugin interface";
    this.dimensions = [];
  }

  getDimensions(): string[] {
    return this.dimensions.map(dimension => typeof dimension === 'string' ? dimension : dimension.name);
  }

  getDimensionConfig(name: string): DimensionConfig | undefined {
    const dim = this.dimensions.find(dimension =>
        (typeof dimension === 'string' ? dimension : dimension.name) === name
    );
    return typeof dim === 'object' ? dim : { name, scope: 'section' };
  }

  isGlobalDimension(name: string): boolean {
    const config = this.getDimensionConfig(name);
    return config?.scope === 'global';
  }

  createDimensionPrompt(
    _sections: SectionData[],
    _dimension: string,
    _dependencies: DependencyOutputs = {},
  ): string {
    throw new Error("createDimensionPrompt() must be implemented by plugin");
  }

  getAIConfigForDimension(_dimension: string, _section?: SectionData): AIConfig {
    throw new Error("getAIConfigForDimension() must be implemented by plugin");
  }

  getDimensionDependencyGraph(): Record<string, string[]> {
    return {};
  }

  processSectionResultBeforeSave(
    dimensionResults: Record<string, DimensionResult>,
  ): Record<string, DimensionResult> {
    return dimensionResults;
  }

  getConfig(): {
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
      dimensions: this.getDimensions(),
      ...this.config,
    };
  }
}
