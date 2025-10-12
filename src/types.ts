// ===== Existing types (keep as is) =====
export interface SectionData {
  content: string;
  metadata: Record<string, unknown>;
}

export interface DimensionResult<T = unknown> {
  data?: T;
  error?: string;
  metadata?: ProviderMetadata;
}

export interface DimensionDependencies {
  [dimensionName: string]: DimensionResult;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ProviderMetadata {
  model?: string;
  tokens?: TokenUsage;
  provider?: string;
  [key: string]: unknown;
}

export interface DimensionConfig {
  name: string;
  scope: 'section' | 'global';
  transform?: (
      result: DimensionResult,
      sections: SectionData[]
  ) => SectionData[] | Promise<SectionData[]>;
}

export type Dimension = string | DimensionConfig;

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export interface PricingConfig {
  models: Record<string, ModelPricing>;
  lastUpdated?: string;
}

export interface DimensionCost {
  cost: number;
  tokens: TokenUsage;
  model: string;
  provider: string;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  byDimension: Record<string, DimensionCost>;
  byProvider: Record<string, {
    cost: number;
    tokens: TokenUsage;
    models: string[];
  }>;
  currency: 'USD';
}

// ===== NEW: Plugin Hook Context Types =====

/**
 * Base context present in all hooks
 */
export interface BaseContext {
  processId: string;
  timestamp: number;
}

/**
 * Process-level context (start of process)
 */
export interface ProcessContext extends BaseContext {
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: Record<string, unknown>;
}

/**
 * Result from beforeProcessStart hook
 */
export interface ProcessStartResult {
  sections?: SectionData[];
  metadata?: any;
}

/**
 * Context after process completes
 */
export interface ProcessResultContext extends ProcessContext {
  result: ProcessResult;
  duration: number;
  totalDimensions: number;
  successfulDimensions: number;
  failedDimensions: number;
}

/**
 * Context when process fails
 */
export interface ProcessFailureContext extends ProcessContext {
  error: Error;
  partialResults: Partial<ProcessResult>;
  duration: number;
}

/**
 * Dimension-level context (base for dimension execution)
 */
export interface DimensionContext extends BaseContext {
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
}

/**
 * Section dimension context (includes section info)
 */
export interface SectionDimensionContext extends DimensionContext {
  section: SectionData;
  sectionIndex: number;
}

/**
 * Context during provider execution
 */
export interface ProviderContext extends DimensionContext {
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, unknown>;
}

/**
 * Context after dimension execution
 */
export interface DimensionResultContext extends ProviderContext {
  result: DimensionResult;
  duration: number;
  tokensUsed?: TokenUsage | undefined;  // ✅ Fixed: Explicitly allow undefined
}

/**
 * Context after provider execution (raw response)
 */
export interface ProviderResultContext extends ProviderContext {
  result: ProviderResponse;
  duration: number;
  tokensUsed?: TokenUsage | undefined;  // ✅ Fixed: Explicitly allow undefined
}

/**
 * Context for section transformation
 */
export interface TransformSectionsContext extends DimensionResultContext {
  currentSections: SectionData[];
}

/**
 * Context for final result processing
 */
export interface FinalizeContext extends BaseContext {
  results: Record<string, DimensionResult>;
  sections: SectionData[];
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  duration: number;
}

/**
 * Context during retry attempts
 */
export interface RetryContext extends ProviderContext {
  error: Error;
  attempt: number;
  maxAttempts: number;
  previousAttempts: Array<{
    attempt: number;
    error: Error;
    provider: string;
    timestamp: number;
  }>;
}

/**
 * Response from retry handler
 */
export interface RetryResponse {
  shouldRetry?: boolean;
  delayMs?: number;
  modifiedRequest?: ProviderRequest;
  modifiedProvider?: string;
}

/**
 * Context during provider fallback
 */
export interface FallbackContext extends RetryContext {
  failedProvider: string;
  fallbackProvider: string;
  fallbackOptions: Record<string, unknown>;
}

/**
 * Response from fallback handler
 */
export interface FallbackResponse {
  shouldFallback?: boolean;
  delayMs?: number;
  modifiedRequest?: ProviderRequest;
}

/**
 * Context when dimension fails completely
 */
export interface FailureContext extends RetryContext {
  totalAttempts: number;
  providers: string[];
}

/**
 * Skip result with cached data
 */
export interface SkipWithResult {
  skip: true;
  result: DimensionResult;
}

/**
 * Process options (existing, but ensure it's exported)
 */
export interface ProcessOptions {
  onDimensionStart?: (dimension: string) => void;
  onDimensionComplete?: (dimension: string, result: DimensionResult) => void;
  onSectionStart?: (index: number, total: number) => void;
  onSectionComplete?: (index: number, total: number) => void;
  onError?: (context: string, error: Error) => void;
  [key: string]: unknown;
}

/**
 * Process result (existing, ensure exported)
 */
export interface ProcessResult {
  sections: Array<{
    section: SectionData;
    results: Record<string, DimensionResult>;
  }>;
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  costs?: CostSummary;
  metadata?: Record<string, unknown>;
}

// ===== Provider Types (keep existing) =====
export interface ProviderRequest {
  input: string | string[];
  options?: Record<string, unknown>;
  dimension?: string;
  isGlobal?: boolean;
  metadata?: {
    sectionIndex?: number;
    totalSections?: number;
    [key: string]: unknown;
  };
}

export interface ProviderResponse<T = unknown> {
  data?: T;
  error?: string;
  metadata?: ProviderMetadata;
}

/**
 * Context for beforeProcessStart hook
 */
export interface BeforeProcessStartContext extends BaseContext {
  sections: SectionData[];
  options: ProcessOptions;
}

/**
 * Context for afterProcessComplete hook
 */
export interface AfterProcessCompleteContext extends BaseContext {
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: Record<string, unknown>;
  result: ProcessResult;
  duration: number;
  totalDimensions: number;
  successfulDimensions: number;
  failedDimensions: number;
}

/**
 * Context for beforeProviderExecute hook
 */
export interface BeforeProviderExecuteContext extends DimensionContext {
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, unknown>;
}

/**
 * Context for afterProviderExecute hook
 */
export interface AfterProviderExecuteContext extends DimensionContext {
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, unknown>;
  response: ProviderResponse;
  duration: number;
}