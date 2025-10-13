---
title: DagEngine
description: API reference for DagEngine class
---

# DagEngine

Main orchestration engine for executing workflows.

## Import

```typescript
import { DagEngine } from '@ivan629/dag-ai';
```

## Constructor

```typescript
new DagEngine(config: EngineConfig)
```

### Configuration

```typescript
interface EngineConfig {
  // Required
  plugin: Plugin;
  providers: ProviderAdapterConfig;

  // Optional
  concurrency?: number;           // Default: 5
  continueOnError?: boolean;      // Default: true
  maxRetries?: number;            // Default: 3
  retryDelay?: number;            // Default: 1000 (ms)
  timeout?: number;               // Default: 60000 (60s)
  dimensionTimeouts?: Record<string, number>;
  pricing?: PricingConfig;
}
```

### Basic Example

```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```

### Full Example

```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }
  },
  
  concurrency: 10,
  continueOnError: true,
  maxRetries: 5,
  retryDelay: 2000,
  timeout: 120000,
  
  dimensionTimeouts: {
    'slow_analysis': 180000
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
```

## Configuration Options

### plugin (required)

Your plugin instance:

```typescript
class MyPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze: ${context.sections[0].content}`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: { anthropic: { apiKey: '...' } }
});
```

### providers (required)

Provider configuration:

```typescript
providers: {
  anthropic: { apiKey: 'sk-ant-...' },
  openai: { apiKey: 'sk-proj-...' },
  gemini: { apiKey: 'AIza...' }
}
```

### concurrency

Maximum parallel sections (default: 5):

```typescript
concurrency: 10  // Process 10 sections simultaneously
```

### continueOnError

Continue processing on failure (default: true):

```typescript
continueOnError: true   // Continue despite errors
continueOnError: false  // Stop on first error
```

### maxRetries

Retry attempts per provider (default: 3):

```typescript
maxRetries: 3  // Try 4 times total (1 initial + 3 retries)
```

### retryDelay

Base delay between retries in ms (default: 1000):

```typescript
retryDelay: 2000  // Base delay: 2s (exponential backoff)
```

### timeout

Global timeout in ms (default: 60000):

```typescript
timeout: 120000  // 120 seconds
```

### dimensionTimeouts

Per-dimension timeouts in ms:

```typescript
dimensionTimeouts: {
  'quick_check': 10000,      // 10s
  'deep_analysis': 180000    // 180s
}
```

### pricing

Model pricing for cost tracking:

```typescript
pricing: {
  models: {
    'claude-sonnet-4-5-20250929': {
      inputPer1M: 3.00,
      outputPer1M: 15.00
    },
    'gpt-4o': {
      inputPer1M: 2.50,
      outputPer1M: 10.00
    }
  }
}
```

## Methods

### process()

Execute workflow:

```typescript
async process(
  sections: SectionData[],
  options?: ProcessOptions
): Promise<ProcessResult>
```

#### Parameters

**sections** (required):

```typescript
const sections: SectionData[] = [
  {
    content: 'Text to analyze',
    metadata: { id: 1, userId: 123 }
  }
];
```

**options** (optional):

```typescript
interface ProcessOptions {
  onDimensionStart?: (dimension: string) => void;
  onDimensionComplete?: (dimension: string, result: DimensionResult) => void;
  onSectionStart?: (index: number, total: number) => void;
  onSectionComplete?: (index: number, total: number) => void;
  onError?: (context: string, error: Error) => void;
  [key: string]: unknown;  // Custom data
}
```

#### Returns

```typescript
interface ProcessResult {
  sections: Array<{
    section: SectionData;
    results: Record<string, DimensionResult>;
  }>;
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  costs?: CostSummary;
  metadata?: Record<string, unknown>;
}
```

#### Examples

**Basic:**

```typescript
const result = await engine.process(sections);

