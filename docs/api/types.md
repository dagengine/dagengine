---
title: Type Reference
description: TypeScript interfaces and types used in dag-engine
---

# Type Reference

Complete TypeScript interfaces and types used throughout dag-engine.

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
createPrompt(context: PromptContext) {
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

### PromptContext

Context passed to `createPrompt()` method. Used to build prompts for AI providers.

```typescript
interface PromptContext {
  sections: SectionData[];              // Sections to process
  dimension: string;                    // Current dimension name
  dependencies: DimensionDependencies;  // Results from dependencies
  isGlobal: boolean;                    // false for section, true for global
}
```

**Example:**
```typescript
createPrompt(context: PromptContext): string {
  const { dimension, sections, dependencies, isGlobal } = context;
  
  if (dimension === 'sentiment') {
    return `Analyze the sentiment of this review:
    
    "${sections[0].content}"
    
    Respond with JSON: { "sentiment": "positive" | "negative" | "neutral", "score": 0-1 }`;
  }
  
  if (dimension === 'summary' && isGlobal) {
    const sentiments = dependencies.sentiment?.data?.sections || [];
    return `Create a summary of ${sentiments.length} reviews...`;
  }
  
  return `Analyze: ${sections[0].content}`;
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

**Example:**
```typescript
async beforeProcessStart(
  context: BeforeProcessStartContext
): Promise<ProcessStartResult> {
  console.log(`Starting process ${context.processId}`);
  console.log(`Processing ${context.sections.length} sections`);
  
  // Filter out empty sections
  const filteredSections = context.sections.filter(
    s => s.content.trim().length > 0
  );
  
  return {
    sections: filteredSections,
    metadata: { originalCount: context.sections.length }
  };
}
```

---

### ProcessStartResult

Return type for `beforeProcessStart` hook.

```typescript
interface ProcessStartResult {
  sections?: SectionData[];  // Modified sections
  metadata?: unknown;        // Custom metadata
}
```

**Example:**
```typescript
// Return modified sections
return {
  sections: filteredSections,
  metadata: { timestamp: Date.now() }
};

// Return just metadata
return {
  metadata: { environment: 'production' }
};

// Return nothing (no changes)
return undefined;
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

**Example:**
```typescript
async afterProcessComplete(
  context: ProcessResultContext
): Promise<ProcessResult> {
  console.log(`Process completed in ${context.duration}ms`);
  console.log(`Success: ${context.successfulDimensions}/${context.totalDimensions}`);
  
  // Add custom metadata to result
  return {
    ...context.result,
    metadata: {
      ...context.result.metadata,
      duration: context.duration,
      successRate: context.successfulDimensions / context.totalDimensions
    }
  };
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

**Example:**
```typescript
async handleProcessFailure(
  context: ProcessFailureContext
): Promise<ProcessResult | void> {
  console.error(`Process failed after ${context.duration}ms`);
  console.error(`Error: ${context.error.message}`);
  
  // Return partial results
  return {
    sections: context.partialResults.sections || [],
    globalResults: context.partialResults.globalResults || {},
    transformedSections: context.partialResults.transformedSections || [],
    metadata: {
      failed: true,
      error: context.error.message
    }
  };
}
```

---

### DimensionContext

Context for dimension-level hooks.

```typescript
interface DimensionContext extends BaseContext {
  dimension: string;                              // Current dimension name
  isGlobal: boolean;                              // false for section, true for global
  sections: SectionData[];                        // All sections
  dependencies: DimensionDependencies;            // Results from dependencies
  globalResults: Record<string, DimensionResult>; // Previous global results
}
```

**Used by:**
- `shouldSkipGlobalDimension`
- `transformDependencies`
- `beforeDimensionExecute`

**Example:**
```typescript
async shouldSkipGlobalDimension(
  context: DimensionContext
): Promise<boolean> {
  // Skip if no sections
  if (context.sections.length === 0) {
    return true;
  }
  
  // Skip if dependency failed
  const required = context.dependencies.required_data;
  if (required?.error) {
    return true;
  }
  
  return false;
}
```

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
async shouldSkipSectionDimension(
  context: SectionDimensionContext
): Promise<boolean | SkipWithResult> {
  console.log(`Processing section ${context.sectionIndex}`);
  console.log(`Section content: ${context.section.content}`);
  
  // Skip based on section content
  if (context.section.content.length < 50) {
    return true;
  }
  
  // Skip based on dependency
  const spamCheck = context.dependencies.spam_check;
  if (spamCheck?.data?.is_spam === true) {
    return true;
  }
  
  // Return cached result
  const cached = await redis.get(`${context.dimension}:${context.sectionIndex}`);
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

### ProviderContext

Context for provider-level hooks (`beforeProviderExecute`).

```typescript
interface ProviderContext extends DimensionContext {
  request: ProviderRequest;                   // The request to be sent
  provider: string;                           // Provider name (e.g., 'anthropic')
  providerOptions: Record<string, unknown>;   // Provider options
}
```

**Example:**
```typescript
async beforeProviderExecute(
  context: ProviderContext
): Promise<ProviderRequest> {
  console.log(`Executing ${context.dimension} with ${context.provider}`);
  
  // Log request
  console.log('Request:', context.request.input);
  
  // Modify request
  return {
    ...context.request,
    options: {
      ...context.request.options,
      temperature: 0.2  // Override temperature
    }
  };
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

**Example:**
```typescript
async afterProviderExecute(
  context: ProviderResultContext
): Promise<ProviderResponse> {
  console.log(`${context.provider} responded in ${context.duration}ms`);
  console.log(`Tokens used: ${context.tokensUsed?.totalTokens}`);
  
  // Validate response
  if (!context.result.data) {
    return {
      error: 'Empty response from provider',
      metadata: context.result.metadata
    };
  }
  
  return context.result;
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

**Example:**
```typescript
async afterDimensionExecute(
  context: DimensionResultContext
): Promise<void> {
  const type = context.isGlobal ? 'global' : `section ${context.sectionIndex}`;
  console.log(`${context.dimension} (${type}) completed in ${context.duration}ms`);
  
  if (context.tokensUsed) {
    console.log(`Tokens: ${context.tokensUsed.totalTokens}`);
    console.log(`Cost: $${context.cost?.toFixed(4)}`);
  }
  
  // Log to analytics
  await analytics.track('dimension_complete', {
    dimension: context.dimension,
    duration: context.duration,
    tokens: context.tokensUsed?.totalTokens
  });
}
```

---

### TransformSectionsContext

Context for `transformSections` hook (extends ProviderResultContext).

```typescript
interface TransformSectionsContext extends ProviderResultContext {
  currentSections: SectionData[];  // Current sections before transformation
}
```

**Example:**
```typescript
async transformSections(
  context: TransformSectionsContext
): Promise<SectionData[] | undefined> {
  if (context.dimension !== 'group_by_category') {
    return undefined;  // No transformation
  }
  
  const groups = context.result.data?.groups || [];
  
  // Transform: 100 sections → 5 category groups
  return groups.map(group => ({
    content: group.reviews.join('\n\n'),
    metadata: {
      category: group.category,
      count: group.reviews.length,
      originalSections: group.indices
    }
  }));
}
```

---

### FinalizeContext

Context for `finalizeResults` hook.

```typescript
interface FinalizeContext extends BaseContext {
  results: Record<string, DimensionResult>;       // All dimension results
  originalSections: SectionData[];                // Original input sections
  currentSections: SectionData[];                 // Current sections (post-transform)
  globalResults: Record<string, DimensionResult>; // Global results
  duration: number;                               // Total process duration (ms)
}
```

**Example:**
```typescript
async finalizeResults(
  context: FinalizeContext
): Promise<Record<string, DimensionResult>> {
  console.log(`Finalizing ${Object.keys(context.results).length} results`);
  console.log(`Process took ${context.duration}ms`);
  
  // Add summary statistics
  const modifiedResults = { ...context.results };
  
  modifiedResults['_summary'] = {
    data: {
      totalDimensions: Object.keys(context.results).length,
      totalSections: context.originalSections.length,
      finalSections: context.currentSections.length,
      duration: context.duration
    }
  };
  
  return modifiedResults;
}
```

---

## Provider Types

### ProviderRequest

Request sent to AI provider.

```typescript
interface ProviderRequest {
  input: string | string[];               // Prompt(s)
  options?: Record<string, unknown>;      // Model, temperature, etc.
  dimension?: string;                     // Dimension name
  isGlobal?: boolean;                     // Global or section dimension
  metadata?: {
    sectionIndex?: number;                // Section index (for section dims)
    totalSections?: number;               // Total sections in process
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
  model?: string;              // Model used
  tokens?: TokenUsage;         // Token usage
  provider?: string;           // Provider name
  cost?: number;               // Cost incurred
  cached?: boolean;            // Whether result was cached
  skipped?: boolean;           // Whether dimension was skipped
  reason?: string;             // Skip reason (if skipped)
  [key: string]: unknown;      // Custom metadata
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
  duration: 2500,           // Custom: request duration
  requestId: 'req-123',     // Custom: provider request ID
  retries: 0                // Custom: number of retries
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
  provider: string;                       // Primary provider name
  options: Record<string, unknown>;       // Provider options
  fallbacks?: Array<{                     // Fallback providers
    provider: string;
    options: Record<string, unknown>;
    retryAfter?: number;                  // Delay before trying (ms)
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
      temperature: 0.3,
      max_tokens: 2000
    },
    fallbacks: [
      {
        provider: 'openai',
        options: { 
          model: 'gpt-4o',
          temperature: 0.3 
        },
        retryAfter: 1000  // Wait 1s before trying fallback
      },
      {
        provider: 'gemini',
        options: { 
          model: 'gemini-1.5-pro',
          temperature: 0.3 
        }
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
  totalCost: number;                              // Total cost (USD)
  totalTokens: number;                            // Total tokens used
  byDimension: Record<string, DimensionCost>;     // Cost per dimension
  byProvider: Record<string, {                    // Cost per provider
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
  cost: number;           // Cost in USD
  tokens: TokenUsage;     // Token usage
  model: string;          // Model used
  provider: string;       // Provider used
}
```

**Example:**
```typescript
const dimensionCost: DimensionCost = {
  cost: 0.0115,
  tokens: {
    inputTokens: 6548,
    outputTokens: 1559,
    totalTokens: 8107
  },
  model: 'claude-3-5-haiku-20241022',
  provider: 'anthropic'
};
```

---

### PricingConfig

Pricing configuration for cost tracking.

```typescript
interface PricingConfig {
  models: Record<string, ModelPricing>;  // Model pricing rates
  lastUpdated?: string;                  // Last update date
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
    },
    'gpt-4o': {
      inputPer1M: 2.50,
      outputPer1M: 10.00
    }
  },
  lastUpdated: '2024-01-15'
};

// Use in engine config
const engine = new DagEngine({
  plugin: myPlugin,
  providers: myAdapter,
  pricing
});
```

---

## Progress Types

### ProgressUpdate

Real-time progress information.

```typescript
interface ProgressUpdate {
  completed: number;                    // Completed operations
  total: number;                        // Total operations
  percent: number;                      // Completion percentage
  cost: number;                         // Cost so far (USD)
  estimatedCost: number;                // Estimated total cost (USD)
  elapsedSeconds: number;               // Time elapsed (seconds)
  etaSeconds: number;                   // Estimated time remaining (seconds)
  currentDimension: string;             // Current dimension name
  currentSection: number;               // Current section index
  dimensions: {                         // Per-dimension progress
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
    console.log(`Progress: ${progress.percent.toFixed(1)}%`);
    console.log(`Cost so far: $${progress.cost.toFixed(4)}`);
    console.log(`Estimated total: $${progress.estimatedCost.toFixed(4)}`);
    console.log(`ETA: ${progress.etaSeconds}s`);
    console.log(`Current: ${progress.currentDimension}`);
    
    // Per-dimension progress
    Object.entries(progress.dimensions).forEach(([dim, stats]) => {
      console.log(`  ${dim}: ${stats.percent.toFixed(1)}% ($${stats.cost.toFixed(4)})`);
    });
  }
});

// Or poll for progress
const progress = engine.getProgress();
if (progress) {
  console.log(`${progress.completed}/${progress.total} completed`);
}
```

---

### ProgressDisplayOptions

Options for built-in progress display.

```typescript
interface ProgressDisplayOptions {
  display?: "simple" | "bar" | "multi" | "none";  // Display style
  format?: string;                                 // Custom format string
  showDimensions?: boolean;                        // Show dimension info
  throttleMs?: number;                             // Update throttle (ms)
}
```

**Example:**
```typescript
// Simple text progress
const engine = new DagEngine({
  plugin: myPlugin,
  providers: myAdapter,
  progressDisplay: {
    display: 'simple'
  }
});

// Progress bar (requires cli-progress)
const engine = new DagEngine({
  plugin: myPlugin,
  providers: myAdapter,
  progressDisplay: {
    display: 'bar',
    format: 'Progress |{bar}| {percentage}% | ${cost} | ETA: {eta}s'
  }
});

// Multiple bars per dimension
const engine = new DagEngine({
  plugin: myPlugin,
  providers: myAdapter,
  progressDisplay: {
    display: 'multi',
    showDimensions: true,
    throttleMs: 100
  }
});

// Disable display (use onProgress callback instead)
const engine = new DagEngine({
  plugin: myPlugin,
  providers: myAdapter,
  progressDisplay: false
});
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
this.dimensions = ['sentiment', 'topics', 'category'];

// Config form (global dimension)
this.dimensions = [
  'sentiment',                              // section
  { name: 'summary', scope: 'global' }      // global
];

// Mixed
this.dimensions = [
  'sentiment',
  'topics',
  { name: 'overall', scope: 'global' },
  { name: 'categorize', scope: 'global' }
];
```

---

### DimensionConfig

Dimension configuration object.

```typescript
interface DimensionConfig {
  name: string;                             // Dimension name
  scope: 'section' | 'global';              // Execution scope
  transform?: (                             // Optional transform function
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
    
    // Transform: 100 sections → 5 category groups
    return groups.map(group => ({
      content: group.items.join('\n'),
      metadata: { 
        category: group.name,
        count: group.items.length
      }
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
    const enrichedData = await api.enrichData(sections);
    
    return sections.map((section, i) => ({
      ...section,
      metadata: {
        ...section.metadata,
        enrichment: enrichedData[i]
      }
    }));
  }
};
```

**Filter transform:**
```typescript
const dimension: DimensionConfig = {
  name: 'filter_spam',
  scope: 'global',
  transform: (result, sections) => {
    const spamIndices = result.data?.spam_indices || [];
    
    // Filter out spam sections
    return sections.filter((_, i) => !spamIndices.includes(i));
  }
};
```

---

## Process Options

### ProcessOptions

Options passed to `engine.process()`.

```typescript
interface ProcessOptions {
  // Core options
  processId?: string;                                     // Custom process ID
  metadata?: unknown;                                     // Custom metadata
  
  // Progress tracking
  onProgress?: (progress: ProgressUpdate) => void;        // Progress callback
  updateEvery?: number;                                   // Update frequency
  progressDisplay?: ProgressDisplayOptions | boolean;     // Built-in display
  
  // Lifecycle callbacks
  onDimensionStart?: (dimension: string) => void;
  onDimensionComplete?: (dimension: string, result: DimensionResult) => void;
  onSectionStart?: (index: number, total: number) => void;
  onSectionComplete?: (index: number, total: number) => void;
  onError?: (context: string, error: Error) => void;
  
  // Additional custom options
  [key: string]: unknown;
}
```

**Example:**
```typescript
const result = await engine.process(sections, {
  processId: 'custom-id-123',
  metadata: { userId: 456, environment: 'production' },
  
  onProgress: (progress) => {
    console.log(`${progress.percent}% - $${progress.cost}`);
  },
  
  onDimensionStart: (dimension) => {
    console.log(`Starting: ${dimension}`);
  },
  
  onDimensionComplete: (dimension, result) => {
    if (result.error) {
      console.error(`${dimension} failed:`, result.error);
    } else {
      console.log(`${dimension} completed`);
    }
  },
  
  onError: (context, error) => {
    console.error(`Error in ${context}:`, error.message);
  },
  
  progressDisplay: {
    display: 'bar',
    showDimensions: true
  }
});
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

**Example:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  console.log(`Retry attempt ${context.attempt}/${context.maxAttempts}`);
  console.log(`Error: ${context.error.message}`);
  
  // Custom exponential backoff
  const delayMs = Math.pow(2, context.attempt) * 1000;
  
  // Don't retry rate limit errors
  if (context.error.message.includes('rate limit')) {
    return { shouldRetry: false };
  }
  
  // Don't retry after 5 attempts
  if (context.attempt >= 5) {
    return { shouldRetry: false };
  }
  
  return { shouldRetry: true, delayMs };
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
// Simple retry with delay
return { delayMs: 2000 };

// Don't retry
return { shouldRetry: false };

// Modify request for retry
return {
  modifiedRequest: {
    ...context.request,
    options: {
      ...context.request.options,
      temperature: 0.5  // Increase temperature
    }
  }
};

// Switch to different model
return {
  modifiedRequest: {
    ...context.request,
    options: { model: 'claude-3-5-sonnet-20241022' }
  }
};
```

---

### FallbackContext

Context for `handleProviderFallback` hook.

```typescript
interface FallbackContext extends RetryContext {
  failedProvider: string;                      // The provider that failed
  fallbackProvider: string;                    // The fallback being tried
  fallbackOptions: Record<string, unknown>;    // Fallback provider options
}
```

**Example:**
```typescript
async handleProviderFallback(
  context: FallbackContext
): Promise<FallbackResponse> {
  console.log(`${context.failedProvider} failed, trying ${context.fallbackProvider}`);
  
  // Wait before trying fallback
  return {
    shouldFallback: true,
    delayMs: 1000
  };
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

**Example:**
```typescript
// Allow fallback with delay
return {
  shouldFallback: true,
  delayMs: 2000
};

// Skip fallback
return { shouldFallback: false };

// Modify request for fallback
return {
  modifiedRequest: {
    ...context.request,
    input: simplifiedPrompt
  }
};
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

**Example:**
```typescript
async handleDimensionFailure(
  context: FailureContext
): Promise<DimensionResult | void> {
  console.error(`All providers failed for ${context.dimension}`);
  console.error(`Tried: ${context.providers.join(', ')}`);
  console.error(`Total attempts: ${context.totalAttempts}`);
  
  // Return fallback result
  return {
    data: {
      fallback: true,
      defaultValue: null
    },
    metadata: {
      failed: true,
      error: context.error.message
    }
  };
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
  // Simple skip
  if (context.section.content.length < 50) {
    return true;
  }
  
  // Skip with cached result
  const cacheKey = `${context.dimension}:${context.section.metadata.id}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return {
      skip: true,
      result: {
        data: JSON.parse(cached),
        metadata: { 
          cached: true,
          cacheKey,
          timestamp: Date.now()
        }
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
): result is SkipWithResult
```

**Example:**
```typescript
const skipResult = await plugin.shouldSkipSectionDimension(context);

if (isSkipWithResult(skipResult)) {
  // Use cached result
  console.log('Using cached result:', skipResult.result.data);
  return skipResult.result;
} else if (skipResult === true) {
  // Skip without result
  return { metadata: { skipped: true } };
} else {
  // Don't skip - execute normally
  return await executeNormally();
}
```

---

### isErrorResult

Check if dimension result is an error.

```typescript
function isErrorResult(
  result: DimensionResult
): result is { error: string }
```

**Example:**
```typescript
const result = section.results.sentiment;

if (isErrorResult(result)) {
  console.error('Dimension failed:', result.error);
  console.error('Provider:', result.metadata?.provider);
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
): result is { data: unknown }
```

**Example:**
```typescript
const result = section.results.sentiment;

if (isSuccessResult(result)) {
  console.log('Success:', result.data);
  console.log('Model:', result.metadata?.model);
  console.log('Tokens:', result.metadata?.tokens);
  console.log('Cost:', result.metadata?.cost);
} else if (isErrorResult(result)) {
  console.error('Error:', result.error);
} else {
  console.log('Skipped');
}
```

---

## Quick Reference

### Core Data Flow

```typescript
// 1. Input
const sections: SectionData[] = [
  { content: '...', metadata: { id: 1 } }
];

// 2. Execute
const result: ProcessResult = await engine.process(sections);

// 3. Access section results
result.sections.forEach(sectionResult => {
  const section: SectionData = sectionResult.section;
  const results: Record<string, DimensionResult> = sectionResult.results;
  
  const sentiment: DimensionResult = results.sentiment;
  const data = sentiment.data;
  const metadata: ProviderMetadata = sentiment.metadata;
});

// 4. Access global results
const summary = result.globalResults.overall_summary?.data;

// 5. Access costs
const totalCost = result.costs?.totalCost;
const dimensionCost = result.costs?.byDimension.sentiment?.cost;
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
└─ PromptContext (standalone)
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

**Using type guards:**
```typescript
if (isErrorResult(result)) {
  console.error('Error:', result.error);
} else if (isSuccessResult(result)) {
  console.log('Data:', result.data);
} else {
  console.log('Skipped');
}
```

**Progress tracking:**
```typescript
await engine.process(sections, {
  onProgress: (progress: ProgressUpdate) => {
    console.log(`${progress.percent}% - $${progress.cost}`);
  }
});
```

**Skip with cached result:**
```typescript
const skipResult = await plugin.shouldSkipSectionDimension(context);

if (isSkipWithResult(skipResult)) {
  return skipResult.result;  // Use cached
}
```
