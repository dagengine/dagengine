---
title: Plugin Hooks API
description: Complete reference for all lifecycle hooks in dag-engine plugins
---

# Plugin Hooks API

Complete reference for all lifecycle hooks in dag-engine plugins.

## Overview

The Plugin class provides 18 lifecycle hooks that fire at different stages of workflow execution. All hooks support `async/await` for database queries, API calls, and other async operations.

**Hook Categories:**
- [Process Lifecycle](#process-lifecycle) (3 hooks) - Setup and teardown for entire workflow
- [Dimension Lifecycle](#dimension-lifecycle) (6 hooks) - Per-dimension control and validation
- [Provider Lifecycle](#provider-lifecycle) (2 hooks) - Modify requests/responses before/after API calls
- [Error Handling](#error-handling) (4 hooks) - Retry logic, fallbacks, and failure recovery
- [Data Transformation](#data-transformation) (3 hooks) - Reshape data during execution

## Quick Reference Table

| Hook | When It Fires | Returns | Use Case |
|------|---------------|---------|----------|
| `beforeProcessStart` | Before workflow starts | Modified sections/metadata | Initialize connections, enrich data |
| `afterProcessComplete` | After all dimensions complete | Modified result | Send webhooks, upload results |
| `handleProcessFailure` | When entire process fails | Partial result or void | Error recovery, rollback |
| `defineDependencies` | At process start | Dependency graph | Define execution order |
| `shouldSkipGlobalDimension` | Before each global dimension | boolean or cached result | Skip unnecessary work |
| `shouldSkipSectionDimension` | Before each section dimension | boolean or cached result | Cache checks, filtering |
| `transformDependencies` | After dependencies resolve | Modified dependencies | Enrich with external data |
| `beforeDimensionExecute` | Before dimension starts | void | Logging, validation |
| `afterDimensionExecute` | After dimension completes | void | Save results, update cache |
| `beforeProviderExecute` | Before API call | Modified request | Add headers, modify input |
| `afterProviderExecute` | After API call | Modified response | Extract metadata, validate |
| `transformSections` | After global dimensions | New sections array | Group, filter, split data |
| `finalizeResults` | Before returning to user | Modified results | Final transformations |
| `handleRetry` | When retry needed | Retry config | Custom backoff, logging |
| `handleProviderFallback` | When switching providers | Fallback config | Provider selection |
| `handleDimensionFailure` | After all retries fail | Fallback result or void | Graceful degradation |

## Hook Return Value Behavior

**Important:**
- Hooks that return `void` cannot modify behavior (logging/side effects only)
- Hooks that return `Promise<void>` are awaited but cannot change state
- Hooks that return data (`ProcessResult`, `DimensionResult`, etc.) can modify the workflow
- Returning `undefined` or `void` from data hooks means "no changes"

**Examples:**
- `beforeDimensionExecute` returns `void` → Cannot stop execution
- `shouldSkipGlobalDimension` returns `boolean` → Can stop execution
- `transformDependencies` returns `DimensionDependencies` → Must return modified or original

## Hook Error Behavior

**What happens if a hook throws an error?**

1. **Process Lifecycle Hooks** (`beforeProcessStart`, `afterProcessComplete`):
   - Error is caught and logged
   - `options.onError` callback is called
   - For `beforeProcessStart`: Error is re-thrown (stops process)
   - For `afterProcessComplete`: Error is logged, original result returned

2. **Dimension Hooks** (`beforeDimensionExecute`, `afterDimensionExecute`):
   - Error is logged to console
   - `options.onError` callback is called
   - Dimension continues execution

3. **Provider Hooks** (`beforeProviderExecute`, `afterProviderExecute`):
   - Error is logged to console
   - Original request/response is used (hook is skipped)
   - Provider call continues

4. **Error Handling Hooks** (`handleRetry`, `handleProviderFallback`, `handleDimensionFailure`):
   - Error is logged to console
   - Default behavior is used (retry proceeds, fallback proceeds, dimension fails)

5. **Transform Hooks** (`transformDependencies`, `transformSections`, `finalizeResults`):
   - Error is caught and logged
   - `options.onError` callback is called
   - Original data is used (no transformation applied)

**See `src/core/lifecycle/hook-executor.ts` for full error handling implementation.**

## Required Methods

Before diving into lifecycle hooks, note that Plugin has 2 **required** abstract methods:

### createPrompt

Build the prompt for each dimension execution.

**Signature:**
```typescript
abstract createPrompt(
  context: PromptContext
): string | Promise<string>
```

**Context:**
```typescript
interface PromptContext {
  sections: SectionData[];              // Current section(s)
  dimension: string;                    // Current dimension name
  dependencies: DimensionDependencies;  // Results from dependencies
  isGlobal: boolean;                    // false for section, true for global
}
```

**Example:**
```typescript
createPrompt(context) {
  if (context.dimension === 'sentiment') {
    const text = context.sections[0].content;
    return `Analyze sentiment of: "${text}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  if (context.dimension === 'summary') {
    const sentiment = context.dependencies.sentiment?.data?.sentiment;
    return `Create a ${sentiment} summary of: "${context.sections[0].content}"`;
  }
}
```

### selectProvider

Select which AI provider and model to use for each dimension.

**Signature:**
```typescript
abstract selectProvider(
  dimension: string,
  sections?: SectionData[],
  context?: {
    isGlobal: boolean;
    sectionIndex?: number;    // Only present for section dimensions
    totalSections?: number;   // Total number of sections in process
  }
): ProviderSelection | Promise<ProviderSelection>
```

**Returns:**
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
selectProvider(dimension, sections, context) {
  if (dimension === 'spam_check') {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-3-5-haiku-20241022',
        temperature: 0.1
      }
    };
  }
  
  if (dimension === 'deep_analysis') {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-3-7-sonnet-20250219',
        temperature: 0.3
      },
      fallbacks: [
        { provider: 'openai', options: { model: 'gpt-4o' } }
      ]
    };
  }
}
```

## Process Lifecycle

### beforeProcessStart

Called once at the beginning of workflow execution. Use for initialization, data enrichment, or validation.

**Signature:**
```typescript
async beforeProcessStart(
  context: BeforeProcessStartContext
): Promise<ProcessStartResult | void>
```

**Context:**
```typescript
interface BeforeProcessStartContext extends BaseContext {
  processId: string;        // Unique process ID (UUID) - from BaseContext
  timestamp: number;        // Start time (ms since epoch) - from BaseContext
  sections: SectionData[];  // Input sections
  options: ProcessOptions;  // Process options
}
```

**Returns:**
```typescript
interface ProcessStartResult {
  sections?: SectionData[];  // Modified sections (optional)
  metadata?: unknown;        // Process metadata (optional)
}
```

**Examples:**

```typescript
// Initialize database connection
async beforeProcessStart(context) {
  await this.db.connect();
  console.log(`Starting process ${context.processId}`);
}

// Enrich sections with user data
async beforeProcessStart(context) {
  const userIds = context.sections.map(s => s.metadata.userId);
  const users = await this.db.users.findMany({ ids: userIds });
  
  return {
    sections: context.sections.map((section, i) => ({
      ...section,
      metadata: {
        ...section.metadata,
        user: users[i]
      }
    }))
  };
}

// Add process-level metadata
async beforeProcessStart(context) {
  return {
    metadata: {
      startedBy: 'user-123',
      environment: 'production',
      version: '1.0.0'
    }
  };
}
```

### afterProcessComplete

Called once after all dimensions complete successfully. Use for cleanup, notifications, or final transformations.

**Signature:**
```typescript
async afterProcessComplete(
  context: ProcessResultContext
): Promise<ProcessResult | void>
```

**Context:**
```typescript
interface ProcessResultContext extends ProcessContext {
  processId: string;
  timestamp: number;
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: unknown;           // From beforeProcessStart
  result: ProcessResult;        // Complete results
  duration: number;             // Total duration (ms)
  totalDimensions: number;      // Total dimensions executed
  successfulDimensions: number; // Successful dimensions
  failedDimensions: number;     // Failed dimensions
}

// Note: Also aliased as AfterProcessCompleteContext (deprecated)
```

**Returns:**
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

**Examples:**

```typescript
// Send webhook notification
async afterProcessComplete(context) {
  await fetch('https://api.example.com/webhook', {
    method: 'POST',
    body: JSON.stringify({
      processId: context.processId,
      duration: context.duration,
      successRate: context.successfulDimensions / context.totalDimensions
    })
  });
}

// Upload results to S3
async afterProcessComplete(context) {
  const key = `results/${context.processId}.json`;
  await this.s3.upload(key, JSON.stringify(context.result));
  
  return {
    ...context.result,
    metadata: {
      ...context.result.metadata,
      s3Key: key
    }
  };
}

// Cleanup resources
async afterProcessComplete(context) {
  await this.db.disconnect();
  console.log(`Process ${context.processId} completed in ${context.duration}ms`);
}
```

### handleProcessFailure

Called when the entire process fails (not just a single dimension). Use for error recovery, rollback, or partial result handling.

**Signature:**
```typescript
async handleProcessFailure(
  context: ProcessFailureContext
): Promise<ProcessResult | void>
```

**Context:**
```typescript
interface ProcessFailureContext extends ProcessContext {
  processId: string;
  timestamp: number;
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: unknown;
  error: Error;                           // The error that caused failure
  partialResults: Partial<ProcessResult>; // Results completed before failure
  duration: number;                       // Duration until failure (ms)
}
```

**Returns:**
- `ProcessResult` - Return partial results to caller
- `void` - Re-throw error (process fails)

**Examples:**

```typescript
// Return partial results
async handleProcessFailure(context) {
  console.error(`Process ${context.processId} failed:`, context.error);
  
  // Return what we have so far
  return {
    sections: context.partialResults.sections || [],
    globalResults: context.partialResults.globalResults || {},
    transformedSections: [],
    metadata: {
      failed: true,
      error: context.error.message
    }
  };
}

// Rollback database changes
async handleProcessFailure(context) {
  await this.db.rollback(context.processId);
  console.error('Rolled back changes due to failure');
  // Re-throw by returning void
}

// Send error notification
async handleProcessFailure(context) {
  await this.monitoring.logError({
    processId: context.processId,
    error: context.error,
    duration: context.duration,
    completedDimensions: context.partialResults.sections?.length || 0
  });
}
```

## Dimension Lifecycle

### defineDependencies

Called once at process start to define dimension dependencies. Controls execution order.

**Signature:**
```typescript
async defineDependencies(
  context: ProcessContext
): Promise<Record<string, string[]>>
```

**Context:**
```typescript
interface ProcessContext extends BaseContext {
  processId: string;
  timestamp: number;
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: unknown;
}
```

**Returns:**
```typescript
// Map of dimension name → array of dependency names
{
  dimensionName: ['dependency1', 'dependency2']
}
```

**Examples:**

```typescript
// Static dependencies
defineDependencies() {
  return {
    sentiment: [],                       // No dependencies
    topics: [],                          // No dependencies
    summary: ['sentiment', 'topics']     // Waits for both
  };
}

// Dynamic dependencies based on config
defineDependencies(context) {
  const deps: Record<string, string[]> = {
    classify: []
  };
  
  if (this.config.enableDeepAnalysis) {
    deps.deep_analysis = ['classify'];
  }
  
  return deps;
}

// Load dependencies from database
async defineDependencies(context) {
  const rules = await this.db.dependencyRules.find({
    pluginId: this.id
  });
  
  return rules.reduce((acc, rule) => {
    acc[rule.dimension] = rule.dependencies;
    return acc;
  }, {});
}
```

### shouldSkipGlobalDimension

Called before each global dimension executes. Return `true` to skip, `false` to execute, or provide a cached result.

**Signature:**
```typescript
async shouldSkipGlobalDimension(
  context: DimensionContext
): Promise<boolean | SkipWithResult>
```

**Context:**
```typescript
interface DimensionContext extends BaseContext {
  processId: string;
  timestamp: number;
  dimension: string;                    // Current dimension name
  isGlobal: boolean;                    // Always true for this hook
  sections: SectionData[];              // All sections
  dependencies: DimensionDependencies;  // Completed dependencies
  globalResults: Record<string, DimensionResult>;  // Previous global results
}
```

**Returns:**
- `boolean` - `true` to skip, `false` to execute
- `SkipWithResult` - Skip with cached result:
  ```typescript
  interface SkipWithResult {
    skip: true;
    result: DimensionResult;
  }
  ```

**Examples:**

```typescript
// Skip if not enough data
shouldSkipGlobalDimension(context) {
  if (context.dimension === 'cluster') {
    return context.sections.length < 10;  // Need at least 10 sections
  }
  return false;
}

// Check cache
async shouldSkipGlobalDimension(context) {
  const cacheKey = `${context.dimension}:${context.processId}`;
  const cached = await this.redis.get(cacheKey);
  
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

// Skip based on dependency results
shouldSkipGlobalDimension(context) {
  if (context.dimension === 'synthesize') {
    // Skip if no successful section analyses
    const classify = context.dependencies.classify?.data;
    const hasResults = classify?.sections?.some(s => s.data);
    return !hasResults;
  }
  return false;
}
```

### shouldSkipSectionDimension

Called before each section dimension executes (once per section). Use for per-section caching, filtering, or skip logic.

**Signature:**
```typescript
async shouldSkipSectionDimension(
  context: SectionDimensionContext
): Promise<boolean | SkipWithResult>
```

**Context:**
```typescript
interface SectionDimensionContext extends DimensionContext {
  processId: string;
  timestamp: number;
  dimension: string;                    // Current dimension name
  isGlobal: boolean;                    // Always false for this hook
  sections: SectionData[];              // All sections (for reference)
  dependencies: DimensionDependencies;  // Completed dependencies
  globalResults: Record<string, DimensionResult>;
  section: SectionData;                 // Current section being processed
  sectionIndex: number;                 // Index of current section
}
```

**Returns:**
- `boolean` - `true` to skip, `false` to execute
- `SkipWithResult` - Skip with cached result

**Examples:**

```typescript
// Skip spam content
shouldSkipSectionDimension(context) {
  if (context.dimension === 'deep_analysis') {
    const spamCheck = context.dependencies.spam_check;
    return spamCheck?.data?.is_spam === true;
  }
  return false;
}

// Check cache per section
async shouldSkipSectionDimension(context) {
  const cacheKey = `${context.dimension}:${context.section.metadata.id}`;
  const cached = await this.redis.get(cacheKey);
  
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

// Skip short content
shouldSkipSectionDimension(context) {
  if (context.dimension === 'extract_entities') {
    return context.section.content.length < 100;
  }
  return false;
}
```

### transformDependencies

Called after dependencies resolve but before creating the prompt. Use to enrich dependency data from external sources.

**Signature:**
```typescript
async transformDependencies(
  context: DimensionContext | SectionDimensionContext
): Promise<DimensionDependencies>
```

**Context:**
```typescript
// Can be either DimensionContext (for global) or SectionDimensionContext (for section)
interface DimensionContext extends BaseContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;  // Original dependencies
  globalResults: Record<string, DimensionResult>;
}

interface SectionDimensionContext extends DimensionContext {
  section: SectionData;      // Only present when isGlobal === false
  sectionIndex: number;      // Only present when isGlobal === false
}
```

**Returns:**
```typescript
interface DimensionDependencies {
  [dimensionName: string]: DimensionResult;
}
```

**Note:** This hook is called for both global and section dimensions. Check `context.isGlobal` to determine which type you're handling. For section dimensions, `context.section` and `context.sectionIndex` are available.

**Examples:**

```typescript
// Add historical data
async transformDependencies(context) {
  if (context.dimension === 'trend_analysis') {
    const current = context.dependencies.current_sentiment;
    const history = await this.db.sentiment.getHistory(
      context.sections[0].metadata.productId,
      30  // days
    );
    
    return {
      ...context.dependencies,
      historical_data: {
        data: { history },
        metadata: { source: 'database' }
      }
    };
  }
  
  return context.dependencies;
}

// Enrich with API data
async transformDependencies(context) {
  const enhanced = { ...context.dependencies };
  
  for (const [key, value] of Object.entries(enhanced)) {
    if (value.data?.needsEnrichment) {
      const apiData = await this.api.enrich(value.data);
      enhanced[key] = {
        ...value,
        data: { ...value.data, enriched: apiData }
      };
    }
  }
  
  return enhanced;
}

// Handle both global and section contexts
async transformDependencies(context) {
  if (context.isGlobal) {
    // Global dimension - use all sections
    console.log(`Transforming deps for global ${context.dimension}`);
  } else {
    // Section dimension - use specific section
    console.log(`Transforming deps for section ${context.sectionIndex}`);
  }
  
  return context.dependencies;
}
```

### beforeDimensionExecute

Called immediately before a dimension executes. Use for logging, validation, or per-dimension setup.

**Signature:**
```typescript
async beforeDimensionExecute(
  context: DimensionContext | SectionDimensionContext
): Promise<void>
```

**Context:**
```typescript
interface DimensionContext extends BaseContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
}

// For section dimensions, also includes:
interface SectionDimensionContext extends DimensionContext {
  section: SectionData;
  sectionIndex: number;
}
```

**Examples:**

```typescript
// Log execution
async beforeDimensionExecute(context) {
  console.log(`[${context.processId}] Starting dimension: ${context.dimension}`);
  
  await this.db.logs.insert({
    processId: context.processId,
    dimension: context.dimension,
    timestamp: context.timestamp,
    sectionCount: context.sections.length
  });
}

// Start timer
async beforeDimensionExecute(context) {
  this.timers.set(context.dimension, Date.now());
}

// Validate state
async beforeDimensionExecute(context) {
  if (context.dimension === 'final_summary') {
    const required = ['sentiment', 'topics'];
    const missing = required.filter(r => !context.dependencies[r]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required dependencies: ${missing.join(', ')}`);
    }
  }
}
```

### afterDimensionExecute

Called immediately after a dimension completes. Use for logging, caching, or validation.

**Signature:**
```typescript
async afterDimensionExecute(
  context: DimensionResultContext
): Promise<void>
```

**Context:**
```typescript
interface DimensionResultContext extends BaseContext {
  processId: string;
  timestamp: number;
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

**Examples:**

```typescript
// Cache result
async afterDimensionExecute(context) {
  if (context.section) {
    const cacheKey = `${context.dimension}:${context.section.metadata.id}`;
    await this.redis.setex(
      cacheKey,
      3600,  // 1 hour TTL
      JSON.stringify(context.result.data)
    );
  }
}

// Log performance
async afterDimensionExecute(context) {
  const start = this.timers.get(context.dimension);
  const duration = Date.now() - start;
  
  await this.monitoring.logMetric({
    dimension: context.dimension,
    duration,
    tokens: context.tokensUsed?.totalTokens,
    cost: context.cost,
    success: !context.result.error
  });
}

// Validate output
async afterDimensionExecute(context) {
  if (context.result.data?.sentiment) {
    const valid = ['positive', 'negative', 'neutral'].includes(
      context.result.data.sentiment
    );
    
    if (!valid) {
      throw new Error(`Invalid sentiment: ${context.result.data.sentiment}`);
    }
  }
}
```

## Provider Lifecycle

### beforeProviderExecute

Called immediately before sending request to AI provider. Last chance to modify the request.

**Signature:**
```typescript
async beforeProviderExecute(
  context: ProviderContext
): Promise<ProviderRequest>
```

**Context:**
```typescript
interface ProviderContext extends DimensionContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  request: ProviderRequest;       // The request to be sent
  provider: string;               // Provider name (e.g., 'anthropic')
  providerOptions: Record<string, unknown>;  // Provider options
}

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

**Returns:**
```typescript
ProviderRequest  // Modified request
```

**Examples:**

```typescript
// Add custom headers
async beforeProviderExecute(context) {
  return {
    ...context.request,
    options: {
      ...context.request.options,
      headers: {
        'X-Process-ID': context.processId,
        'X-Dimension': context.dimension
      }
    }
  };
}

// Modify temperature based on dimension
async beforeProviderExecute(context) {
  const creativeDimensions = ['brainstorm', 'generate'];
  const temperature = creativeDimensions.includes(context.dimension) ? 0.9 : 0.2;
  
  return {
    ...context.request,
    options: {
      ...context.request.options,
      temperature
    }
  };
}

// Add metadata
async beforeProviderExecute(context) {
  return {
    ...context.request,
    metadata: {
      ...context.request.metadata,
      userId: this.config.userId,
      environment: 'production'
    }
  };
}
```

### afterProviderExecute

Called immediately after receiving response from AI provider. Use for validation, transformation, or metadata extraction.

**Signature:**
```typescript
async afterProviderExecute(
  context: ProviderResultContext
): Promise<ProviderResponse>
```

**Context:**
```typescript
interface ProviderResultContext extends ProviderContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, unknown>;
  result: ProviderResponse;        // The response received
  duration: number;                // Request duration (ms)
  tokensUsed?: TokenUsage;         // Token usage
}