console.log(result.sections[0].results.sentiment.data);
console.log(result.costs?.totalCost);
```

**With Callbacks:**

```typescript
const result = await engine.process(sections, {
  onDimensionComplete: (dim, res) => {
    console.log(`${dim}: ${res.error ? 'failed' : 'success'}`);
  },
  
  onSectionComplete: (index, total) => {
    console.log(`Progress: ${index + 1}/${total}`);
  }
});
```

### getGraphAnalytics()

Get dependency graph analytics:

```typescript
async getGraphAnalytics(): Promise<GraphAnalytics>
```

#### Returns

```typescript
interface GraphAnalytics {
  totalDimensions: number;
  totalDependencies: number;
  maxDepth: number;
  criticalPath: string[];
  parallelGroups: string[][];
  independentDimensions: string[];
  bottlenecks: string[];
}
```

#### Example

```typescript
const analytics = await engine.getGraphAnalytics();

console.log('Critical path:', analytics.criticalPath);
console.log('Max depth:', analytics.maxDepth);
console.log('Bottlenecks:', analytics.bottlenecks);
```

### exportGraphDOT()

Export graph in DOT format for Graphviz:

```typescript
async exportGraphDOT(): Promise<string>
```

#### Example

```typescript
const dot = await engine.exportGraphDOT();
await writeFile('workflow.dot', dot);

// Generate image:
// dot -Tpng workflow.dot -o workflow.png
```

### exportGraphJSON()

Export graph in JSON format for D3.js/Cytoscape:

```typescript
async exportGraphJSON(): Promise<{ nodes: Node[]; links: Link[] }>
```

#### Example

```typescript
const graph = await engine.exportGraphJSON();

console.log(graph.nodes);
console.log(graph.links);
```

### getAvailableProviders()

Get registered provider names:

```typescript
getAvailableProviders(): string[]
```

#### Example

```typescript
const providers = engine.getAvailableProviders();
console.log('Available:', providers);
// ['anthropic', 'openai', 'gemini']
```

## Complete Examples

### Basic Workflow

```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

class SentimentPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze sentiment: "${context.sections[0].content}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } };
  }
}

const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

const sections = [
  { content: 'I love this!', metadata: { id: 1 } },
  { content: 'Terrible', metadata: { id: 2 } }
];

const result = await engine.process(sections);

console.log(result.sections[0].results.sentiment.data);
// { sentiment: 'positive', score: 0.95 }
```

### With Dependencies

```typescript
class Analysis extends Plugin {
  dimensions = ['sentiment', 'topics', 'summary'];
  
  defineDependencies() {
    return {
      summary: ['sentiment', 'topics']
    };
  }
  
  createPrompt(context) {
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment.data;
      const topics = context.dependencies.topics.data;
      return `Summarize with ${sentiment.sentiment} tone about ${topics.topics.join(', ')}`;
    }
    return `Extract ${context.dimension}: ${context.sections[0].content}`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

const engine = new DagEngine({
  plugin: new Analysis(),
  providers: { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } }
});

const result = await engine.process(sections);
```

### Production Setup

```typescript
const engine = new DagEngine({
  plugin: new ProductionPlugin(),
  
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }
  },
  
  concurrency: 20,
  continueOnError: true,
  maxRetries: 5,
  retryDelay: 2000,
  
  timeout: 120000,
  dimensionTimeouts: {
    'quick_filter': 10000,
    'deep_analysis': 300000
  },
  
  pricing: {
    models: {
      'claude-sonnet-4-5-20250929': { inputPer1M: 3.00, outputPer1M: 15.00 },
      'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 }
    }
  }
});

const result = await engine.process(sections, {
  onSectionComplete: (index, total) => {
    console.log(`Progress: ${index + 1}/${total}`);
  },
  
  onError: (context, error) => {
    logger.error({ context, error });
  }
});

console.log(`Cost: $${result.costs.totalCost}`);
```

## Next Steps

- [Plugin API](/api/plugin) - Plugin reference
- [Quick Start](/guide/quick-start) - Build your first workflow
- [Hooks](/lifecycle/hooks) - Lifecycle hooks
- [Examples](/guide/examples) - Real-world examples
