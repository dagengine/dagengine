---
layout: home

hero:
  name: dagengine
  text: AI Workflow Orchestration
  tagline: Production-ready AI pipelines with intelligent dependency management and zero complexity
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/dagengine/dagengine

features:
  - icon: 🚀
    title: Zero Infrastructure
    details: Define dependencies, get automatic parallelization. No queues, workers, or orchestration logic required.

  - icon: 💰
    title: Cost Optimized
    details: Skip unnecessary processing. Route to optimal models. Track costs per dimension in real-time.

  - icon: 🔄
    title: Production Ready
    details: Automatic retry with exponential backoff. Provider fallback chains. Graceful error recovery.

  - icon: 🎯
    title: Flexible Processing
    details: Section dimensions analyze items independently. Global dimensions aggregate across all items.

  - icon: 🎨
    title: Dynamic Transformations
    details: Group, filter, or merge sections mid-pipeline. Reshape data at the optimal moment.

  - icon: 🪝
    title: Deep Integration
    details: 18 lifecycle hooks with full async support. Integrate databases, caches, and external APIs.
---

## Build AI Workflows in Minutes
````typescript
import { DagEngine, Plugin } from '@dagengine/dag-engine';

class ReviewAnalyzer extends Plugin {
  constructor() {
    super('review-analyzer', 'Review Analyzer', 'Analyze feedback');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }

  defineDependencies() {
    return { summary: ['sentiment', 'topics'] };
  }

  createPrompt(ctx) {
    if (ctx.dimension === 'sentiment') {
      return `Analyze sentiment: "${ctx.sections[0].content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (ctx.dimension === 'topics') {
      return `Extract topics: "${ctx.sections[0].content}"
      Return JSON: {"topics": ["topic1", "topic2"]}`;
    }
    
    if (ctx.dimension === 'summary') {
      const { sentiment } = ctx.dependencies.sentiment.data;
      const { topics } = ctx.dependencies.topics.data;
      return `Create ${sentiment} summary covering: ${topics.join(', ')}`;
    }
  }

  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-haiku-20241022' }
    };
  }
}

const engine = new DagEngine({
  plugin: new ReviewAnalyzer(),
  providers: { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } }
});

const result = await engine.process([
  { content: 'Amazing product! Highly recommended.', metadata: {} },
  { content: 'Disappointed with quality.', metadata: {} }
]);
````

<div class="tip custom-block" style="padding-top: 8px">

**Automatic Execution:** `sentiment` + `topics` run in parallel → `summary` waits for both → all reviews processed simultaneously

</div>

## Key Capabilities

<div class="vp-doc">

### Intelligent Parallelization

Define task dependencies once. The engine automatically calculates optimal execution order and runs independent tasks in parallel.
````typescript
defineDependencies() {
  return {
    summary: ['sentiment', 'topics']  // Waits for both
  };
}
````

### Cost Optimization

Skip expensive analysis on low-value content. Route different tasks to different models based on complexity.
````typescript
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension === 'deep_analysis') {
    const quality = ctx.dependencies.quality_check.data;
    return quality.score < 0.7;
  }
}
````

**Result:** 100 items → 40 high-quality → 60% cost reduction

### Data Transformations

Reshape sections between processing stages. Group 100 reviews into 5 categories, then analyze categories.
````typescript
transformSections(ctx) {
  if (ctx.dimension === 'group') {
    return ctx.result.data.categories.map(cat => ({
      content: cat.items.join('\n'),
      metadata: { category: cat.name }
    }));
  }
}
````

**Result:** 100 analyses → 5 analyses (95% fewer API calls)

### Error Recovery

Automatic retry with exponential backoff. Provider fallback when failures occur. Graceful degradation with fallback results.
````typescript
selectProvider(dimension) {
  return {
    provider: 'anthropic',
    options: { model: 'claude-3-5-sonnet-20241022' },
    fallbacks: [
      { provider: 'openai', options: { model: 'gpt-4o' } }
    ]
  };
}
````

</div>

## Production Features

<div class="features-grid">

<div class="feature-card">

### Multi-Provider Support

Route different tasks to different AI providers. Use Claude for filtering, GPT-4 for analysis, Gemini for synthesis.

</div>

<div class="feature-card">

### Real-Time Cost Tracking

Track token usage and costs per dimension and provider. Export detailed breakdowns with results.

</div>

<div class="feature-card">

### External Integration

All hooks support async/await. Integrate Redis caching, PostgreSQL logging, external APIs seamlessly.

</div>

<div class="feature-card">

### Gateway Support

Built-in Portkey integration for advanced retry policies, load balancing, and semantic caching.

</div>

</div>

## Get Started

<div class="vp-doc">

<div style="display: flex; gap: 1rem; margin-top: 1rem;">

<div style="flex: 1; padding: 1.5rem; border: 1px solid var(--vp-c-divider); border-radius: 8px;">

### Learn

- [Quick Start](/guide/quick-start)
- [Core Concepts](/guide/core-concepts)
- [Hello World](/examples/fundamentals/01-hello-world)

</div>

<div style="flex: 1; padding: 1.5rem; border: 1px solid var(--vp-c-divider); border-radius: 8px;">

### Reference

- [Lifecycle Hooks](/api/hooks)
- [Configuration](/api/configuration)
- [Type Definitions](/api/types)

</div>

</div>

</div>

<style>
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.feature-card {
  padding: 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.feature-card h3 {
  margin-top: 0;
  font-size: 1.1rem;
  border: none;
}

.feature-card p {
  margin-bottom: 0;
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
}
</style>