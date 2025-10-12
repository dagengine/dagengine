# What is dag-ai?

**dag-ai** is a TypeScript library for orchestrating AI workflows with intelligent dependency management, automatic error handling, and built-in cost optimization.

## The Problem

When building AI applications, you often need to:
- Analyze content in multiple ways (sentiment, topics, entities, etc.)
- Chain analyses together (summary depends on sentiment)
- Handle provider failures gracefully
- Track costs across different AI models
- Process thousands of documents efficiently

**Doing this manually is painful:**
```typescript
// The manual way 😫
const sentiment = await anthropic.analyze(text);

if (sentiment.error) {
  // Retry logic? How many times? Exponential backoff?
  // Try different provider? What if that fails too?
}

const topics = await openai.extract(text);

// Manual dependency management
if (sentiment.score > 0.5) {
  const summary = await gemini.summarize(text);
}

// What about:
// - Cost tracking across providers?
// - Parallel processing for 1000+ documents?
// - Timeout handling?
// - Provider fallbacks?
// - Dependency resolution?
```

**Problems:**
- ❌ 100+ lines of boilerplate per workflow
- ❌ Error-prone manual dependency management
- ❌ No cost visibility
- ❌ Hard to test and maintain
- ❌ Slow sequential processing

---

## The Solution

**dag-ai handles all of this automatically:**
```typescript
// The dag-ai way ✨
class ContentAnalysis extends Plugin {
  dimensions = ['sentiment', 'topics', 'summary'];
  
  defineDependencies() {
    return { summary: ['sentiment'] };  // Automatic execution order
  }
  
  createPrompt(context) {
    return `Analyze ${context.dimension}: ${context.sections[0].content}`;
  }
  
  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' },
      fallbacks: [{ provider: 'openai', options: { model: 'gpt-4o' } }]
    };
  }
}

const engine = new DagEngine({
  plugin: new ContentAnalysis(),
  providers: { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } }
});

const result = await engine.process(sections);
// ✅ Automatic: retries, fallback, cost tracking, parallel execution, dependency resolution
```

**Result: 15 lines vs 150+ lines, with better reliability and performance.**

---

## Key Concepts

### 1. Sections

**Sections** are the units of content you want to analyze.
```typescript
const sections: SectionData[] = [
  { 
    content: 'Your text here', 
    metadata: { author: 'John', date: '2025-01-01' } 
  },
  { 
    content: 'Another document', 
    metadata: { author: 'Jane', date: '2025-01-02' } 
  }
];
```

**Each section gets processed independently** (by default) or **together** (global mode).

---

### 2. Dimensions

**Dimensions** are the analysis tasks you want to perform.
```typescript
this.dimensions = [
  'sentiment',  // Analyze emotional tone
  'topics',     // Extract main topics
  'summary',    // Create summary
  'entities'    // Find people, places, things
];
```

**Each dimension = one AI call** (unless skipped via routing).

---

### 3. Dependencies

**Dependencies** define which dimensions depend on others.
```typescript
defineDependencies() {
  return {
    sentiment: [],                    // No dependencies (runs first)
    topics: [],                       // No dependencies (runs first)
    summary: ['sentiment', 'topics'], // Waits for both
    report: ['summary']               // Waits for summary
  };
}
```

dag-ai automatically:
- ✅ Sorts dimensions in the correct execution order
- ✅ Detects circular dependencies
- ✅ Maximizes parallel execution
- ✅ Resolves dependency data for each dimension

**Execution flow:**
```
sentiment + topics (parallel) → summary → report
```

---

### 4. Providers

**Providers** are the AI services you use.
```typescript
selectProvider() {
  return {
    provider: 'anthropic',  // Primary provider
    options: { model: 'claude-sonnet-4-5-20250929' },
    fallbacks: [            // Automatic fallback if primary fails
      { provider: 'openai', options: { model: 'gpt-4o' } }
    ]
  };
}
```

