---
title: Plugin
description: API reference for Plugin base class
---

# Plugin

Base class for defining custom workflows.

## Import

```typescript
import { Plugin } from '@ivan629/dag-ai';
```

## Constructor

```typescript
constructor(
  id: string,
  name: string,
  description: string,
  config?: PluginConfig
)
```

### Example

```typescript
class SentimentPlugin extends Plugin {
  constructor() {
    super(
      'sentiment-analyzer',
      'Sentiment Analyzer',
      'Analyzes text sentiment'
    );
    
    this.dimensions = ['sentiment'];
  }
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

## Properties

### dimensions (required)

Define analysis tasks:

```typescript
// Simple
this.dimensions = ['sentiment', 'topics', 'summary'];

// Detailed
this.dimensions = [
  { name: 'sentiment', scope: 'section' },
  { name: 'categorize', scope: 'global' },
  'topics'  // Defaults to section
];
```

## Required Methods

### createPrompt()

Build AI prompt for each dimension:

```typescript
createPrompt(context: PromptContext): string | Promise<string>
```

#### Example

```typescript
createPrompt(context) {
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

### selectProvider()

Choose AI provider:

```typescript
selectProvider(
  dimension: string,
  section?: SectionData
): ProviderSelection | Promise<ProviderSelection>
```

#### Basic Example

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }
  };
}
```

#### With Fallbacks

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },
    fallbacks: [
      { provider: 'openai', options: { model: 'gpt-4o' } },
      { provider: 'gemini', options: { model: 'gemini-1.5-pro' } }
    ]
  };
}
```

#### Content-Based

```typescript
selectProvider(dimension, section) {
  if (section && section.content.length < 1000) {
    return { provider: 'gemini', options: { model: 'gemini-2.5-flash' } };
  }
  return { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } };
}
```

## Optional Methods

### Control Flow

#### defineDependencies()

Define execution order:

```typescript
defineDependencies(): Record<string, string[]> {
  return {
    sentiment: [],
    topics: [],
    summary: ['sentiment', 'topics']
  };
}
```

#### shouldSkipSectionDimension()

Skip section dimensions:

```typescript
shouldSkipSectionDimension(context): boolean {
  if (context.section.content.length < 50) return true;
  
  if (context.dimension === 'deep_analysis') {
    const quality = context.dependencies.filter?.data?.quality;
    if (quality < 7) return true;
  }
  
  return false;
}
```

Return cached result:

```typescript
shouldSkipSectionDimension(context): boolean | { skip: true; result: DimensionResult } {
  const cached = this.cache.get(context.section.content);
  if (cached) {
    return { skip: true, result: cached };
  }
  return false;
}
```

---

#### shouldSkipGlobalDimension()

Skip global dimensions:

```typescript
shouldSkipGlobalDimension(context): boolean {
  if (context.sections.length < 3) return true;
  return false;
}
```

### Data Transformation

#### transformDependencies()

Modify dependencies before use:

```typescript
transformDependencies(context): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  if (deps.sentiment?.data) {
    deps.sentimentScore = { data: deps.sentiment.data.score };
  }
  
  return deps;
}
```

#### transformSections()

Restructure sections (global dimensions only):

```typescript
transformSections(context): SectionData[] {
  if (context.dimension !== 'categorize') {
    return context.currentSections;
  }
  
  const categories = context.result.data.categories;
  
  return categories.map(cat => ({
    content: cat.items.join('\n'),
    metadata: { category: cat.name, count: cat.items.length }
  }));
}
```

#### finalizeResults()

Post-process all results:

```typescript
finalizeResults(context): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  results._summary = {
    data: {
      totalDimensions: Object.keys(results).length,
      duration: context.duration
    }
  };
  
  return results;
}
```

### Lifecycle

#### beforeProcessStart()

Initialize workflow:

```typescript
beforeProcessStart(context): ProcessStartResult {
  if (context.sections.length === 0) {
    throw new Error('No sections provided');
  }
  return { sections: context.sections };
}
```

#### afterProcessComplete()

Cleanup and logging:

```typescript
async afterProcessComplete(context): Promise<ProcessResult> {
  console.log(`Completed in ${context.duration}ms`);
  return context.result;
}
```

#### beforeDimensionExecute()

Setup before dimension:

```typescript
beforeDimensionExecute(context): void {
  console.log(`Starting: ${context.dimension}`);
}
```

#### afterDimensionExecute()

Cleanup after dimension:

```typescript
async afterDimensionExecute(context): Promise<void> {
  if (!context.result.error) {
    const key = this.hash(context.sections[0].content);
    await this.cache.set(key, context.result);
  }
}
```

