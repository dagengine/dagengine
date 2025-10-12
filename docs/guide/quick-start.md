# Quick Start

Get your first AI workflow running in **5 minutes**.

---

## Installation
```bash
npm install @ivan629/dag-ai
```

---

## Your First Workflow

Let's build a simple sentiment analyzer.

### Step 1: Create a Plugin
```typescript
import { Plugin } from '@ivan629/dag-ai';

class SentimentPlugin extends Plugin {
  constructor() {
    super('sentiment', 'Sentiment Analyzer', 'Analyzes sentiment');
    this.dimensions = ['sentiment'];
  }

  createPrompt(context) {
    return `Analyze the sentiment of this text: "${context.sections[0].content}"
    
    Return JSON:
    {
      "sentiment": "positive" | "negative" | "neutral",
      "score": 0.0 to 1.0
    }`;
  }

  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}
```

**That's it!** Just 3 methods:
1. ✅ `constructor` - Define dimensions
2. ✅ `createPrompt` - What to ask the AI
3. ✅ `selectProvider` - Which AI to use

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
  { 
    content: 'I love this product! Best purchase ever!', 
    metadata: {} 
  }
]);

console.log(result.sections[0].results.sentiment);
```

**Output:**
```json
{
  "data": {
    "sentiment": "positive",
    "score": 0.95
  },
  "metadata": {
    "model": "claude-sonnet-4-5-20250929",
    "provider": "anthropic",
    "tokens": {
      "inputTokens": 45,
      "outputTokens": 12,
      "totalTokens": 57
    }
  }
}
```

---

## Complete Example
```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

// 1. Define your plugin
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
    return { provider: 'anthropic', options: {} };
  }
}

// 2. Create engine
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

// 3. Process content
const result = await engine.process([
  { content: 'I love this!', metadata: {} },
  { content: 'This is terrible', metadata: {} },
  { content: 'It is okay', metadata: {} }
]);

// 4. Get results
result.sections.forEach((section, i) => {
  const { sentiment, score } = section.results.sentiment.data;
  console.log(`Text ${i + 1}: ${sentiment} (${score})`);
});
```

**Output:**
```
Text 1: positive (0.95)
Text 2: negative (0.92)
Text 3: neutral (0.65)
```

---

## Add Multiple Dimensions

Let's analyze sentiment **and** extract topics.
```typescript
class ContentAnalysis extends Plugin {
  constructor() {
    super('analysis', 'Content Analysis', 'Analyzes content');
    this.dimensions = ['sentiment', 'topics'];  // ← Two dimensions
  }

