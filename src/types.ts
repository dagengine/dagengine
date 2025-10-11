export interface SectionData {
  content: string;
  metadata: Record<string, unknown>;
}

export interface DimensionResult<T = unknown> {
  data?: T;
  error?: string;
}

export interface DimensionDependencies {
  [dimensionName: string]: DimensionResult;
}

export interface DimensionConfig {
  name: string;
  scope: 'section' | 'global';
  transform?: (result: DimensionResult, sections: SectionData[]) => SectionData[];
}

export type Dimension = string | DimensionConfig;