**Supported providers:**
- ✅ **Anthropic** (Claude Sonnet, Opus, Haiku)
- ✅ **OpenAI** (GPT-4o, GPT-4o-mini, GPT-3.5)
- ✅ **Gemini** (Gemini 1.5 Pro, Gemini 1.5 Flash)
- ✅ **Tavily** (Web search)
- ✅ **WhoisXML** (Domain information)
- ✅ **Custom providers** (extend `BaseProvider`)

---

## Architecture
```
┌─────────────────────────────────────────┐
│              DagEngine                  │
│  • Dependency resolution (DAG)          │
│  • Parallel execution (p-queue)         │
│  • Error handling & retry (p-retry)     │
│  • Cost tracking                        │
│  • Graph analytics                      │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
   ┌────▼────┐          ┌────▼────┐
   │ Plugin  │          │Provider │
   │ System  │          │ Adapter │
   └─────────┘          └─────────┘
        │                    │
   ┌────▼────┐          ┌────▼────┐
   │ 16 Hooks│          │Registry │
   └─────────┘          └─────────┘
```

**Core components:**
- **DagEngine** - Orchestrates execution using DAG-based topological sorting
- **Plugin** - Abstract base class defining your workflow
- **ProviderAdapter** - Manages multiple AI providers with unified interface
- **ProviderRegistry** - Registers and retrieves provider instances

---

## What Makes dag-ai Special?

### 1. Dual Processing Modes

**Section Mode** - Process each section independently:
```typescript
dimensions = ['sentiment', 'topics'];
// Each section analyzed separately
// Perfect for: Per-document analysis
```

**Global Mode** - Analyze all sections together:
```typescript
dimensions = [
  { name: 'themes', scope: 'global' }
];
// Find patterns across all sections
// Perfect for: Cross-document analysis
```

---

### 2. Smart Dependencies (DAG-based)

Automatic execution order using topological sorting:
```typescript
defineDependencies() {
  return {
    sentiment: [],
    topics: [],
    summary: ['sentiment', 'topics'],  // Waits automatically
    report: ['summary']
  };
}
```

**What you get:**
- ✅ Automatic topological sorting
- ✅ Circular dependency detection
- ✅ Parallel execution where possible
- ✅ Optimal execution order

**Execution visualization:**
```
Level 0: [sentiment, topics]       ← Parallel
Level 1: [summary]                 ← Waits for both
Level 2: [report]                  ← Waits for summary
```

---

### 3. Cost Optimization

Skip dimensions dynamically based on content:
```typescript
shouldSkipDimension(context) {
  // Skip expensive analysis for short content
  if (context.dimension === 'deep_analysis') {
    return context.section.content.length < 100;
  }
  
  // Skip based on previous results
  if (context.dimension === 'expert_review') {
    const quality = context.dependencies?.quick_check?.data?.quality;
    return quality < 7;  // Only analyze high-quality content
  }
  
  return false;
}
```

**Result: Save 70% on API costs** by intelligently skipping unnecessary analysis.

---

### 4. Provider Fallback

Automatic failover with exponential backoff:
```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    fallbacks: [
      { provider: 'openai', retryAfter: 1000 },
      { provider: 'gemini', retryAfter: 2000 }
    ]
  };
}
```

**What happens:**
1. Try Anthropic (max 3 retries with exponential backoff)
2. If all retries fail → Try OpenAI (max 3 retries)
3. If all retries fail → Try Gemini (max 3 retries)
4. If all fail → Error (or use `handleDimensionFailure` hook for fallback result)

**You never lose data due to provider outages.**

---

### 5. Section Transformations

Dynamically restructure documents mid-pipeline:
```typescript
dimensions = [
  { 
    name: 'clustering', 
    scope: 'global',
    transform: (result, sections) => {
      // AI analyzes sections and suggests merging similar ones
      return [
        { content: 'Merged Section 1+2', metadata: {} },
        sections[2]  // Keep Section 3 unchanged
      ];
    }
  }
];
```

**Before:** `[Section 1] [Section 2] [Section 3]` (3 sections)  
**After:** `[Merged 1+2] [Section 3]` (2 sections, intelligently merged!)

---

### 6. 16 Lifecycle Hooks

