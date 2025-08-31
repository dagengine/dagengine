export interface PluginConfig {
  [key: string]: unknown;
}

export interface DimensionResult {
  [key: string]: unknown;
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
  public dimensions: string[];

  constructor(config: PluginConfig = {}) {
    this.config = config;
    this.id = "base";
    this.name = "Base Plugin";
    this.description = "Base plugin interface";
    this.dimensions = [];
  }

  getDimensions(): string[] {
    throw new Error("getDimensions() must be implemented by plugin");
  }

  createDimensionPrompt(
    _section: SectionData,
    _dimension: string,
    _dependencies: DependencyOutputs = {},
  ): string {
    throw new Error("createDimensionPrompt() must be implemented by plugin");
  }

  getAIConfigForDimension(_dimension: string, _section: SectionData): AIConfig {
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
      dimensions: this.dimensions,
      ...this.config,
    };
  }
}
