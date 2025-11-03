# @dagengine/core

<div align="center">

**Type-Safe DAG Engine for AI Workflows**

[![CI/CD Pipeline](https://github.com/dagengine/dagengine/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/dagengine/dagengine/actions)
[![codecov](https://codecov.io/gh/dagengine/dagengine/branch/main/graph/badge.svg)](https://codecov.io/gh/dagengine/dagengine)
[![npm version](https://badge.fury.io/js/%40dagengine%2Fcore.svg)](https://badge.fury.io/js/%40dagengine%2Fcore)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![Snyk](https://snyk.io/test/github/dagengine/dagengine/badge.svg)](https://snyk.io/test/github/dagengine/dagengine)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/dagengine/dagengine/badge)](https://securityscorecards.dev/viewer/?uri=github.com/dagengine/dagengine)

[Documentation](https://github.com/dagengine/dagengine#readme) • [Quick Start](#quick-start) • [Examples](#examples) • [API Reference](#api-reference)

</div>

---

## Overview

A TypeScript library for building AI workflows using directed acyclic graphs (DAGs). Define task dependencies and the engine handles execution order, parallelization, and data flow between AI providers.

### Core Features

- **Automatic Dependency Resolution** - Define task dependencies, engine calculates execution order
- **Parallel Execution** - Independent tasks run concurrently with configurable limits
- **Multi-Provider Support** - Anthropic Claude, OpenAI, Google Gemini with unified interface
- **Cost Tracking** - Token usage and cost reporting per dimension and provider
- **Lifecycle Hooks** - 18 hooks for caching, logging, validation, and external integrations
- **Type Safety** - Full TypeScript support with comprehensive type definitions
- **Error Handling** - Automatic retry with exponential backoff and provider fallback

---

## Installation

```bash
npm install @dagengine/core
```

**Requirements:**
- Node.js >= 18.0.0
- TypeScript >= 5.0 (recommended)

---

## Why dagengine?

**Problem:** Building AI workflows is complex
- Manual orchestration of multiple AI calls
- Complex dependency management
- Cost optimization challenges
- Error handling and retries

**Solution:** dagengine handles the complexity
- ✅ Define dependencies, engine handles execution order
- ✅ Automatic parallelization of independent tasks
- ✅ Built-in cost tracking and optimization
- ✅ Smart retry and fallback strategies
- ✅ Type-safe with full TypeScript support

**vs. Alternatives:**
- **LangChain** - More opinionated, heavier framework
- **LlamaIndex** - Focused on RAG, less general-purpose
- **dagengine** - Lightweight, flexible, DAG-native

## Quick Start

### Basic Example

```typescript
import { DagEngine, Plugin } from '@dagengine/core';

// Define your workflow
class SentimentPlugin extends Plugin {
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

// Create engine
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

// Process data
const result = await engine.process([
  { content: 'Great product!', metadata: {} }
]);

console.log(result.sections[0].results.sentiment.data);
// { sentiment: 'positive', score: 0.95 }
```

### Multi-Step Workflow with Dependencies

```typescript
class ReviewAnalyzer extends Plugin {
  constructor() {
    super('review-analyzer', 'Review Analyzer', 'Analyzes reviews');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }

  defineDependencies() {
    return {
      summary: ['sentiment', 'topics']  // summary waits for both
    };
  }

  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract topics: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment.data;
      const topics = context.dependencies.topics.data;
      
      return `Create summary. Sentiment: ${sentiment.sentiment}, Topics: ${topics.topics.join(', ')}`;
    }
  }

  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}
```

**Execution:**
- `sentiment` and `topics` run in parallel
- `summary` waits for both to complete
- All sections processed concurrently

---

## Examples

### Cost Optimization with Skip Logic

```typescript
class SmartAnalyzer extends Plugin {
  dimensions = ['quality_check', 'deep_analysis'];
  
  defineDependencies() {
    return { deep_analysis: ['quality_check'] };
  }

  shouldSkipSectionDimension(context) {
    if (context.dimension === 'deep_analysis') {
      const quality = context.dependencies.quality_check.data;
      return quality.score < 0.7;  // Skip low-quality content
    }
    return false;
  }

  selectProvider(dimension) {
    if (dimension === 'quality_check') {
      return {
        provider: 'anthropic',
        options: { model: 'claude-3-5-haiku-20241022' }  // Cheap model
      };
    }
    
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-sonnet-20241022' }  // Powerful model
    };
  }
}
```

### Provider Fallback

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

### Data Transformation

```typescript
class CategoryAnalyzer extends Plugin {
  dimensions = [
    'classify',
    { name: 'group_by_category', scope: 'global' },
    'analyze_category'
  ];

  transformSections(context) {
    if (context.dimension === 'group_by_category') {
      const categories = context.result.data.categories;
      
      // Transform: 100 sections → 5 category groups
      return categories.map(cat => ({
        content: cat.items.join('\n'),
        metadata: { category: cat.name, count: cat.items.length }
      }));
    }
  }
}
```

**[→ View More Examples](docs/examples/)**

---

## Configuration

### Engine Configuration

```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }
  },
  
  execution: {
    concurrency: 10,        // Max parallel operations
    maxRetries: 3,          // Retry attempts
    retryDelay: 1000,       // Base delay (ms)
    timeout: 60000,         // Default timeout
    continueOnError: true   // Process partial results
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

### Portkey Gateway Integration

```typescript
providers: {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    gateway: 'portkey',
    gatewayApiKey: process.env.PORTKEY_API_KEY,
    gatewayConfig: 'pc-my-config-id'  // Optional: retry/cache config
  }
}
```

**Portkey Features:**
- Automatic retry on rate limits
- Load balancing across providers
- Semantic caching
- Unified observability

---

## API Reference

### Plugin API

```typescript
class MyPlugin extends Plugin {
  // Required
  constructor() {
    super(id, name, description);
    this.dimensions = ['dim1', 'dim2'];
  }

  createPrompt(context): string { }
  selectProvider(dimension): ProviderSelection { }

  // Optional
  defineDependencies(): Record<string, string[]> { }
  shouldSkipSectionDimension(context): boolean { }
  shouldSkipGlobalDimension(context): boolean { }
  transformSections(context): SectionData[] { }
  
  // Lifecycle hooks (16+ available)
  async beforeProcessStart(context): Promise<void> { }
  async afterProcessComplete(context): Promise<void> { }
  async beforeDimensionExecute(context): Promise<void> { }
  async afterDimensionExecute(context): Promise<void> { }
  // ... see documentation for complete list
}
```

### Process Result

```typescript
interface ProcessResult {
  sections: Array<{
    section: SectionData;
    results: Record<string, DimensionResult>;
  }>;
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  costs?: CostSummary;
  metadata?: unknown;
}
```

**[→ Complete API Documentation](docs/api/)**

---

## Supported Providers

| Provider | Models | Documentation |
|----------|--------|---------------|
| **Anthropic** | Claude Opus 4, Sonnet 4.5, Haiku 3.5 | [Docs](https://docs.anthropic.com/) |
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4 Turbo | [Docs](https://platform.openai.com/docs) |
| **Google Gemini** | Gemini 1.5 Pro, Gemini 1.5 Flash | [Docs](https://ai.google.dev/docs) |
| **Portkey** | All providers via unified gateway | [Docs](https://docs.portkey.ai/) |

---

## Development

```bash
# Clone repository
git clone https://github.com/dagengine/dagengine.git
cd dagengine

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check

# Build
npm run build
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Development Workflow:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/name`
3. Make changes and add tests
4. Run validation: `npm run validate`
5. Commit: `git commit -m "feat: description"`
6. Push and open a Pull Request

---

## Security

See [SECURITY.md](SECURITY.md) for our security policy and how to report vulnerabilities.

**Never report security issues through public GitHub issues.**

---

## License

Apache License 2.0 © dagengine contributors

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for the full license text.

### Patent Protection

This license includes an explicit patent grant, protecting users from patent litigation.

---

## Links

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/dagengine/dagengine/issues)
- 💬 [Discussions](https://github.com/dagengine/dagengine/discussions)
- 📦 [npm Package](https://www.npmjs.com/package/@dagengine/core)