interface ProviderResponse<T = unknown> {
  data?: T;
  error?: string;
  metadata?: ProviderMetadata;
}
```

**Returns:**
```typescript
ProviderResponse  // Modified response
```

**Examples:**

```typescript
// Validate response structure
async afterProviderExecute(context) {
  if (!context.result.data) {
    return context.result;
  }
  
  const required = ['sentiment', 'score'];
  const missing = required.filter(k => !(k in context.result.data));
  
  if (missing.length > 0) {
    return {
      error: `Missing required fields: ${missing.join(', ')}`,
      metadata: context.result.metadata
    };
  }
  
  return context.result;
}

// Extract additional metadata
async afterProviderExecute(context) {
  return {
    ...context.result,
    metadata: {
      ...context.result.metadata,
      dimension: context.dimension,
      processId: context.processId,
      requestDuration: context.duration
    }
  };
}

// Transform data format
async afterProviderExecute(context) {
  if (context.result.data?.confidence) {
    // Convert 0-100 to 0-1
    return {
      ...context.result,
      data: {
        ...context.result.data,
        confidence: context.result.data.confidence / 100
      }
    };
  }
  
  return context.result;
}
```

## Data Transformation

### transformSections

Called after each global dimension executes. Use to reshape, filter, group, or split sections.

**Signature:**
```typescript
async transformSections(
  context: TransformSectionsContext
): Promise<SectionData[]>
```

**Context:**
```typescript
interface TransformSectionsContext extends ProviderResultContext {
  processId: string;
  timestamp: number;
  dimension: string;            // The dimension that just completed
  isGlobal: boolean;            // Always true (only global dims can transform)
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, unknown>;
  result: DimensionResult;      // Result from the dimension that just ran
  duration: number;
  tokensUsed?: TokenUsage;
  currentSections: SectionData[];  // Current sections before transformation
}
```

**Returns:**
```typescript
SectionData[]  // New sections array
```

**Important Notes:**
- This hook is only called for **global dimensions** (never for section dimensions)
- Return `undefined` or the original `currentSections` to indicate no transformation
- Transforming sections resets all section-level results (dimensions are re-executed)

**Examples:**

```typescript
// Group by category (many → few)
async transformSections(context) {
  if (context.dimension !== 'group_by_category') {
    return context.currentSections;  // No transformation
  }
  
  const groups = context.result.data?.groups || [];
  
  // Convert 100 sections into 5 category groups
  return groups.map(group => ({
    content: group.reviews.join('\n\n---\n\n'),
    metadata: {
      category: group.category,
      count: group.reviews.length
    }
  }));
}

