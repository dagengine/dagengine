# @ivan629/dag-ai

<div align="center">

**AI-powered DAG engine with advanced graph analytics and workflow visualization**

[![CI/CD Pipeline](https://github.com/ivan629/dag-ai/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/ivan629/dag-ai/actions)
[![codecov](https://codecov.io/gh/ivan629/dag-ai/branch/main/graph/badge.svg)](https://codecov.io/gh/ivan629/dag-ai)
[![npm version](https://badge.fury.io/js/%40ivan629%2Fdag-ai.svg)](https://badge.fury.io/js/%40ivan629%2Fdag-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![Snyk](https://snyk.io/test/github/ivan629/dag-ai/badge.svg)](https://snyk.io/test/github/ivan629/dag-ai)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/ivan629/dag-ai/badge)](https://securityscorecards.dev/viewer/?uri=github.com/ivan629/dag-ai)

[Documentation](https://github.com/ivan629/dag-ai#readme) • [Quick Start](#quick-start) • [Examples](#examples) • [API Reference](#api-reference)

</div>

---

## Overview

**dag-ai** is an enterprise-grade TypeScript library for building complex AI workflows using Directed Acyclic Graphs (DAGs). Process data through multiple AI providers with automatic dependency management, fallback handling, and advanced optimization.

### Key Features

- 🎯 **DAG-based Execution** - Define complex workflows with automatic dependency resolution
- 🤖 **Multi-Provider Support** - Anthropic Claude, OpenAI, Google Gemini with automatic fallbacks
- ⚡ **Parallel Processing** - Concurrent execution with configurable concurrency limits
- 🔄 **Smart Retries** - Automatic retry with exponential backoff
- 💰 **Cost Optimization** - Skip logic and provider selection strategies
- 🎨 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- 🔌 **Extensible** - 16+ lifecycle hooks for custom behavior
- 📊 **Analytics** - Built-in token tracking and cost calculation
- 🛡️ **Enterprise-Ready** - Error handling, validation, and production-tested

---

## Quick Start

### Installation

```bash
npm install @ivan629/dag-ai
```

### Basic Example

```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

// Define your workflow
class SentimentPlugin extends Plugin {
  constructor() {
    super('sentiment', 'Sentiment Analyzer', 'Analyzes text sentiment');
    this.dimensions = ['sentiment'];
  }

  createPrompt(context) {
    return `Analyze the sentiment: "${context.sections[0].content}"
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
  { content: 'I love this product!', metadata: {} }
]);

console.log(result.sections[0].results.sentiment.data);
// { sentiment: 'positive', score: 0.95 }
```

**[→ Full Quick Start Guide](docs/quick-start.md)**

---

## Core Concepts

### Sections & Dimensions

**Sections** are your input data. **Dimensions** are the analyses you want to run:

```typescript
const reviews = [
  { content: 'Great product!', metadata: { id: 1 } },
  { content: 'Not what I expected', metadata: { id: 2 } }
];

class ReviewPlugin extends Plugin {
  constructor() {
    super('review', 'Review Analyzer', 'Analyzes reviews');
    
    // Run multiple analyses
    this.dimensions = [
      'sentiment',  // Section-level: per review
      'topics',     // Section-level: per review
      'summary'     // Global: across all reviews
    ];
  }

  // Mark global dimensions
  isGlobalDimension(dimension) {
    return dimension === 'summary';
  }
}
```

### Dependencies

Control execution order with dependencies:

```typescript
defineDependencies() {
  return {
    // 'summary' runs after 'sentiment' and 'topics' complete
    summary: ['sentiment', 'topics']
  };
}
```

**[→ Learn More About Core Concepts](docs/core-concepts.md)**

---

## Examples

### Multi-Step Analysis

```typescript
class ContentAnalyzer extends Plugin {
  constructor() {
    super('content', 'Content Analyzer', 'Analyzes content');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }

  defineDependencies() {
    return {
      summary: ['sentiment', 'topics']  // Summary needs both
    };
  }

  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: ${context.sections[0].content}`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract topics: ${context.sections[0].content}`;
    }
    
    if (context.dimension === 'summary') {
      const sentiments = context.dependencies.sentiment.data;
      const topics = context.dependencies.topics.data;
      
      return `Create summary based on:
        Sentiments: ${JSON.stringify(sentiments)}
        Topics: ${JSON.stringify(topics)}`;
    }
  }

  selectProvider(context) {
    // Use different models for different tasks
    if (context.dimension === 'summary') {
      return { 
        provider: 'anthropic',
        options: { model: 'claude-opus-4-20250514' }  // More powerful
      };
    }
    
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }  // Faster
    };
  }
}
```

### Fallback Providers

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },
    fallbacks: [
      { 
        provider: 'openai',
        options: { model: 'gpt-4' }
      },
      { 
        provider: 'gemini',
        options: { model: 'gemini-pro' }
      }
    ]
  };
}
```

### Skip Logic (Cost Optimization)

```typescript
shouldSkipSectionDimension(context) {
  // Skip short content
  if (context.section.content.length < 50) {
    return true;
  }
  
  // Return cached result
  const cached = this.cache.get(context.section.metadata.id);
  if (cached) {
    return { skip: true, result: { data: cached } };
  }
  
  return false;
}
```

**[→ More Examples](docs/examples.md)**

---

## API Reference

### DagEngine

```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: {
    anthropic: { apiKey: '...' },
    openai: { apiKey: '...' }
  },
  execution: {
    concurrency: 5,           // Max parallel requests
    maxRetries: 3,            // Retry failed requests
    timeout: 30000,           // 30s timeout
    continueOnError: false    // Stop on first error
  }
});

const result = await engine.process(sections, options);
```

### Plugin API

```typescript
class MyPlugin extends Plugin {
  // Required
  constructor() {
    super(id, name, description);
    this.dimensions = ['dim1', 'dim2'];
  }

  createPrompt(context): string;
  selectProvider(context): ProviderSelection;

  // Optional
  defineDependencies(): Record<string, string[]>;
  isGlobalDimension(dimension: string): boolean;
  
  // Lifecycle hooks (16 available)
  shouldSkipSectionDimension(context): boolean | SkipResult;
  shouldSkipGlobalDimension(context): boolean | SkipResult;
  transformDependencies(context): Promise<Dependencies>;
  beforeDimension(context): Promise<void>;
  afterDimension(context): Promise<void>;
  // ... and more
}
```

**[→ Complete API Documentation](docs/api.md)**

---

## Supported Providers

| Provider | Models | Features |
|----------|--------|----------|
| **Anthropic** | Claude Opus 4, Sonnet 4.5, Haiku 3.5 | Streaming, vision, tools |
| **OpenAI** | GPT-4, GPT-4 Turbo, GPT-3.5 | Function calling, JSON mode |
| **Google Gemini** | Gemini Pro, Gemini Ultra | Multimodal, long context |
| **Portkey Gateway** | All providers | Unified API, caching, analytics |

**[→ Provider Configuration Guide](docs/providers.md)**

---

## Advanced Features

### Lifecycle Hooks

Hook into 16 different execution points:

```typescript
class MyPlugin extends Plugin {
  async beforeProcess(context) {
    console.log('Starting process...');
  }

  async beforeDimension(context) {
    console.log(`Processing ${context.dimension}...`);
  }

  async afterDimension(context) {
    console.log(`Completed in ${context.duration}ms`);
    console.log(`Used ${context.tokensUsed.totalTokens} tokens`);
  }

  async afterProcess(context) {
    console.log('Process complete!');
    console.log(`Total cost: $${context.costSummary.totalCost}`);
  }
}
```

**[→ Lifecycle Hooks Reference](docs/lifecycle-hooks.md)**

### Cost Tracking

Automatic token and cost tracking:

```typescript
const result = await engine.process(sections);

console.log(result.costSummary);
// {
//   totalCost: 0.045,
//   totalTokens: 15234,
//   byDimension: {
//     sentiment: { cost: 0.012, tokens: {...} },
//     topics: { cost: 0.018, tokens: {...} }
//   },
//   byProvider: {
//     anthropic: { cost: 0.030, tokens: {...}, models: [...] }
//   }
// }
```

### Error Handling

```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: { /* ... */ },
  execution: {
    maxRetries: 3,
    retryDelay: 1000,
    continueOnError: true  // Don't stop on errors
  },
  onError: (id, error) => {
    console.error(`Error in ${id}:`, error.message);
  }
});
```

---

## Performance

- **Parallel Execution** - Process multiple sections simultaneously
- **Configurable Concurrency** - Control rate limits and costs
- **Smart Caching** - Skip redundant API calls
- **Efficient Batching** - Optimize token usage

```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: { /* ... */ },
  execution: {
    concurrency: 10,        // 10 parallel requests
    dimensionTimeouts: {
      summary: 60000        // Custom timeout per dimension
    }
  }
});
```

---

## Requirements

- **Node.js** >= 18.0.0
- **TypeScript** >= 5.0 (recommended)

---

## Development

```bash
# Clone repository
git clone https://github.com/ivan629/dag-ai.git
cd dag-ai

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Run all checks
npm run validate
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m "feat: add amazing feature"`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test updates
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

---

## Security

We take security seriously. See [SECURITY.md](SECURITY.md) for:

- Reporting vulnerabilities
- Security update process
- Supported versions

**Never report security issues through public GitHub issues.**  
Email: security@your-domain.com

---

## License

[MIT](LICENSE) © Ivan Holovach

---

## Acknowledgments

Built with:
- [@dagrejs/graphlib](https://github.com/dagrejs/graphlib) - Graph algorithms
- [Anthropic Claude](https://www.anthropic.com/) - AI provider
- [p-queue](https://github.com/sindresorhus/p-queue) - Concurrency control

---

## Links

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/ivan629/dag-ai/issues)
- 💬 [Discussions](https://github.com/ivan629/dag-ai/discussions)
- 📦 [npm Package](https://www.npmjs.com/package/@ivan629/dag-ai)
- 🔐 [Security Policy](SECURITY.md)