#### beforeProviderExecute()

Modify request:

```typescript
beforeProviderExecute(context): ProviderRequest {
  const request = { ...context.request };
  
  if (context.provider === 'gemini') {
    request.input += '\n\nReturn valid JSON only.';
  }
  
  return request;
}
```

#### afterProviderExecute()

Modify response:

```typescript
afterProviderExecute(context): ProviderResponse {
  const response = { ...context.result };
  
  if (!response.data?.score) {
    response.data.score = 0.5;
  }
  
  return response;
}
```

### Error Handling

#### handleRetry()

Control retry behavior:

```typescript
handleRetry(context): RetryResponse {
  if (context.error.message.includes('rate_limit')) {
    return { shouldRetry: true, delayMs: 60000 };
  }
  
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

#### handleProviderFallback()

Control provider switching:

```typescript
handleProviderFallback(context): FallbackResponse {
  console.log(`Fallback: ${context.failedProvider} → ${context.fallbackProvider}`);
  return { shouldFallback: true };
}
```

#### handleDimensionFailure()

Provide fallback result:

```typescript
handleDimensionFailure(context): DimensionResult {
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

#### handleProcessFailure()

Recover from process failure:

```typescript
handleProcessFailure(context): ProcessResult {
  console.error('Process failed:', context.error.message);
  
  return {
    sections: context.partialResults.sections || [],
    globalResults: context.partialResults.globalResults || {},
    metadata: { failed: true, error: context.error.message }
  };
}
```

## Complete Example

```typescript
import { Plugin } from '@ivan629/dag-ai';

class ContentAnalysis extends Plugin {
  cache = new Map();

  constructor() {
    super('content-analysis', 'Content Analysis', 'Analyzes content');
    
    this.dimensions = [
      'sentiment',
      'topics',
      { name: 'categorize', scope: 'global' },
      'summary'
    ];
  }

  defineDependencies() {
    return {
      summary: ['sentiment', 'topics']
    };
  }

  shouldSkipSectionDimension(context) {
    if (context.section.content.length < 50) return true;
    
    const cached = this.cache.get(context.section.content);
    if (cached) return { skip: true, result: cached };
    
    return false;
  }

  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract topics: "${context.sections[0].content}"
      Return JSON: {"topics": ["topic1", "topic2"]}`;
    }
    
    if (context.dimension === 'categorize' && context.isGlobal) {
      const allContent = context.sections.map((s, i) => `[${i}] ${s.content}`).join('\n\n');
      return `Categorize into tech/news/other: ${allContent}
      Return JSON: {"tech": [indices], "news": [indices], "other": [indices]}`;
    }
    
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment?.data;
      const topics = context.dependencies.topics?.data;
      return `Create ${sentiment.sentiment} summary about ${topics.topics.join(', ')}:
      "${context.sections[0].content}"`;
    }
    
    return '';
  }

  selectProvider(dimension) {
    if (dimension === 'sentiment' || dimension === 'topics') {
      return {
        provider: 'gemini',
        options: { model: 'gemini-2.5-flash' },
        fallbacks: [{ provider: 'anthropic' }]
      };
    }
    
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' },
      fallbacks: [{ provider: 'openai' }]
    };
  }

  transformSections(context) {
    if (context.dimension !== 'categorize') {
      return context.currentSections;
    }
    
    const categories = context.result.data;
    const newSections = [];
    
    for (const [category, indices] of Object.entries(categories)) {
      const items = indices.map(i => context.currentSections[i]);
      newSections.push({
        content: items.map(s => s.content).join('\n---\n'),
        metadata: { category, count: items.length }
      });
    }
    
    return newSections;
  }

  afterDimensionExecute(context) {
    if (!context.result.error && !context.isGlobal) {
      this.cache.set(context.sections[0].content, context.result);
    }
  }

  handleRetry(context) {
    if (context.error.message.includes('rate_limit')) {
      return { shouldRetry: true, delayMs: 60000 };
    }
    return {};
  }

  handleDimensionFailure(context) {
    if (context.dimension === 'sentiment') {
      return {
        data: { sentiment: 'neutral', score: 0.5 },
        metadata: { fallback: true }
      };
    }
    return { error: 'Failed', metadata: { providers: context.providers } };
  }
}
```

## Next Steps

- [DagEngine API](/api/engine) - Engine reference
- [Quick Start](/guide/quick-start) - Build your first plugin
- [Hooks](/lifecycle/hooks) - All lifecycle hooks
- [Examples](/guide/examples) - Real-world plugins
