---
layout: home

hero:
  name: dag-ai
  text: AI Workflow Orchestration
  tagline: Build production-ready AI pipelines with intelligent dependency management and zero complexity
  actions:
    - theme: brand
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: GitHub
      link: https://github.com/ivan629/dag-ai

features:
  - icon: 🎯
    title: DAG-Based Execution
    details: Topological sorting with DAG-based execution. Define dependencies once, let the engine handle execution order and parallelization.

  - icon: 📦
    title: Section & Global Dimensions
    details: The dual dimension nature and shared across all stages in workflow.

  - icon: 🎨
    title: Section Transformations
    details: Merge, split, or reorder sections based on the previous dimension result, or current section metadata.

  - icon: 🔄
    title: Provider Fallback
    details: Configure provider chains with automatic retry and exponential backoff. Switch providers when failures occur.

  - icon: 🪝
    title: Lifecycle Hooks
    details: Intercept execution at 16 stages. Skip processing, transform data, handle errors, integrate external tools like databases, caching and etc.

  - icon: 📊
    title: Cost Tracking
    details: Track token usage and costs per dimension and provider in real-time. Exported with results.
---

## Example

```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

class CatAnalysis extends Plugin {
  dimensions = [
    { name: 'breed_detection', scope: 'section' },
    { name: 'categorize_by_breed', scope: 'global' },
    { name: 'generate_insights', scope: 'section' }
  ];
  
  defineDependencies() {
    return {
      categorize_by_breed: ['breed_detection'],
      generate_insights: ['categorize_by_breed']
    };
  }
  
  createPrompt(ctx) {
    if (ctx.dimension === 'breed_detection') {
      return `Identify the cat breed in this description: "${ctx.section.content}"
      Return JSON: {"breed": "...", "confidence": 0-1}`;
    }
    
    if (ctx.dimension === 'generate_insights') {
      const category = ctx.dependencies.categorize_by_breed.data;
      return `Generate insights about this ${category.breed_group} cat:
      Breed: ${ctx.section.breed}
      Description: ${ctx.section.content}
      Return JSON with personality traits and care tips.`;
    }
    
    return `Analyze cats`;
  }
  
  transformSections(ctx) {
    if (ctx.dimension === 'categorize_by_breed') {
      // Group cats by breed family
      const groups = ctx.result.data.breed_groups;
      
      return groups.map(group => ({
        content: group.cats.map(c => c.description).join('\n'),
        breed: group.name,
        metadata: { count: group.cats.length }
      }));
    }
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
  plugin: new CatAnalysis(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }
  }
});

const cats = [
  { content: 'Fluffy orange cat with green eyes', metadata: {} },
  { content: 'Sleek black cat with yellow eyes', metadata: {} },
  { content: 'White persian with blue eyes', metadata: {} }
];

const result = await engine.process(cats);
```

**Execution:** `breed_detection` processes 3 cats in parallel → `categorize_by_breed` groups them by breed family (transforms 3 sections into breed groups) → `generate_insights` processes each group with breed context.

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

## Documentation

- [Quick Start](/guide/quick-start) - Build your first workflow
- [Core Concepts](/guide/core-concepts) - Dependencies and processing modes
- [Cost Optimization](/guide/skip-logic) - Reduce API costs
- [Lifecycle Hooks](/lifecycle/hooks) - Extension points reference
- [Examples](/guide/examples) - Working implementations
- [API Reference](/api/engine) - Complete API documentation

