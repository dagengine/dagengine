---
title: Type Reference
description: TypeScript interfaces and types used in dag-ai
---

# Type Reference

Complete TypeScript interfaces and types used throughout dag-ai.

## Table of Contents

- [Section & Result Types](#section--result-types)
- [Context Types](#context-types)
- [Provider Types](#provider-types)
- [Cost Types](#cost-types)
- [Progress Types](#progress-types)
- [Dimension Types](#dimension-types)
- [Error & Skip Types](#error--skip-types)
- [Type Guards](#type-guards)
- [Quick Reference](#quick-reference)

---

## Section & Result Types

### SectionData

Input unit for processing. Each section represents one item to analyze.

```typescript
interface SectionData {
  content: string;                    // Text to analyze
  metadata: Record<string, unknown>;  // Additional data
}
```

**Example:**
```typescript
const section: SectionData = {
  content: 'Great product! Highly recommend.',
  metadata: {
    id: 'review-123',
    userId: 456,
    productId: 'SKU-789',
    timestamp: '2024-01-15',
    rating: 5
  }
};
```

**Usage:**
```typescript
const sections: SectionData[] = [
  { content: 'Review 1', metadata: { id: 1 } },
  { content: 'Review 2', metadata: { id: 2 } },
  { content: 'Review 3', metadata: { id: 3 } }
];

const result = await engine.process(sections);
```

---

### DimensionResult

Result from a dimension execution. Contains data, error, or skip information.

```typescript
interface DimensionResult<T = unknown> {
  data?: T;                    // Successful result data
  error?: string;              // Error message if failed
  metadata?: ProviderMetadata; // Execution metadata
}
```

**Examples:**

**Success:**
```typescript
const result: DimensionResult<SentimentData> = {
  data: {
    sentiment: 'positive',
    score: 0.95,
    reasoning: 'Enthusiastic language with superlatives'
  },
  metadata: {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    tokens: { 
      inputTokens: 45, 
      outputTokens: 12, 
      totalTokens: 57 
    },
    cost: 0.0001,
    cached: false,
    skipped: false
  }
};
```

**Error:**
```typescript
const result: DimensionResult = {
  error: 'Rate limit exceeded',
  metadata: {
    provider: 'anthropic',
    skipped: false
  }
};
```

**Skipped:**
```typescript
const result: DimensionResult = {
  metadata: {
    skipped: true,
    reason: 'Spam detected'
  }
};
```

---

### ProcessResult

Final result returned from `engine.process()`.

```typescript
interface ProcessResult {
  sections: Array<{
    section: SectionData;
    results: Record<string, DimensionResult>;
  }>;
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  costs?: CostSummary;
  metadata?: unknown;
}
```

**Example:**
```typescript
const result: ProcessResult = await engine.process(sections);

// Access section results
result.sections.forEach((sectionResult) => {
  console.log('Section:', sectionResult.section.content);
  
  const sentiment = sectionResult.results.sentiment?.data;
  console.log('Sentiment:', sentiment.sentiment);
  
  const topics = sectionResult.results.topics?.data;
  console.log('Topics:', topics.topics);
});

// Access global results
const summary = result.globalResults.overall_summary?.data;
console.log('Summary:', summary.text);

// Access costs
console.log('Total cost:', result.costs?.totalCost);
console.log('Total tokens:', result.costs?.totalTokens);

// Access transformed sections (if transformations occurred)
console.log('Final sections:', result.transformedSections.length);
```

---

### DimensionDependencies

Dependencies passed to dimensions. Map of dimension name to its result.

```typescript
interface DimensionDependencies {
  [dimensionName: string]: DimensionResult;
}
```

**Example:**
```typescript
// In createPrompt()
createPrompt(context) {
  const dependencies: DimensionDependencies = context.dependencies;
  
  // Access dependency results
  const sentiment = dependencies.sentiment?.data;
  const topics = dependencies.topics?.data;
  
  if (context.dimension === 'summary') {
    return `Create a ${sentiment.sentiment} summary covering: ${topics.topics.join(', ')}
    
    Content: "${context.sections[0].content}"`;
  }
}
```

**Structure for Section Dimensions:**
```typescript
// Each section gets its own dependency results
const dependencies: DimensionDependencies = {
  sentiment: {
    data: { sentiment: 'positive', score: 0.95 },
    metadata: { ... }
  },
  topics: {
    data: { topics: ['quality', 'price'] },
    metadata: { ... }
  }
};
```

**Structure for Global Dimensions:**
```typescript
// Global dimensions get aggregated results
const dependencies: DimensionDependencies = {
  sentiment: {
    data: {
      sections: [
        { data: { sentiment: 'positive', score: 0.95 } },
        { data: { sentiment: 'negative', score: 0.2 } },
        { data: { sentiment: 'neutral', score: 0.5 } }
      ],
      aggregated: true,
      totalSections: 3
    },
    metadata: { ... }
  }
};
```

---

## Context Types

### BaseContext

Base fields present in all contexts.

```typescript
interface BaseContext {
  processId: string;  // Unique process ID (UUID v4)
  timestamp: number;  // Context creation time (ms since epoch)
}
```

---

### ProcessContext

Context for process-level hooks (`defineDependencies`, etc.).

```typescript
interface ProcessContext extends BaseContext {
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: unknown;  // From beforeProcessStart
}
```

---

### BeforeProcessStartContext

Context for `beforeProcessStart` hook.

```typescript
interface BeforeProcessStartContext extends BaseContext {
  sections: SectionData[];  // Input sections
  options: ProcessOptions;  // Process options
}
```

---

### ProcessResultContext

Context for `afterProcessComplete` hook.

```typescript
interface ProcessResultContext extends ProcessContext {
  result: ProcessResult;        // Complete results
  duration: number;             // Total duration (ms)
  totalDimensions: number;      // Total dimensions executed
  successfulDimensions: number; // Successful dimensions
  failedDimensions: number;     // Failed dimensions
}
```

---

### ProcessFailureContext

Context for `handleProcessFailure` hook.

```typescript
interface ProcessFailureContext extends ProcessContext {
  error: Error;                           // The error that caused failure
  partialResults: Partial<ProcessResult>; // Results completed before failure
  duration: number;                       // Duration until failure (ms)
}
```

---

### DimensionContext

Context for dimension-level hooks.

```typescript
interface DimensionContext extends BaseContext {
  dimension: string;                    // Current dimension name
  isGlobal: boolean;                    // false for section, true for global
  sections: SectionData[];              // All sections
  dependencies: DimensionDependencies;  // Results from dependencies
  globalResults: Record<string, DimensionResult>;  // Previous global results
}
```

**Used by:**
- `shouldSkipGlobalDimension`
- `transformDependencies`
- `beforeDimensionExecute`

---

### SectionDimensionContext

Context for section dimension hooks (extends DimensionContext).

```typescript
interface SectionDimensionContext extends DimensionContext {
  section: SectionData;    // Current section being processed
  sectionIndex: number;    // Index of current section (0-based)
}
```

**Used by:**
- `shouldSkipSectionDimension`

**Example:**
```typescript
shouldSkipSectionDimension(context: SectionDimensionContext) {
  console.log('Processing section', context.sectionIndex);
  console.log('Section content:', context.section.content);
  
  // Skip based on section content
  if (context.section.content.length < 50) {
    return true;
  }
  
  // Skip based on dependency
  const spamCheck = context.dependencies.spam_check;
  return spamCheck?.data?.is_spam === true;
}
```

---

### ProviderContext

Context for provider-level hooks (`beforeProviderExecute`).

```typescript
interface ProviderContext extends DimensionContext {
  request: ProviderRequest;                   // The request to be sent
  provider: string;                           // Provider name (e.g., 'anthropic')
  providerOptions: Record<string, unknown>;   // Provider options
}
```

---

### ProviderResultContext

Context for `afterProviderExecute` hook.

```typescript
interface ProviderResultContext extends ProviderContext {
  result: ProviderResponse;   // The response received
  duration: number;           // Request duration (ms)
  tokensUsed?: TokenUsage;    // Token usage
}
```

---

### DimensionResultContext

Context for `afterDimensionExecute` hook.

```typescript
interface DimensionResultContext extends BaseContext {
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  section?: SectionData;       // Present for section dimensions
  sectionIndex?: number;       // Present for section dimensions
  result: DimensionResult;     // The result just produced
  duration: number;            // Execution time (ms)
  provider: string;            // Provider used
  model?: string;              // Model used
  tokensUsed?: TokenUsage;     // Token usage
  cost?: number;               // Cost incurred
}
```

---

### TransformSectionsContext

Context for `transformSections` hook (extends DimensionResultContext).

```typescript
interface TransformSectionsContext extends DimensionResultContext {
  currentSections: SectionData[];  // Current sections before transformation
}
```

**Example:**
```typescript
transformSections(context: TransformSectionsContext) {
  if (context.dimension !== 'group_by_category') {
    return context.currentSections;  // No transformation
  }
  
  const groups = context.result.data?.groups || [];
  
  // Transform: 100 sections → 5 category groups
  return groups.map(group => ({
    content: group.reviews.join('\n\n'),
    metadata: {
      category: group.category,
      count: group.reviews.length
    }
  }));
}
```

---

### FinalizeContext

Context for `finalizeResults` hook.

```typescript
interface FinalizeContext extends BaseContext {
  results: Record<string, DimensionResult>;  // All dimension results
  originalSections: SectionData[];           // Original input sections
  currentSections: SectionData[];            // Current sections (post-transform)
  globalResults: Record<string, DimensionResult>;
  duration: number;                          // Total process duration (ms)
}
```

---

## Provider Types

### ProviderRequest

Request sent to AI provider.

```typescript
interface ProviderRequest {
  input: string | string[];       // Prompt(s)
  options?: Record<string, unknown>;  // Model, temperature, etc.
  dimension?: string;
  isGlobal?: boolean;
  metadata?: {
    sectionIndex?: number;
    totalSections?: number;
    [key: string]: unknown;
  };
}
```

**Example:**
```typescript
const request: ProviderRequest = {
  input: 'Analyze sentiment of: "Great product!"',
  options: {
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.2,
    max_tokens: 1000
  },
  dimension: 'sentiment',
  isGlobal: false,
  metadata: {
    sectionIndex: 0,
    totalSections: 10
  }
};
```

---

### ProviderResponse

Response from AI provider.

```typescript
interface ProviderResponse<T = unknown> {
  data?: T;                    // Parsed response data
  error?: string;              // Error message if failed
  metadata?: ProviderMetadata; // Execution metadata
}
```

**Example:**
```typescript
const response: ProviderResponse<SentimentData> = {
  data: {
    sentiment: 'positive',
    score: 0.95
  },
  metadata: {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    tokens: {
      inputTokens: 45,
      outputTokens: 12,
      totalTokens: 57
    },
    cost: 0.0001
  }
};
```

---

### ProviderMetadata

Metadata about execution.

```typescript
interface ProviderMetadata {
  model?: string;
  tokens?: TokenUsage;
  provider?: string;
  cost?: number;
  cached?: boolean;
  skipped?: boolean;
  [key: string]: unknown;  // Custom metadata
}
```

**Example:**
```typescript
const metadata: ProviderMetadata = {
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  tokens: {
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500
  },
  cost: 0.0105,
  cached: false,
  skipped: false,
  duration: 2500,  // Custom: request duration
  requestId: 'req-123'  // Custom: provider request ID
};
```

---

### TokenUsage

Token usage information.

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

**Example:**
```typescript
const tokens: TokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500
};

// Calculate cost
const cost = 
  (tokens.inputTokens / 1_000_000) * pricing.inputPer1M +
  (tokens.outputTokens / 1_000_000) * pricing.outputPer1M;
```

---

### ProviderSelection

Provider selection returned by `selectProvider`.

```typescript
interface ProviderSelection {
  provider: string;
  options: Record<string, unknown>;
  fallbacks?: Array<{
    provider: string;
    options: Record<string, unknown>;
    retryAfter?: number;
  }>;
}
```

**Example:**
```typescript
selectProvider(dimension: string): ProviderSelection {
  return {
    provider: 'anthropic',
    options: {
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.3
    },
    fallbacks: [
      {
        provider: 'openai',
        options: { model: 'gpt-4o' },
        retryAfter: 1000  // Wait 1s before trying fallback
      },
      {
        provider: 'gemini',
        options: { model: 'gemini-1.5-pro' }
      }
    ]
  };
}
```

---

## Cost Types

### CostSummary

Cost breakdown for entire process.

```typescript
interface CostSummary {
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
```

**Example:**
```typescript
const costs: CostSummary = {
  totalCost: 0.0282,
  totalTokens: 12289,
  byDimension: {
    filter_spam: {
      cost: 0.0115,
      tokens: { inputTokens: 6548, outputTokens: 1559, totalTokens: 8107 },
      model: 'claude-3-5-haiku-20241022',
      provider: 'anthropic'
    },
    sentiment: {
      cost: 0.0015,
      tokens: { inputTokens: 704, outputTokens: 230, totalTokens: 934 },
      model: 'claude-3-5-haiku-20241022',
      provider: 'anthropic'
    },
    analyze_category: {
      cost: 0.0087,
      tokens: { inputTokens: 621, outputTokens: 459, totalTokens: 1080 },
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic'
    }
  },
  byProvider: {
    anthropic: {
      cost: 0.0282,
      tokens: { inputTokens: 7873, outputTokens: 4416, totalTokens: 12289 },
      models: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022']
    }
  },
  currency: 'USD'
};

console.log(`Total: $${costs.totalCost.toFixed(4)}`);
console.log(`Haiku: $${costs.byDimension.sentiment.cost.toFixed(4)}`);
console.log(`Sonnet: $${costs.byDimension.analyze_category.cost.toFixed(4)}`);
```

---

### DimensionCost

Cost for a single dimension.

```typescript
interface DimensionCost {
  cost: number;
  tokens: TokenUsage;
  model: string;
  provider: string;
}
```

---

### PricingConfig

Pricing configuration for cost tracking.

```typescript
interface PricingConfig {
  models: Record<string, ModelPricing>;
  lastUpdated?: string;
}

interface ModelPricing {
  inputPer1M: number;   // Cost per 1M input tokens (USD)
  outputPer1M: number;  // Cost per 1M output tokens (USD)
}
```

**Example:**
```typescript
const pricing: PricingConfig = {
  models: {
    'claude-3-5-haiku-20241022': { 
      inputPer1M: 0.80, 
      outputPer1M: 4.00 
    },
    'claude-3-5-sonnet-20241022': { 
      inputPer1M: 3.00, 
      outputPer1M: 15.00 
    }
  },
  lastUpdated: '2024-01-15'
};
```

---

## Progress Types

### ProgressUpdate

Real-time progress information.

```typescript
interface ProgressUpdate {
  completed: number;
  total: number;
  percent: number;
  cost: number;
  estimatedCost: number;
  elapsedSeconds: number;
  etaSeconds: number;
  currentDimension: string;
  currentSection: number;
  dimensions: {
    [dimension: string]: {
      completed: number;
      total: number;
      percent: number;
      cost: number;
      estimatedCost: number;
      failed: number;
      etaSeconds: number;
    };
  };
}
```

**Example:**
```typescript
// In process options
const result = await engine.process(sections, {
  onProgress: (progress: ProgressUpdate) => {
    console.log(`Progress: ${progress.percent}%`);
    console.log(`Cost so far: $${progress.cost.toFixed(4)}`);
    console.log(`Estimated total: $${progress.estimatedCost.toFixed(4)}`);
    console.log(`ETA: ${progress.etaSeconds}s`);
    console.log(`Current: ${progress.currentDimension}`);
  }
});

// Or poll for progress
const progress = engine.getProgress();
if (progress) {
  console.log(`${progress.completed}/${progress.total} completed`);
}
```

---

## Dimension Types

### Dimension

Dimension definition (string or config object).

```typescript
type Dimension = string | DimensionConfig;
```

**Examples:**
```typescript
// String form (section dimension)
this.dimensions = ['sentiment', 'topics'];

// Config form (global dimension)
this.dimensions = [
  'sentiment',  // section
  { name: 'summary', scope: 'global' }  // global
];

// Mixed
this.dimensions = [
  'sentiment',
  'topics',
  { name: 'overall', scope: 'global' }
];
```

---

### DimensionConfig

Dimension configuration object.

```typescript
interface DimensionConfig {
  name: string;
  scope: 'section' | 'global';
  transform?: (
    result: DimensionResult,
    sections: SectionData[]
  ) => SectionData[] | Promise<SectionData[]>;
}
```

**Examples:**

**Simple global dimension:**
```typescript
const dimension: DimensionConfig = {
  name: 'categorize',
  scope: 'global'
};
```

**With transform function:**
```typescript
const dimension: DimensionConfig = {
  name: 'group_by_category',
  scope: 'global',
  transform: (result, sections) => {
    const groups = result.data?.groups || [];
    return groups.map(group => ({
      content: group.items.join('\n'),
      metadata: { category: group.name }
    }));
  }
};
```

**Async transform:**
```typescript
const dimension: DimensionConfig = {
  name: 'enrich',
  scope: 'global',
  transform: async (result, sections) => {
    const enriched = await api.enrichData(sections);
    return enriched;
  }
};
```

---

## Error & Skip Types

### RetryContext

Context for `handleRetry` hook.

```typescript
interface RetryContext extends ProviderContext {
  error: Error;                // The error that occurred
  attempt: number;             // Current attempt (1-based)
  maxAttempts: number;         // Max attempts configured
  previousAttempts: Array<{    // History of previous attempts
    attempt: number;
    error: Error;
    provider: string;
    timestamp: number;
  }>;
}
```

---

### RetryResponse

Response from `handleRetry` hook.

```typescript
interface RetryResponse {
  shouldRetry?: boolean;               // Override retry decision
  delayMs?: number;                    // Custom delay before retry
  modifiedRequest?: ProviderRequest;   // Modified request for retry
  modifiedProvider?: string;           // Switch provider
}
```

**Example:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  // Custom exponential backoff
  const delayMs = Math.pow(2, context.attempt) * 1000;
  
  // Don't retry rate limit errors
  if (context.error.message.includes('rate limit')) {
    return { shouldRetry: false };
  }
  
  return { delayMs };
}
```

---

### FallbackContext

Context for `handleProviderFallback` hook.

```typescript
interface FallbackContext extends RetryContext {
  failedProvider: string;              // The provider that failed
  fallbackProvider: string;            // The fallback being tried
  fallbackOptions: Record<string, unknown>;  // Fallback provider options
}
```

---

### FallbackResponse

Response from `handleProviderFallback` hook.

```typescript
interface FallbackResponse {
  shouldFallback?: boolean;            // Override fallback decision
  delayMs?: number;                    // Delay before trying fallback
  modifiedRequest?: ProviderRequest;   // Modified request
}
```

---

### FailureContext

Context for `handleDimensionFailure` hook.

```typescript
interface FailureContext extends RetryContext {
  totalAttempts: number;       // Total attempts made
  providers: string[];         // All providers tried
}
```

---

### SkipWithResult

Return type for skip hooks when providing cached result.

```typescript
interface SkipWithResult {
  skip: true;
  result: DimensionResult;
}
```

**Example:**
```typescript
async shouldSkipSectionDimension(
  context: SectionDimensionContext
): Promise<boolean | SkipWithResult> {
  const cacheKey = `${context.dimension}:${context.section.metadata.id}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return {
      skip: true,
      result: {
        data: JSON.parse(cached),
        metadata: { cached: true }
      }
    };
  }
  
  return false;
}
```

---

## Type Guards

Utility functions for type checking at runtime.

### isSkipWithResult

Check if skip result includes a cached result.

```typescript
function isSkipWithResult(
  result: boolean | SkipWithResult
): result is SkipWithResult {
  return typeof result === 'object' && 
         result.skip === true && 
         'result' in result;
}
```

**Example:**
```typescript
const skipResult = await plugin.shouldSkipSectionDimension(context);

if (isSkipWithResult(skipResult)) {
  // Use cached result
  return skipResult.result;
} else if (skipResult === true) {
  // Skip without result
  return { metadata: { skipped: true } };
} else {
  // Don't skip
  return await executeNormally();
}
```

---

### isErrorResult

Check if dimension result is an error.

```typescript
function isErrorResult(
  result: DimensionResult
): result is { error: string } {
  return 'error' in result && typeof result.error === 'string';
}
```

**Example:**
```typescript
const result = section.results.sentiment;

if (isErrorResult(result)) {
  console.error('Dimension failed:', result.error);
} else {
  console.log('Sentiment:', result.data.sentiment);
}
```

---

### isSuccessResult

Check if dimension result has data.

```typescript
function isSuccessResult(
  result: DimensionResult
): result is { data: unknown } {
  return 'data' in result && !('error' in result);
}
```

**Example:**
```typescript
const result = section.results.sentiment;

if (isSuccessResult(result)) {
  console.log('Success:', result.data);
  console.log('Tokens:', result.metadata?.tokens);
} else if (isErrorResult(result)) {
  console.error('Error:', result.error);
}
```

---

## Quick Reference

### Core Data Flow

```typescript
// Input
const sections: SectionData[] = [
  { content: '...', metadata: { ... } }
];

// Execute
const result: ProcessResult = await engine.process(sections);

// Access results
result.sections.forEach(sectionResult => {
  const section: SectionData = sectionResult.section;
  const results: Record<string, DimensionResult> = sectionResult.results;
  
  const sentiment: DimensionResult = results.sentiment;
  const data = sentiment.data;
  const metadata: ProviderMetadata = sentiment.metadata;
});
```

### Context Hierarchy

```typescript
BaseContext
├─ ProcessContext
│  ├─ BeforeProcessStartContext
│  ├─ ProcessResultContext
│  └─ ProcessFailureContext
├─ DimensionContext
│  ├─ SectionDimensionContext
│  ├─ ProviderContext
│  │  ├─ ProviderResultContext
│  │  └─ RetryContext
│  │     ├─ FallbackContext
│  │     └─ FailureContext
│  ├─ DimensionResultContext
│  │  └─ TransformSectionsContext
│  └─ FinalizeContext
```

### Common Patterns

**Accessing section results:**
```typescript
const sentiment = result.sections[0].results.sentiment?.data;
```

**Accessing global results:**
```typescript
const summary = result.globalResults.overall_summary?.data;
```

**Accessing costs:**
```typescript
const totalCost = result.costs?.totalCost;
const dimensionCost = result.costs?.byDimension.sentiment?.cost;
```

**Checking for errors:**
```typescript
if (result.error) {
  console.error('Failed:', result.error);
} else if (result.data) {
  console.log('Success:', result.data);
}
```

**Type-safe dependency access:**
```typescript
interface SentimentData {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
}

const sentiment = context.dependencies.sentiment as 
  DimensionResult<SentimentData> | undefined;

if (sentiment?.data) {
  const score: number = sentiment.data.score;
}
```