// Filter sections
async transformSections(context) {
  if (context.dimension === 'quality_check') {
    // Keep only high-quality sections
    return context.currentSections.filter((section, i) => {
      const quality = context.result.data?.sections?.[i]?.data?.quality_score;
      return quality && quality > 0.7;
    });
  }
  
  return context.currentSections;
}

// Split large sections (few → many)
async transformSections(context) {
  if (context.dimension === 'chunk_documents') {
    return context.currentSections.flatMap(section => {
      const chunks = this.chunkText(section.content, 1000);
      return chunks.map((chunk, i) => ({
        content: chunk,
        metadata: {
          ...section.metadata,
          originalId: section.metadata.id,
          chunkIndex: i,
          totalChunks: chunks.length
        }
      }));
    });
  }
  
  return context.currentSections;
}
```

### finalizeResults

Called once at the very end, before returning results to user. Last chance to modify or enhance results.

**Signature:**
```typescript
async finalizeResults(
  context: FinalizeContext
): Promise<Record<string, DimensionResult>>
```

**Context:**
```typescript
interface FinalizeContext extends BaseContext {
  processId: string;
  timestamp: number;
  results: Record<string, DimensionResult>;  // All dimension results
  originalSections: SectionData[];           // Original input sections
  currentSections: SectionData[];            // Current sections (post-transform)
  globalResults: Record<string, DimensionResult>;
  duration: number;                          // Total process duration (ms)
}
```

**Returns:**
```typescript
Record<string, DimensionResult>  // Modified results
```

**Result Key Format:**
The `results` object contains:
- **Global dimensions:** `dimensionName` (e.g., `'summary'`)
- **Section dimensions:** `dimensionName_section_N` (e.g., `'sentiment_section_0'`, `'sentiment_section_1'`)

**Examples:**

```typescript
// Add summary statistics
async finalizeResults(context) {
  const sentiments = Object.values(context.results)
    .filter(r => r.data?.sentiment)
    .map(r => r.data.sentiment);
  
  return {
    ...context.results,
    _statistics: {
      data: {
        totalSections: context.originalSections.length,
        processedSections: context.currentSections.length,
        duration: context.duration,
        sentimentBreakdown: {
          positive: sentiments.filter(s => s === 'positive').length,
          negative: sentiments.filter(s => s === 'negative').length,
          neutral: sentiments.filter(s => s === 'neutral').length
        }
      },
      metadata: { type: 'statistics' }
    }
  };
}

