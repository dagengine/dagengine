---
title: Quick Start
description: Build your first AI workflow in 5 minutes
---

# Quick Start

Build your first AI workflow in 5 minutes.

## Installation

::: code-group

```bash [npm]
npm install @ivan629/dag-ai
```

```bash [yarn]
yarn add @ivan629/dag-ai
```

```bash [pnpm]
pnpm add @ivan629/dag-ai
```

:::

---

## Basic Workflow

### Step 1: Create a Plugin

```typescript
import { Plugin } from '@ivan629/dag-ai';

class SentimentPlugin extends Plugin {
  constructor() {
    super('sentiment', 'Sentiment Analyzer', 'Analyzes sentiment');
    this.dimensions = ['sentiment'];
  }

  createPrompt(context) {
    return `Analyze sentiment: "${context.sections[0].content}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }

  selectProvider() {
    return { 
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}
```

Three required methods:
- `dimensions` - What to analyze
- `createPrompt()` - What to ask the AI
- `selectProvider()` - Which AI to use

---

### Step 2: Create Engine

```typescript
import { DagEngine } from '@ivan629/dag-ai';

const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```

---

### Step 3: Process Content

```typescript
const result = await engine.process([
  { content: 'I love this product!', metadata: {} }
]);

console.log(result.sections[0].results.sentiment.data);
// { sentiment: 'positive', score: 0.95 }
```

---

## Multiple Dimensions

Process multiple analyses in parallel:

```typescript
class ContentAnalysis extends Plugin {
  constructor() {
    super('analysis', 'Content Analysis', 'Analyzes content');
    this.dimensions = ['sentiment', 'topics'];
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
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

const result = await engine.process([
  { content: 'I love AI and machine learning!', metadata: {} }
]);

console.log(result.sections[0].results);
// {
//   sentiment: { data: { sentiment: 'positive', score: 0.9 } },
//   topics: { data: { topics: ['AI', 'machine learning'] } }
// }
```

Both dimensions run in parallel.

---

## Dependencies

Make one dimension wait for another:

```typescript
class WorkflowPlugin extends Plugin {
  constructor() {
    super('workflow', 'Workflow', 'Complete workflow');
    this.dimensions = ['sentiment', 'summary'];
  }

  defineDependencies() {
    return {
      summary: ['sentiment']  // summary waits for sentiment
    };
  }

  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'summary') {
      // Access sentiment result
      const sentiment = context.dependencies.sentiment.data.sentiment;
      return `Create a ${sentiment}-toned summary: "${context.sections[0].content}"`;
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

Execution: `sentiment` runs first → `summary` receives sentiment result.

## Global Dimensions & Section Transformations

Global dimensions process all sections together and can restructure the section array:

```typescript
class CategorizePlugin extends Plugin {
  dimensions = [
    { name: 'classify', scope: 'section' },      // Per-section (parallel)
    { name: 'group_by_category', scope: 'global' },  // All sections together
    { name: 'analyze', scope: 'section' }        // Per-category (parallel)
  ];

  defineDependencies() {
    return {
      group_by_category: ['classify'],
      analyze: ['group_by_category']
    };
  }

  createPrompt(context) {
    if (context.dimension === 'classify') {
      return `Classify this item: "${context.section.content}"
      Return JSON: {"category": "electronics|books|clothing"}`;
    }
    
    if (context.dimension === 'group_by_category') {
      const items = context.dependencies.classify.data.sections;
      return `Group these ${items.length} items by category.
      Return JSON: {"categories": [{"name": "...", "items": [...]}]}`;
    }
    
    if (context.dimension === 'analyze') {
      // Now analyzing merged categories
      return `Analyze this ${context.section.metadata.category} category:
      ${context.section.content}`;
    }
  }

  transformSections(context) {
    if (context.dimension === 'group_by_category') {
      // Transform: 100 items → 3 categories
      const categories = context.result.data.categories;
      
      return categories.map(cat => ({
        content: cat.items.join('\n'),
        metadata: { category: cat.name, count: cat.items.length }
      }));
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

// Input: 100 product reviews
const reviews = [
  { content: 'Great laptop!', metadata: {} },
  { content: 'Love this book', metadata: {} },
  // ... 98 more reviews
];

const result = await engine.process(reviews);

// Execution:
// 1. classify: 100 reviews in parallel
// 2. group_by_category: Groups into 3 categories (electronics, books, clothing)
// 3. transformSections: 100 sections → 3 merged sections
// 4. analyze: 3 categories in parallel (not 100 reviews!)
```

**Key benefit:** Process 3 categories instead of 100 individual reviews. Faster and cheaper.

## Provider Fallback

Automatically switch providers on failure:

```typescript
class FallbackPlugin extends Plugin {
  constructor() {
    super('fallback', 'Fallback', 'With fallback');
    this.dimensions = ['sentiment'];
  }

  createPrompt(context) {
    return `Analyze sentiment: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return {
      provider: 'anthropic',
      fallbacks: [
        { provider: 'openai' },
        { provider: 'gemini' }
      ]
    };
  }
}

const engine = new DagEngine({
  plugin: new FallbackPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
    gemini: { apiKey: process.env.GEMINI_API_KEY }
  }
});
```

Tries Anthropic (3 retries) → OpenAI (3 retries) → Gemini (3 retries).

## Batch Processing

Process multiple sections in parallel:

```typescript
const sections = [
  { content: 'Great product!', metadata: { id: 1 } },
  { content: 'Not bad', metadata: { id: 2 } },
  { content: 'Terrible experience', metadata: { id: 3 } }
];

const result = await engine.process(sections);

result.sections.forEach((section, i) => {
  console.log(`Section ${i + 1}:`, section.results.sentiment.data);
});
```

Default concurrency: 5. Configure with `new DagEngine({ concurrency: 20 })`.

## Cost Tracking

Track API costs in real-time:

```typescript
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  },
  pricing: {
    models: {
      'claude-sonnet-4-5-20250929': {
        inputPer1M: 3.00,
        outputPer1M: 15.00
      }
    }
  }
});

