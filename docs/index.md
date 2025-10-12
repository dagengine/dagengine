---
layout: home

hero:
  name: dag-ai
  text: AI Workflow Orchestration
  tagline: Build production-ready AI pipelines with intelligent dependency management, cost optimization, and zero complexity
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/ivan629/dag-ai
    - theme: alt
      text: Recipes
      link: /recipes/

features:
  - icon: 🎯
    title: Smart Dependencies
    details: Automatic topological sorting with DAG-based execution. Define dependencies once, let the engine handle execution order and parallelization.

  - icon: 💰
    title: Cost Optimization Built-in
    details: Skip dimensions dynamically with shouldSkipDimension. Track costs per dimension, provider, and model. Save 70% on API calls.

  - icon: 🔄
    title: Multiple AI Providers
    details: Native support for Anthropic Claude, OpenAI GPT, and Google Gemini. Automatic provider fallback with exponential backoff retry.

  - icon: ⚡
    title: Parallel Processing
    details: Process thousands of documents concurrently with configurable batch sizes. Intelligent grouping maximizes parallelism.

  - icon: 🛡️
    title: Production Ready
    details: Built-in timeout handling, exponential backoff, partial results on error, and comprehensive error recovery hooks.

  - icon: 📊
    title: Full Observability
    details: Track token usage, costs, execution time, and dependencies. Export workflow graphs as DOT or JSON for visualization.

  - icon: 🔗
    title: Dual Processing Modes
    details: Section-level processing for per-document analysis. Global processing for cross-document patterns and transformations.

  - icon: 🎨
    title: Section Transformations
    details: Dynamically merge, split, or reorder document sections mid-pipeline based on AI analysis results.

  - icon: 🪝
    title: 19 Lifecycle Hooks
    details: Fine-grained control at every stage - from process start to provider execution. Transform data at any point in the pipeline.
---

## Why dag-ai?

### 🚫 Before dag-ai

```typescript
// Manual orchestration nightmare 😫
const sentiment = await anthropic.analyze(text);

// Handle errors manually
if (sentiment.error) {
  // Retry? Fallback? What about costs?
}

// Manual dependency management
const topics = await openai.extract(text);

if (sentiment.score > 0.5) {
  const summary = await gemini.summarize(text);
}

// No cost tracking, no parallel processing, no automatic retries
```

**Problems:**
- ❌ Manual error handling everywhere
- ❌ No cost visibility
- ❌ Hard to maintain
- ❌ Sequential = slow
- ❌ Provider failures = complete failure

---

### ✅ With dag-ai

```typescript
// Clean, declarative, automatic ✨
class ContentAnalysis extends Plugin {
  dimensions = ['sentiment', 'topics', 'summary'];
  
  defineDependencies() {
    return { summary: ['sentiment'] };  // Auto execution order
  }
  
  createPrompt(context) {
    return `Analyze ${context.dimension}: ${context.sections[0].content}`;
  }
  
  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' },
      fallbacks: [
        { provider: 'openai', options: { model: 'gpt-4o' } }
      ]
    };
  }
}

const result = await engine.process(sections);
// ✅ Automatic: retries, fallback, cost tracking, parallel execution
```

**Benefits:**
- ✅ Automatic error handling & retries
- ✅ Built-in cost tracking
- ✅ Clean, maintainable code
- ✅ Parallel processing by default
- ✅ Provider fallbacks included
- ✅ **70% fewer lines of code**

---

## 🚀 Quick Example

```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

// Step 1: Define your workflow
class SentimentAnalysis extends Plugin {
  constructor() {
    super('sentiment', 'Sentiment Analyzer', 'Analyzes text sentiment');
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

// Step 2: Create engine
const engine = new DagEngine({
  plugin: new SentimentAnalysis(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

// Step 3: Process content
const result = await engine.process([
  { content: 'I love this product!', metadata: {} }
]);

console.log(result.sections[0].results.sentiment.data);
// Output: { sentiment: 'positive', score: 0.95 }
```

---

## 💡 Key Features

### 1. Smart Dependencies

```typescript
defineDependencies() {
  return {
    sentiment: [],                    // Runs first
    topics: [],                       // Runs first (parallel with sentiment)
    summary: ['sentiment', 'topics'], // Waits for both
    report: ['summary']               // Waits for summary
  };
}
```

**Automatic execution order:**

```
┌─────────────┐  ┌─────────────┐
│  sentiment  │  │   topics    │  ← Run in parallel
└──────┬──────┘  └──────┬──────┘
       └────────┬────────┘
                ↓
          ┌──────────┐
          │  summary │  ← Waits for both
          └─────┬────┘
                ↓
          ┌──────────┐
          │  report  │  ← Waits for summary
          └──────────┘
```

---

### 2. Cost Optimization