  createPrompt(context) {
    const prompts = {
      sentiment: `Analyze sentiment: "${context.sections[0].content}"
        Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`,
      
      topics: `Extract topics: "${context.sections[0].content}"
        Return JSON: {"topics": ["topic1", "topic2"]}`
    };
    
    return prompts[context.dimension];
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

**Now each section gets both analyses:**
```typescript
const result = await engine.process([
  { content: 'I love AI and machine learning!', metadata: {} }
]);

console.log(result.sections[0].results);
```

**Output:**
```json
{
  "sentiment": {
    "data": { "sentiment": "positive", "score": 0.9 }
  },
  "topics": {
    "data": { "topics": ["AI", "machine learning"] }
  }
}
```

---

## Add Dependencies

Let's create a summary that depends on sentiment.
```typescript
class WorkflowPlugin extends Plugin {
  constructor() {
    super('workflow', 'Workflow', 'Complete workflow');
    this.dimensions = ['sentiment', 'summary'];
  }

  defineDependencies() {
    return {
      summary: ['sentiment']  // ← Summary waits for sentiment
    };
  }

  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"
        Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment.data.sentiment;
      return `Create a ${sentiment} summary of: "${context.sections[0].content}"`;
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

**Execution order:**
1. ✅ `sentiment` runs first
2. ✅ `summary` waits for sentiment
3. ✅ Summary uses sentiment result

---

## Add Multiple Providers

Use different AI providers for different tasks.
```typescript
class MultiProviderPlugin extends Plugin {
  constructor() {
    super('multi', 'Multi Provider', 'Uses multiple AIs');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }

  createPrompt(context) {
    return `Analyze ${context.dimension}: "${context.sections[0].content}"`;
  }

  selectProvider(dimension) {
    // Use different providers for different tasks
    const providers = {
      sentiment: { provider: 'anthropic' },
      topics: { provider: 'openai' },
      summary: { provider: 'gemini' }
    };
    
    return providers[dimension];
  }
}

// Configure all providers
const engine = new DagEngine({
  plugin: new MultiProviderPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
    gemini: { apiKey: process.env.GEMINI_API_KEY }
  }
});
```

---

## Add Fallbacks

Automatically switch providers if one fails.
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
      provider: 'anthropic',  // Try this first
      fallbacks: [
        { provider: 'openai' },   // Then try this
        { provider: 'gemini' }    // Then try this
      ]
    };
  }
}
```

**What happens:**
1. ✅ Try Anthropic (3 retries)
2. ✅ If fails → Try OpenAI (3 retries)
3. ✅ If fails → Try Gemini (3 retries)
4. ❌ If all fail → Error

---

## Process Multiple Documents

Process many documents in parallel.
```typescript
const documents = [
  { content: 'Document 1', metadata: { id: 1 } },
  { content: 'Document 2', metadata: { id: 2 } },
  { content: 'Document 3', metadata: { id: 3 } }
  // ... 1000 more documents
];

const result = await engine.process(documents);

// Each document gets its own results
result.sections.forEach((section, i) => {
  console.log(`Document ${i + 1}:`, section.results.sentiment.data);
});
```

**Performance:**
- Default: Processes 5 documents at once
- Configurable: `new DagEngine({ concurrency: 20 })`

---

## Track Costs

See how much your workflow costs.
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

const result = await engine.process(documents);

console.log(result.costs);
```

**Output:**
```json
{
  "totalCost": 0.45,
  "totalTokens": 12500,
  "currency": "USD",
  "byDimension": {
    "sentiment": {
      "cost": 0.45,
      "tokens": { "inputTokens": 8000, "outputTokens": 4500 }
    }
  }
}
```

---

## Next Steps

You now know the basics! Learn more:

- **[Core Concepts](/guide/core-concepts/sections)** - Understand sections, dimensions, dependencies
- **[Cost Optimization](/guides/cost-optimization)** - Save money with smart routing
- **[Examples](/examples/)** - See real-world use cases
- **[API Reference](/api/dag-engine)** - Complete API documentation

---

## Common Patterns

### Pattern 1: Skip Short Content
```typescript
shouldSkipDimension(context) {
  // Skip expensive analysis for short content
  return context.section.content.length < 50;
}
```

### Pattern 2: Cache Results
```typescript
const cache = new Map();

shouldSkipDimension(context) {
  const cached = cache.get(context.section.content);
  if (cached) {
    return { skip: true, result: cached };
  }
  return false;
}
```

### Pattern 3: Different Models
```typescript
selectProvider(dimension, section) {
  // Use cheaper model for short content
  if (section.content.length < 100) {
    return { provider: 'anthropic', options: { model: 'claude-haiku-3-5' } };
  }
  
  // Use better model for long content
  return { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } };
}
```

---

## Troubleshooting

### "Provider not found"

Make sure you configured the provider:
```typescript
const engine = new DagEngine({
  plugin: new YourPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }  // ← Add this
  }
});
```

### "Circular dependency"

Check your dependencies don't form a loop:
```typescript
// ❌ BAD - circular
defineDependencies() {
  return {
    A: ['B'],
    B: ['A']  // ← Can't depend on each other
  };
}

// ✅ GOOD - linear
defineDependencies() {
  return {
    B: ['A']  // B waits for A
  };
}
```

### "Timeout"

Increase timeout for slow dimensions:
```typescript
const engine = new DagEngine({
  plugin: new YourPlugin(),
  providers: { /* ... */ },
  timeout: 120000,  // 120 seconds (default: 60)
  dimensionTimeouts: {
    'slow_dimension': 180000  // 180 seconds for this one
  }
});
```

---

## Getting Help

- 📚 [Full Documentation](/guide/what-is-dag-ai)
- 💬 [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions)
- 🐛 [Report Issues](https://github.com/ivan629/dag-ai/issues)
- 💻 [Examples](https://github.com/ivan629/dag-ai/tree/main/examples)