const result = await engine.process(sections);

console.log(result.costs);
// {
//   totalCost: 0.45,
//   byDimension: { sentiment: { cost: 0.45, tokens: {...} } },
//   byProvider: { anthropic: { cost: 0.45, tokens: {...} } }
// }
```

## Skip Logic

Skip processing based on conditions:

```typescript
class OptimizedPlugin extends Plugin {
  dimensions = ['sentiment'];

  shouldSkipDimension(context) {
    // Skip short content
    if (context.section.content.length < 50) return true;
    
    // Use cached result
    const cached = this.cache.get(context.section.content);
    if (cached) return { skip: true, result: cached };
    
    return false;
  }

  createPrompt(context) {
    return `Analyze sentiment: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

## Common Patterns

### Pattern 1: Dynamic Model Selection

```typescript
selectProvider(dimension, section) {
  if (section.content.length < 100) {
    return { provider: 'anthropic', options: { model: 'claude-haiku-3-5' } };
  }
  return { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } };
}
```

### Pattern 2: Timeout Configuration

```typescript
const engine = new DagEngine({
  plugin: new YourPlugin(),
  providers: { /* ... */ },
  timeout: 120000,  // Global: 120 seconds
  dimensionTimeouts: {
    'slow_dimension': 180000  // This dimension: 180 seconds
  }
});
```

### Pattern 3: Error Handling

```typescript
const result = await engine.process(sections);

result.sections.forEach(section => {
  if (section.results.sentiment.error) {
    console.error('Failed:', section.results.sentiment.error);
  } else {
    console.log('Success:', section.results.sentiment.data);
  }
});
```

## Next Steps

- [Core Concepts](/guide/core-concepts) - Understand sections, dimensions, dependencies
- [Cost Optimization](/guide/cost-optimization) - Reduce API costs
- [Lifecycle Hooks](/lifecycle/hooks) - 16 extension points
- [Examples](/guide/examples) - Real-world workflows
- [API Reference](/api/engine) - Complete documentation

## Troubleshooting

### Provider not found

```typescript
// ❌ Missing provider config
const engine = new DagEngine({
  plugin: new YourPlugin(),
  providers: {}  // Empty!
});

// ✅ Correct
const engine = new DagEngine({
  plugin: new YourPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```

### Circular dependency

```typescript
// ❌ Circular
defineDependencies() {
  return {
    A: ['B'],
    B: ['A']  // Can't depend on each other
  };
}

// ✅ Correct
defineDependencies() {
  return {
    B: ['A']  // Linear flow
  };
}
```

### API key not set

```bash
# Set environment variable
export ANTHROPIC_API_KEY=your_key_here

# Or use .env file
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

## Getting Help

- [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions) - Ask questions
- [GitHub Issues](https://github.com/ivan629/dag-ai/issues) - Report bugs
- [Examples](/guide/examples) - See working code