```typescript
shouldSkipDimension(context) {
  if (context.dimension === 'expensive_analysis') {
    const quality = context.dependencies?.quick_check?.data?.quality;
    return quality < 7;  // Skip if quality < 7
  }
  return false;
}
```

**Result:**

```
1000 documents processed:
- Without routing: $2.50 (5000 API calls)
- With routing:    $0.75 (1500 API calls)
- Savings:         70% 🎉
```

---

### 3. Provider Fallback

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

**Automatic failover:**

```
Try Anthropic → Fails? → Try OpenAI → Fails? → Try Gemini
```

---

### 4. Built-in Cost Tracking

```typescript
const result = await engine.process(sections);

console.log(result.costs);
```

**Output:**

```json
{
  "totalCost": 0.75,
  "totalTokens": 15000,
  "currency": "USD",
  "byDimension": {
    "sentiment": { 
      "cost": 0.25, 
      "tokens": {...}, 
      "model": "claude-sonnet-4-5-20250929" 
    },
    "topics": { "cost": 0.30, "tokens": {...} },
    "summary": { "cost": 0.20, "tokens": {...} }
  },
  "byProvider": {
    "anthropic": { 
      "cost": 0.65, 
      "tokens": {...}, 
      "models": ["claude-sonnet-4-5-20250929"] 
    },
    "openai": { "cost": 0.10, "tokens": {...} }
  }
}
```

---

### 5. Graph Analytics

```typescript
const analytics = await engine.getGraphAnalytics();

console.log(analytics);
```

**Output:**

```json
{
  "totalDimensions": 5,
  "totalDependencies": 6,
  "maxDepth": 3,
  "criticalPath": ["sentiment", "topics", "summary", "report"],
  "parallelGroups": [["sentiment", "topics"]],
  "independentDimensions": ["sentiment", "topics"],
  "bottlenecks": ["summary"]
}
```

**Export to DOT:**

```typescript
const dot = await engine.exportGraphDOT();
// Visualize in Graphviz!
```

---

## 📊 Comparison

| Feature | Manual | Other Libraries | dag-ai |
|---------|--------|----------------|--------|
| **Setup Time** | Days | Hours | **Minutes** |
| **Error Handling** | Manual | Basic | **Advanced (19 hooks)** |
| **Provider Fallback** | Manual | ❌ | **✅ Automatic** |
| **Cost Tracking** | Manual | ❌ | **✅ Built-in** |
| **Dependencies** | Manual | Basic | **✅ DAG-based** |
| **Dynamic Routing** | Manual | ❌ | **✅ shouldSkip** |
| **Section Transform** | Impossible | ❌ | **✅ Unique** |
| **Parallel Processing** | Manual | Basic | **✅ Optimized** |
| **Type Safety** | JSDoc | Partial | **✅ Full TypeScript** |

---

## 🎓 Learn by Doing

### 🟢 Beginner (5 minutes)

1. [Introduction](/guide/introduction) - What is dag-ai?
2. [Quick Start](/guide/quick-start) - Your first pipeline
3. [Core Concepts](/guide/core-concepts) - Understand the basics

### 🟡 Intermediate (30 minutes)

1. [Dependencies Guide](/guide/dependencies) - Chain dimensions
2. [Cost Optimization](/guide/cost-optimization) - Save money
3. [Error Handling](/guide/error-handling) - Handle failures

### 🔴 Advanced (1 hour)

1. [Section Transformations](/advanced/section-transforms) - Restructure docs
2. [Lifecycle Hooks](/guide/hooks) - Fine-grained control (19 hooks)
3. [Custom Providers](/advanced/custom-providers) - Build your own

---

## 🌟 Real-World Use Cases

| Use Case | Dimensions | Benefit |
|----------|-----------|---------|
| **Content Moderation** | `toxicity`, `spam`, `inappropriate` | Flag problematic content automatically |
| **Document Analysis** | `entities`, `topics`, `sentiment`, `summary` | Extract insights from documents |
| **Cost Optimization** | Skip short content via `shouldSkipDimension` | Save 70% on API costs |
| **Multi-Language** | `detect_language`, `translate`, `analyze` | Automatic language detection & translation |
| **Complex Workflows** | Chain analyses with dependencies | Build sophisticated pipelines |
| **Batch Processing** | Process 1000+ documents with `concurrency: 20` | High-throughput processing |

---

## 📦 Installation

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

## 🚀 Ready to Start?

::: info Quick Links
- 📖 [Read the Guide](/guide/introduction)
- 🍳 [Browse Recipes](/recipes/)
- 📚 [API Reference](/api/dag-engine)
- 💬 [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions)
- 🐛 [Report Issues](https://github.com/ivan629/dag-ai/issues)
  :::

---

## 🌟 Community

- **GitHub**: [ivan629/dag-ai](https://github.com/ivan629/dag-ai)
- **npm**: [@ivan629/dag-ai](https://www.npmjs.com/package/@ivan629/dag-ai)
- **License**: MIT
