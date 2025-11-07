---
title: Quick Start
description: Build your first AI workflow in 5 minutes
---

# Quick Start

Get started with dagengine in 5 minutes. Build a simple sentiment analysis workflow.

## Installation

::: code-group
```bash [npm]
npm install @dagengine/core
```
```bash [yarn]
yarn add @dagengine/core
```
```bash [pnpm]
pnpm add @dagengine/core
```

:::

**Requirements:** Node.js ≥ 18.0.0, TypeScript ≥ 5.0 (recommended)

## Your First Workflow

Let's analyze customer reviews with sentiment analysis, topic extraction, and summaries.

### Step 1: Set Your API Key
```bash
export ANTHROPIC_API_KEY="your-key-here"
```

Get your API key from [Anthropic Console](https://console.anthropic.com/).

### Step 2: Create Your Plugin

A **plugin** defines what analyses to run. Here's a complete review analyzer:
```typescript
import { DagEngine, Plugin, type PromptContext, type ProviderSelection } from '@dagengine/core';

// Define result types (optional but helps with TypeScript)
interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  score: number;
}

interface TopicsResult {
  topics: string[];
}

interface SummaryResult {
  summary: string;
}

class ReviewAnalyzer extends Plugin {
  constructor() {
    super('analyzer', 'Review Analyzer', 'Analyzes customer reviews');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }

  defineDependencies(): Record<string, string[]> {
    return {
      summary: ['sentiment', 'topics']
    };
  }

  createPrompt(context: PromptContext): string {
    const content = context.sections[0]?.content || '';

    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${content}"
Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }

    if (context.dimension === 'topics') {
      return `Extract topics: "${content}"
Return JSON: {"topics": ["topic1", "topic2"]}`;
    }

    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment?.data as SentimentResult;
      const topics = context.dependencies.topics?.data as TopicsResult;

      return `Create a ${sentiment.sentiment} summary covering ${topics.topics.join(', ')}:
"${content}"
Return JSON: {"summary": "summary text"}`;
    }

    throw new Error(`Unknown dimension: ${context.dimension}`);
  }

  selectProvider(): ProviderSelection {
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-haiku-20241022' }
    };
  }
}
```

### Step 3: Process Your Data
```typescript
async function main(): Promise<void> {
  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Missing ANTHROPIC_API_KEY environment variable');
    console.error('Set it with: export ANTHROPIC_API_KEY="your-key"');
    process.exit(1);
  }

  // Create engine
  const engine = new DagEngine({
    plugin: new ReviewAnalyzer(),
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    }
  });

  // Prepare reviews
  const reviews = [
    { content: 'This product is amazing! Love it!', metadata: { id: 1 } },
    { content: 'Terrible quality. Very disappointed.', metadata: { id: 2 } },
    { content: 'It works as expected.', metadata: { id: 3 } }
  ];

  // Process
  const result = await engine.process(reviews);

  // Display results
  result.sections.forEach((section, i) => {
    const sentiment = section.results.sentiment?.data as SentimentResult;
    const topics = section.results.topics?.data as TopicsResult;
    const summary = section.results.summary?.data as SummaryResult;

    console.log(`Review ${i + 1}:`);
    console.log(`  Sentiment: ${sentiment.sentiment} (${sentiment.score})`);
    console.log(`  Topics: ${topics.topics.join(', ')}`);
    console.log(`  Summary: ${summary.summary}`);
    console.log('---');
  });
}

// Run with error handling
main().catch((error: Error) => {
  console.error('❌ Processing failed:', error.message);
  process.exit(1);
});
```

**Output:**
```
Review 1:
  Sentiment: positive (0.95)
  Topics: product quality, satisfaction
  Summary: A highly positive review expressing love for the product
---
Review 2:
  Sentiment: negative (0.15)
  Topics: quality issues, disappointment
  Summary: A strongly negative review criticizing poor quality
---
Review 3:
  Sentiment: neutral (0.5)
  Topics: functionality
  Summary: A neutral assessment confirming expected functionality
---
```

## What Just Happened?

dagengine automatically optimized your workflow:

1. ✅ **Parallel execution**: `sentiment` and `topics` ran simultaneously (both have no dependencies)
2. ✅ **Smart ordering**: `summary` waited for both to complete
3. ✅ **Batch processing**: All 3 reviews processed in parallel
4. ✅ **Zero orchestration**: 9 AI calls (3 reviews × 3 dimensions) optimized automatically

## Understanding the Results

The `process()` method returns structured results:
```typescript
{
  sections: [
    {
      section: { content: '...', metadata: { id: 1 } },
      results: {
        sentiment: {
          data: { sentiment: 'positive', score: 0.95 },
          metadata: {
            provider: 'anthropic',
            model: 'claude-3-5-haiku-20241022',
            tokens: { inputTokens: 45, outputTokens: 12 },
            cost: { inputCost: 0.000045, outputCost: 0.00015 }
          }
        },
        topics: { /* ... */ },
        summary: { /* ... */ }
      }
    },
    // ... more sections
  ],
  globalResults: {},
  stats: {
    totalCost: 0.025,
    totalTokens: 1543,
    dimensions: { /* per-dimension stats */ }
  }
}
```

**Key parts:**
- `sections` - Results for each input section
- `results[dimension].data` - Your analysis result
- `results[dimension].metadata` - Provider info, tokens, and costs
- `stats` - Aggregate cost and token tracking

## Minimal Example

For a simpler starting point, here's a basic sentiment analyzer:
```typescript
import { DagEngine, Plugin, type PromptContext, type ProviderSelection } from '@dagengine/core';

class SentimentPlugin extends Plugin {
  constructor() {
    super('sentiment', 'Sentiment Analyzer', 'Analyzes text sentiment');
    this.dimensions = ['sentiment'];
  }

  createPrompt(context: PromptContext): string {
    return `Analyze the sentiment: "${context.sections[0]?.content}"
Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }

  selectProvider(): ProviderSelection {
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-haiku-20241022' }
    };
  }
}

