---
title: Hooks
description: Lifecycle hooks for customizing workflow behavior
---

# Hooks

Customize workflow behavior with lifecycle hooks.

## Overview

Hooks are optional methods you implement in your plugin to control execution at specific points.

**All hooks are optional** except:
- `createPrompt` (required)
- `selectProvider` (required)

**All hooks support async.**

## Required Hooks

### createPrompt

Build the AI prompt for each dimension:

```typescript
createPrompt(context: PromptContext): string {
  if (context.dimension === 'sentiment') {
    return `Analyze sentiment: "${context.sections[0].content}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  if (context.dimension === 'summary') {
    const sentiment = context.dependencies.sentiment?.data;
    return `Create ${sentiment.sentiment} summary: "${context.sections[0].content}"`;
  }
  
  return '';
}
```

---
### selectProvider

Choose which AI provider to use:

```typescript
selectProvider(dimension: string): ProviderSelection {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },
    fallbacks: [
      { provider: 'openai', options: { model: 'gpt-4o' } }
    ]
  };
}
```

---

## Control Flow

### defineDependencies

Define which dimensions depend on others:

```typescript
defineDependencies(): Record<string, string[]> {
  return {
    sentiment: [],
    topics: [],
    summary: ['sentiment', 'topics']
  };
}
```

### shouldSkipSectionDimension

Skip processing for specific sections:

```typescript
shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
  // Skip short content
  if (context.section.content.length < 50) return true;
  
  // Skip based on dependency
  if (context.dimension === 'deep_analysis') {
    const quality = context.dependencies.filter?.data?.quality;
    if (quality < 7) return true;
  }
  
  return false;
}
```

Return cached result instead of processing:

```typescript
shouldSkipSectionDimension(context): boolean | { skip: true; result: DimensionResult } {
  const cached = this.cache.get(context.section.content);
  
  if (cached) {
    return { skip: true, result: cached };
  }
  
  return false;
}
```

### shouldSkipGlobalDimension

Skip global dimensions:

```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean {
  // Need at least 3 sections
  if (context.sections.length < 3) return true;
  
  return false;
}
```

## Data Transformation

### transformDependencies

Modify dependency data before use:

```typescript
transformDependencies(context): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  // Extract just scores
  if (deps.sentiment?.data) {
    deps.sentimentScore = { data: deps.sentiment.data.score };
  }
  
  return deps;
}
```

### transformSections

Restructure sections after global dimension (global dimensions only):

```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'categorize') {
    return context.currentSections;
  }
  
  // Group by category
  const categories = context.result.data.categories;
  
  return categories.map(cat => ({
    content: cat.items.join('\n'),
    metadata: { category: cat.name, count: cat.items.length }
  }));
}
```

### finalizeResults

Post-process all results:

```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  // Add summary
  results._summary = {
    data: {
      totalDimensions: Object.keys(results).length,
      duration: context.duration
    }
  };
  
  return results;
}
```

## Lifecycle

### beforeProcessStart

Initialize workflow, validate input:

```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  // Validate
  if (context.sections.length === 0) {
    throw new Error('No sections provided');
  }
  
  return { sections: context.sections };
}
```

### afterProcessComplete

Cleanup, logging:

```typescript
async afterProcessComplete(context: ProcessResultContext): Promise<ProcessResult> {
  console.log(`Completed in ${context.duration}ms`);
  console.log(`Cost: $${context.result.costs?.totalCost}`);
  
  return context.result;
}
```

### beforeDimensionExecute

Setup before dimension:

```typescript
beforeDimensionExecute(context: DimensionContext): void {
  console.log(`Starting: ${context.dimension}`);
}
```

### afterDimensionExecute

Cleanup after dimension:

```typescript
async afterDimensionExecute(context: DimensionResultContext): Promise<void> {
  // Cache result
  if (!context.result.error) {
    const key = this.hash(context.sections[0].content);
    await this.cache.set(key, context.result);
  }
}
```

### beforeProviderExecute

Modify request before API call:

```typescript
beforeProviderExecute(context: ProviderContext): ProviderRequest {
  const request = { ...context.request };
  
  // Force JSON for Gemini
  if (context.provider === 'gemini') {
    request.input += '\n\nReturn valid JSON only.';
  }
  
  return request;
}
```

### afterProviderExecute

Modify response after API call:

```typescript
afterProviderExecute(context: ProviderResultContext): ProviderResponse {
  const response = { ...context.result };
  
  // Ensure required fields
  if (!response.data?.score) {
    response.data.score = 0.5;
  }
  
  return response;
}
```

## Error Handling

### handleRetry

Control retry behavior:

```typescript
handleRetry(context: RetryContext): RetryResponse {
  // Custom delay for rate limits
  if (context.error.message.includes('rate_limit')) {
    return { shouldRetry: true, delayMs: 60000 };
  }
  
  // Truncate on context length error
  if (context.error.message.includes('context_length')) {
    return {
      shouldRetry: true,
      modifiedRequest: {
        ...context.request,
        input: context.request.input.substring(0, 5000)
      }
    };
  }
  
  return {};
}
```

### handleProviderFallback

Control switching to fallback provider:

```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse {
  console.log(`Fallback: ${context.failedProvider} → ${context.fallbackProvider}`);
  
  return { shouldFallback: true };
}
```

### handleDimensionFailure

Provide fallback result when all providers fail:

```typescript
handleDimensionFailure(context: FailureContext): DimensionResult {
  if (context.dimension === 'sentiment') {
    return {
      data: { sentiment: 'neutral', score: 0.5 },
      metadata: { fallback: true }
    };
  }
  
  return {
    error: 'Analysis failed',
    metadata: { providers: context.providers }
  };
}
```

### handleProcessFailure

Recover from complete process failure:

```typescript
handleProcessFailure(context: ProcessFailureContext): ProcessResult {
  console.error('Process failed:', context.error.message);
  
  return {
    sections: context.partialResults.sections || [],
    globalResults: context.partialResults.globalResults || {},
    metadata: { failed: true, error: context.error.message }
  };
}
```

## Hook Reference

| Hook | When | Purpose |
|------|------|---------|
| `createPrompt` ✅ | Before API call | Build prompt |
| `selectProvider` ✅ | Before API call | Choose provider |
| `defineDependencies` | Process start | Define DAG |
| `shouldSkipSectionDimension` | Before section dim | Skip/cache |
| `shouldSkipGlobalDimension` | Before global dim | Skip/cache |
| `transformDependencies` | After deps resolved | Modify deps |
| `transformSections` | After global dim | Restructure |
| `finalizeResults` | After all dims | Post-process |
| `beforeProcessStart` | Process start | Initialize |
| `afterProcessComplete` | Process end | Cleanup |
| `handleProcessFailure` | Process failed | Recover |
| `beforeDimensionExecute` | Before dim | Setup |
| `afterDimensionExecute` | After dim | Cleanup |
| `beforeProviderExecute` | Before API | Modify request |
| `afterProviderExecute` | After API | Modify response |
| `handleRetry` | Failed attempt | Control retry |
| `handleProviderFallback` | Switch provider | Control fallback |
| `handleDimensionFailure` | All failed | Provide default |

---

## Next Steps

- [Quick Start](/guide/quick-start) - Build your first workflow
- [Core Concepts](/guide/core-concepts) - Understand the basics
- [Skip Logic](/guide/skip-logic) - Cost optimization
- [Examples](/guide/examples) - Real-world patterns
