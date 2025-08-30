export interface PluginConfig {
  [key: string]: any;
}

export interface DimensionResult {
  [key: string]: any;
}

export interface DependencyOutputs {
  [dimension: string]: DimensionResult;
}

export interface SectionData {
  content: string;
  metadata: {
    [key: string]: any;
  };
}

export interface AIConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
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
    section: SectionData,
    dimension: string,
    dependencies: DependencyOutputs = {},
  ): string {
    throw new Error("createDimensionPrompt() must be implemented by plugin");
  }

  getAIConfigForDimension(dimension: string, section: SectionData): AIConfig {
    throw new Error("getAIConfigForDimension() must be implemented by plugin");
  }

  getDimensionDependencyGraph(): { [dimension: string]: string[] } {
    return {};
  }

  processSectionResultBeforeSave(dimensionResults: {
    [dimension: string]: DimensionResult;
  }): {
    [dimension: string]: DimensionResult;
  } {
    return dimensionResults;
  }

  getConfig(): {
    id: string;
    name: string;
    description: string;
    dimensions: string[];
    [key: string]: any;
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