Fine-grained control at every stage:
```typescript
class AdvancedPlugin extends Plugin {
  // Process-level hooks
  async beforeProcessStart(context) { /* Setup */ }
  async afterProcessComplete(context) { /* Cleanup */ }
  async handleProcessFailure(context) { /* Recovery */ }
  
  // Dimension-level hooks
  async beforeDimensionExecute(context) { /* Prepare */ }
  async afterDimensionExecute(context) { /* Validate */ }
  async shouldSkipDimension(context) { /* Route */ }
  async shouldSkipGlobalDimension(context) { /* Route global */ }
  
  // Provider-level hooks
  async beforeProviderExecute(context) { /* Modify request */ }
  async afterProviderExecute(context) { /* Validate response */ }
  
  // Error handling hooks
  async handleRetry(context) { /* Custom retry logic */ }
  async handleProviderFallback(context) { /* Fallback control */ }
  async handleDimensionFailure(context) { /* Fallback result */ }
  
  // Data transformation hooks
  async transformDependencies(context) { /* Modify deps */ }
  async transformSections(context) { /* Restructure docs */ }
  async finalizeResults(context) { /* Post-process */ }
  
  // Required methods
  async defineDependencies(context) { /* Dynamic deps */ }
}
```

---

### 7. Built-in Observability

**Cost Tracking:**
```typescript
result.costs
// {
//   totalCost: 0.75,
//   byDimension: { sentiment: { cost: 0.25, ... } },
//   byProvider: { anthropic: { cost: 0.65, ... } }
// }
```

**Graph Analytics:**
```typescript
const analytics = await engine.getGraphAnalytics();
// {
//   criticalPath: ['sentiment', 'summary', 'report'],
//   parallelGroups: [['sentiment', 'topics']],
//   bottlenecks: ['summary']
// }
```

**Export Workflow:**
```typescript
const dot = await engine.exportGraphDOT();
// Visualize your workflow in Graphviz

const json = await engine.exportGraphJSON();
// Use in D3.js or other visualization tools
```

---

## Use Cases

✅ **Content Moderation** - Flag toxic, spam, inappropriate content  
✅ **Document Analysis** - Extract entities, topics, sentiment, summaries  
✅ **Cost Optimization** - Skip short content, cache results, use cheaper models  
✅ **Batch Processing** - Process thousands of documents in parallel  
✅ **Multi-Language** - Detect language, translate, analyze  
✅ **Complex Workflows** - Chain multiple analyses with dependencies  
✅ **Quality Control** - Run expensive checks only on high-quality content  
✅ **Data Enrichment** - Add metadata, classifications, insights to documents

---

## How It Works

**1. Define your plugin:**
```typescript
class MyPlugin extends Plugin {
  dimensions = ['dimension1', 'dimension2'];
  
  defineDependencies() {
    return { dimension2: ['dimension1'] };
  }
  
  createPrompt(context) { /* ... */ }
  selectProvider() { /* ... */ }
}
```

**2. Create engine:**
```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: { anthropic: { apiKey: '...' } }
});
```

**3. Process content:**
```typescript
const result = await engine.process(sections);
```

**4. Get results:**
```typescript
result.sections.forEach(section => {
  console.log(section.results.dimension1);
  console.log(section.results.dimension2);
});
```

---

## Performance Characteristics

**Concurrency:**
- Section dimensions: Process N sections in parallel (configurable via `concurrency`)
- Global dimensions: Execute all independent globals in parallel
- Automatic batching to prevent rate limits

**Memory:**
- Efficient: Process sections in batches
- Cached: Global results computed once and reused
- Scalable: Handle 10,000+ documents

**Cost:**
- Typical: 70% fewer API calls with smart routing
- Example: 1000 documents, 5 dimensions = 5000 calls → 1500 calls with routing

---

## Next Steps

Ready to get started?

- [Why dag-ai?](/guide/why-dag-ai) - Understand the benefits
- [Quick Start](/guide/quick-start) - Build your first pipeline in 5 minutes
- [Core Concepts](/guide/sections) - Deep dive into sections, dimensions, and more

::: tip Questions?
Join our [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions) or check out the [examples](/examples/).
:::