// Remove internal fields
async finalizeResults(context) {
  const cleaned: Record<string, DimensionResult> = {};
  
  for (const [key, value] of Object.entries(context.results)) {
    if (!key.startsWith('_')) {  // Skip internal dimensions
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}

// Save to database
async finalizeResults(context) {
  await this.db.processResults.insert({
    processId: context.processId,
    results: context.results,
    duration: context.duration,
    timestamp: Date.now()
  });
  
  return context.results;
}
```

## Error Handling

### handleRetry

Called when a dimension execution fails and will be retried. Use for custom retry logic, backoff strategies, or logging.

**Signature:**
```typescript
async handleRetry(
  context: RetryContext
): Promise<RetryResponse>
```

**Context:**
```typescript
interface RetryContext extends ProviderContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, unknown>;
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

**Returns:**
```typescript
interface RetryResponse {
  shouldRetry?: boolean;               // Override retry decision
  delayMs?: number;                    // Custom delay before retry
  modifiedRequest?: ProviderRequest;   // Modified request for retry
  modifiedProvider?: string;           // Switch provider
}
```

**Gateway Mode Note:**
When using Portkey gateway (`gateway: 'portkey'`), retries are handled by the gateway and this hook may not be called. This hook primarily affects direct provider mode.

**Examples:**

```typescript
// Custom exponential backoff
async handleRetry(context) {
  // Double delay each attempt: 1s, 2s, 4s
  const delayMs = Math.pow(2, context.attempt - 1) * 1000;
  
  console.log(
    `Retry ${context.attempt}/${context.maxAttempts} for ${context.dimension} ` +
    `after ${delayMs}ms`
  );
  
  return { delayMs };
}

// Don't retry on certain errors
async handleRetry(context) {
  const permanentErrors = [
    'Invalid API key',
    'Model not found',
    'Rate limit exceeded'
  ];
  
  if (permanentErrors.some(e => context.error.message.includes(e))) {
    return { shouldRetry: false };
  }
  
  return {};
}

// Switch to simpler model on retry
async handleRetry(context) {
  if (context.attempt > 1 && context.error.message.includes('timeout')) {
    return {
      modifiedRequest: {
        ...context.request,
        options: {
          ...context.request.options,
          model: 'claude-3-5-haiku-20241022'  // Faster model
        }
      }
    };
  }
  
  return {};
}
```

### handleProviderFallback

Called when switching from a failed provider to a fallback provider. Use to modify request or add delays.

**Signature:**
```typescript
async handleProviderFallback(
  context: FallbackContext
): Promise<FallbackResponse>
```

**Context:**
```typescript
interface FallbackContext extends RetryContext {
  failedProvider: string;              // The provider that failed
  fallbackProvider: string;            // The fallback being tried
  fallbackOptions: Record<string, unknown>;  // Fallback provider options
}
```

**Returns:**
```typescript
interface FallbackResponse {
  shouldFallback?: boolean;            // Override fallback decision
  delayMs?: number;                    // Delay before trying fallback
  modifiedRequest?: ProviderRequest;   // Modified request
}
```

**Gateway Mode Note:**
When using Portkey gateway (`gateway: 'portkey'`), fallbacks are handled by the gateway configuration and this hook may not be called. This hook primarily affects direct provider mode with fallbacks configured in `selectProvider`.

**Examples:**

```typescript
// Log fallback
async handleProviderFallback(context) {
  console.log(
    `Falling back from ${context.failedProvider} to ${context.fallbackProvider} ` +
    `for dimension ${context.dimension}`
  );
  
  await this.monitoring.logFallback({
    dimension: context.dimension,
    from: context.failedProvider,
    to: context.fallbackProvider,
    error: context.error.message
  });
  
  return {};
}

// Modify prompt for different provider
async handleProviderFallback(context) {
  if (context.fallbackProvider === 'openai') {
    // OpenAI prefers different JSON instructions
    return {
      modifiedRequest: {
        ...context.request,
        input: context.request.input.replace(
          'Return JSON:',
          'Return valid JSON only, no markdown:'
        )
      }
    };
  }
  
  return {};
}

// Add delay between providers
async handleProviderFallback(context) {
  return {
    delayMs: 2000  // Wait 2s before trying fallback
  };
}
```

### handleDimensionFailure

Called after all retry attempts and fallback providers are exhausted. Last chance to provide a fallback result or handle the error.

**Signature:**
```typescript
async handleDimensionFailure(
  context: FailureContext
): Promise<DimensionResult | void>
```

**Context:**
```typescript
interface FailureContext extends RetryContext {
  totalAttempts: number;       // Total attempts made
  providers: string[];         // All providers tried
}
```

**Returns:**
- `DimensionResult` - Provide fallback result (processing continues)
- `void` - Error propagates (dimension fails, `continueOnError` setting determines if process stops)

**Examples:**

```typescript
// Provide neutral fallback
async handleDimensionFailure(context) {
  console.error(
    `All providers failed for ${context.dimension}: ${context.error.message}`
  );
  
  return {
    data: {
      sentiment: 'neutral',
      score: 0.5,
      fallback: true
    },
    metadata: {
      fallback: true,
      error: context.error.message,
      attemptedProviders: context.providers
    }
  };
}

// Log and notify
async handleDimensionFailure(context) {
  await this.monitoring.logCriticalError({
    dimension: context.dimension,
    error: context.error,
    attempts: context.totalAttempts,
    providers: context.providers
  });
  
  await this.slack.notify(
    `🚨 Dimension ${context.dimension} failed after ${context.totalAttempts} attempts`
  );
  
  // Don't provide fallback - let it fail
}

// Conditional fallback
async handleDimensionFailure(context) {
  // Only provide fallback for non-critical dimensions
  const criticalDimensions = ['compliance_check', 'security_scan'];
  
  if (criticalDimensions.includes(context.dimension)) {
    // Let critical dimensions fail
    return;
  }
  
  // Provide fallback for others
  return {
    data: { skipped: true, reason: 'provider_failure' },
    metadata: { fallback: true }
  };
}
```

## Hook Execution Order

**For a typical process with 3 sections and 3 dimensions (1 global, 2 section-level):**

```
1. beforeProcessStart (once)
   └─ Returns modified sections and/or metadata

2. defineDependencies (once)
   └─ Returns dependency graph

For each dimension (in dependency order):

  GLOBAL DIMENSION (e.g., 'classify'):
  ├─ 3. shouldSkipGlobalDimension
  │    └─ Returns: false (execute) or true (skip) or cached result
  ├─ 4. transformDependencies
  │    └─ Returns: modified dependencies
  ├─ 5. beforeDimensionExecute
  ├─ 6. beforeProviderExecute
  │    └─ Returns: modified request
  ├─ 7. [API CALL TO PROVIDER]
  │    └─ On error:
  │        ├─ handleRetry (per retry attempt)
  │        ├─ handleProviderFallback (when switching providers)
  │        └─ handleDimensionFailure (after all retries exhausted)
  ├─ 8. afterProviderExecute (only on success)
  │    └─ Returns: modified response
  ├─ 9. afterDimensionExecute
  └─ 10. transformSections
       └─ Returns: modified sections array (or original to skip transform)

  SECTION DIMENSION (e.g., 'sentiment'):
  For each section (3x):
    ├─ 3. shouldSkipSectionDimension (per section)
    │    └─ Returns: false, true, or cached result
    ├─ 4. transformDependencies (per section)
    │    └─ Returns: modified dependencies
    ├─ 5. beforeDimensionExecute (per section)
    ├─ 6. beforeProviderExecute (per section)
    │    └─ Returns: modified request
    ├─ 7. [API CALL TO PROVIDER]
    │    └─ On error:
    │        ├─ handleRetry (per retry attempt)
    │        ├─ handleProviderFallback (when switching providers)
    │        └─ handleDimensionFailure (after all retries exhausted)
    ├─ 8. afterProviderExecute (only on success, per section)
    │    └─ Returns: modified response
    └─ 9. afterDimensionExecute (per section)

11. finalizeResults (once)
    └─ Returns: modified results map

12. afterProcessComplete (once)
    └─ Returns: modified ProcessResult (optional)
```

**On process-level error:**
```
handleProcessFailure
└─ Returns: ProcessResult (partial results) or void (re-throw error)
```

**Key Points:**
- Hooks run in the order shown above
- Section dimensions execute hooks once per section
- Error handling hooks (`handleRetry`, `handleProviderFallback`, `handleDimensionFailure`) only fire on errors
- `transformSections` only fires for global dimensions
- Provider lifecycle hooks run inside the retry loop
- All hooks support async/await