// Create engine
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  }
});

// Process data
engine.process([
  { content: 'I love this!', metadata: {} }
]).then((result) => {
  console.log(result.sections[0]?.results.sentiment?.data);
  // { sentiment: 'positive', score: 0.95 }
});
```

## What's Next?

You've learned the basics! Now explore:

### Core Concepts
- **[Core Concepts](./core-concepts.md)** - Deep dive into sections, dimensions, and dependencies
- **[Configuration](../api/configuration.md)** - All engine configuration options

### Advanced Features

**Multiple Providers:**
```typescript
selectProvider(dimension: string): ProviderSelection {
  if (dimension === 'quality_check') {
    return { provider: 'gemini', options: { model: 'gemini-1.5-flash' } };
  }
  return { provider: 'anthropic', options: { model: 'claude-3-5-haiku-20241022' } };
}
```

**Provider Fallbacks:**
```typescript
selectProvider(): ProviderSelection {
  return {
    provider: 'anthropic',
    options: { model: 'claude-3-5-haiku-20241022' },
    fallbacks: [
      { provider: 'openai', options: { model: 'gpt-4o-mini' } },
      { provider: 'gemini', options: { model: 'gemini-1.5-flash' } }
    ]
  };
}
```

**Cost Optimization:**
```typescript
shouldSkipSectionDimension(context: SkipContext): boolean {
  if (context.dimension === 'deep_analysis') {
    const quality = context.dependencies.quality_check?.data as { score: number };
    return quality.score < 0.7;  // Skip low-quality items
  }
  return false;
}
```

**Lifecycle Hooks:**
```typescript
async afterDimensionExecute(context: AfterDimensionExecuteContext): Promise<void> {
  // Save results to database
  await db.results.insert({
    sectionId: context.section.metadata.id,
    dimension: context.dimension,
    data: context.result.data
  });
}
```

### Step-by-Step Guides

Work through our fundamentals series:

1. **[Hello World](../examples/fundamentals/01-hello-world.md)** - Your first plugin
2. **[Dependencies](../examples/fundamentals/02-dependencies.md)** - Control execution order
3. **[Section vs Global](../examples/fundamentals/03-section-vs-global.md)** - Two dimension types
4. **[Transformations](../examples/fundamentals/04-transformations.md)** - Reshape data mid-pipeline
5. **[Skip Logic](../examples/fundamentals/05-skip-logic.md)** - Optimize costs
6. **[Multi-Provider](../examples/fundamentals/06-providers.md)** - Route to different models
7. **[Async Hooks](../examples/fundamentals/07-async-hooks.md)** - Database integration
8. **[Error Handling](../examples/fundamentals/08-error-handling.md)** - Graceful recovery

## Common Issues

### "Provider not found"

::: danger Problem
```typescript
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {}  // ❌ Empty!
});
```
:::

::: tip Solution
```typescript
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```
:::

### "API key not set"

::: danger Problem
```
Error: Anthropic API key is required
```
:::

::: tip Solution
```bash
# Set environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Or use .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

Then install dotenv:
```bash
npm install dotenv
```

And load it in your code:
```typescript
import 'dotenv/config';
```
:::

### Result is undefined

::: danger Problem
```typescript
console.log(result.sections[0].results.sentiment);
// undefined
```
:::

::: warning Cause
Dimension name mismatch or missing optional chaining
:::

::: tip Solution
```typescript
// Plugin dimension name must match
this.dimensions = ['sentiment'];  // ✅

// Use optional chaining for safety
const data = result.sections[0]?.results.sentiment?.data;  // ✅
```
:::

### TypeScript errors

::: danger Problem
```
Property 'sentiment' does not exist on type '{}'
```
:::

::: tip Solution
Define result types and use type assertions:
```typescript
interface SentimentResult {
  sentiment: string;
  score: number;
}

const data = section.results.sentiment?.data as SentimentResult;
```
:::

## Need Help?

- 💬 **[Ask a Question](https://github.com/dagengine/dagengine/discussions/new?category=q-a)** - Get help from the community
- 🐛 **[Report a Bug](https://github.com/dagengine/dagengine/issues/new)** - Found an issue?
- 📖 **[Read the Docs](https://www.dagengine.ai)** - Comprehensive guides and API reference