# @dagengine/core

<div align="center">

**🚀 Type-Safe DAG Engine for AI Workflows**

*Define task dependencies. Get automatic parallelization, cost tracking, and 10x speedup.*

[![npm version](https://badge.fury.io/js/%40dagengine%2Fcore.svg)](https://www.npmjs.com/package/@dagengine/core)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)

[🚀 Quick Start](#-5-minute-quick-start) •
[📖 Documentation](https://www.dagengine.ai/guide/quick-start.html) •
[💬 Discussions](https://github.com/dagengine/dagengine/discussions) •
[🐛 Issues](https://github.com/dagengine/dagengine/issues) •
[📦 Examples](examples/)

</div>

---

## 🎯 What is dagengine?

**dagengine** is a TypeScript DAG engine that turns sequential AI workflows into parallel ones automatically.

### The Problem
```typescript
// ❌ What most developers do (sequential, slow, expensive)
for (const item of items) {
  const sentiment = await ai.analyze(item);  // Wait...
  const topics = await ai.extract(item);     // Wait...
  const summary = await ai.summarize(item);  // Wait...
}
// Result: 100 items × 15 seconds = 25 minutes, $15
```

### The Solution
```typescript
// ✅ With dagengine (parallel, fast, cheap)
const engine = new DagEngine({ plugin: new MyPlugin() });
const result = await engine.process(items);
// Result: 100 items in 2.5 minutes, $5
```

**10x faster. 67% cheaper. Zero orchestration code.**

Define dependencies → get automatic parallelization.

---

## 🚀 5-Minute Quick Start

### Install
```bash
npm install @dagengine/core
```

**Requirements:** Node.js ≥ 18.0.0, TypeScript ≥ 5.0 (recommended)

### Example: Analyze Customer Reviews
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

// 1. Define your workflow
class ReviewAnalyzer extends Plugin {
	constructor() {
		super('analyzer', 'Review Analyzer', 'Analyzes reviews');
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

// 2. Process your data
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
		{ content: 'Great product!', metadata: { id: 1 } },
		{ content: 'Not good.', metadata: { id: 2 } }
	];

	// Process
	const result = await engine.process(reviews);

	// Display results
	console.log(JSON.stringify(result.sections[0]?.results, null, 4));
}

// 3. Run with error handling
main().catch((error: Error) => {
	console.error('❌ Processing failed:', error.message);
	process.exit(1);
});
```

**What just happened?**
- ✅ `sentiment` and `topics` ran in parallel (both have no dependencies)
- ✅ `summary` waited for both to complete
- ✅ All sections processed in parallel
- ✅ 2 reviews × 3 dimensions = 6 AI calls, all optimized automatically

**Next:** [Full Documentation](https://www.dagengine.ai/guide/quick-start.html) • [Examples](examples/) • [Production Guide](docs/examples/fundamentals/00-quickstart.md)

---

## 📊 Why Choose dagengine?

| Feature | DIY Code | LangChain | dagengine |
|---------|----------|-----------|-----------|
| **Setup** | Manual loops | Learn LCEL | 2 methods |
| **Parallelization** | Manual | Manual | Automatic |
| **Cost Tracking** | Manual calc | Manual calc | Built-in |
| **TypeScript** | ✅ Full | ⚠️ Partial | ✅ Full |
| **Code (100 items)** | 150 lines | 80 lines | 25 lines |
| **Best For** | Small scripts | RAG/Agents | Orchestration |

**Use dagengine when:**
- ✅ Processing 100+ items with multiple AI analyses
- ✅ Want automatic parallelization without complexity
- ✅ Need built-in cost tracking
- ✅ TypeScript projects

**Skip dagengine when:**
- ❌ Single AI calls (overkill)
- ❌ Need RAG/agents (use LangChain)
- ❌ Python projects (we're TypeScript-only)

---

## ⚡ Key Features

<table>
<tr>
<td width="50%" valign="top">

### 🎯 Zero Infrastructure
Define task dependencies once. Engine handles execution order, parallelization, and coordination automatically. No queues, workers, or complex orchestration code.

### 💰 Cost Optimized
Skip low-value processing with conditional execution. Route tasks to optimal models. Track costs per dimension in real-time with automatic token counting.

### 🔄 Production Ready
Automatic retry with exponential backoff. Provider fallback chains. Graceful error recovery with partial results. Battle-tested reliability.

</td>
<td width="50%" valign="top">

### 🌍 Multi-Provider Support
Use Anthropic Claude, OpenAI GPT, Google Gemini with a unified interface. Switch providers per dimension. Mix models in one workflow.

### 🪝 18 Lifecycle Hooks
Full async/await support. Integrate databases, caches, APIs at every processing stage. Transform data mid-pipeline. Complete control when you need it.

### 📊 Real-Time Tracking
Built-in cost and token tracking per dimension and provider. Progress callbacks with throughput metrics. Detailed breakdowns in results.

</td>
</tr>
</table>

---

## 💡 Core Concepts

### 1️⃣ Sections (Your Data)
```typescript
const sections = [
  { 
    content: 'Customer review text here',
    metadata: { id: 1, userId: 123, productId: 'SKU-789' }
  }
];
```

**Sections** are the pieces of data you analyze (reviews, emails, documents, etc.).

### 2️⃣ Dimensions (Your Tasks)
```typescript
this.dimensions = ['sentiment', 'topics', 'summary'];
```

**Dimensions** are the analyses you run. Each dimension processes all sections.

### 3️⃣ Dependencies (Execution Order)
```typescript
defineDependencies() {
  return {
    sentiment: [],           // No dependencies (runs first)
    topics: [],              // No dependencies (runs first)
    summary: ['sentiment', 'topics']  // Waits for both
  };
}
```

**Dependencies** control execution order. Engine automatically parallelizes independent tasks.
```
Execution Plan:
sentiment ──┐
            ├─→ Both run in parallel → summary
topics ─────┘
```

### 4️⃣ Two Dimension Types

**Section Dimensions** (default) - Analyze each item independently:
```typescript
this.dimensions = ['sentiment'];  // Runs once per section
```

**Global Dimensions** - Analyze all items together:
```typescript
this.dimensions = [
  { name: 'categorize', scope: 'global' }  // Runs once for all sections
];
```

---

## 🎨 Advanced Features

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
      return quality.score < 0.7;  // Skip low-quality items
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
      options: { model: 'claude-3-7-sonnet-20250219' }  // Expensive model
    };
  }
}
```

**Result:** 100 items → 40 high-quality → 60% fewer expensive API calls

### Provider Fallback Chains
```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },
    fallbacks: [
      { provider: 'openai', options: { model: 'gpt-4o' } },
      { provider: 'gemini', options: { model: 'gemini-2.5-pro' } }
    ]
  };
}
```

**Automatic failover:** If Anthropic fails, automatically tries OpenAI, then Gemini.

### Data Transformations
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
        content: cat.items.join('\n\n'),
        metadata: { category: cat.name, count: cat.items.length }
      }));
    }
  }
}
```

**Result:** Analyze 5 category groups instead of 100 individual items (95% fewer API calls)

### Async Integration Hooks
```typescript
class DatabaseIntegratedPlugin extends Plugin {
  async beforeProcessStart(context) {
    // Initialize connections
    await this.db.connect();
  }

  async shouldSkipSectionDimension(context) {
    // Check cache before processing
    const cached = await this.redis.get(`${context.section.id}:${context.dimension}`);
    if (cached) return true;
    return false;
  }

  async afterDimensionExecute(context) {
    // Save results to database
    await this.db.results.insert({
      section: context.section.id,
      dimension: context.dimension,
      data: context.result.data
    });
  }

  async afterProcessComplete(context) {
    // Cleanup
    await this.db.disconnect();
  }
}
```

**All 18 hooks support async/await** for seamless external service integration.

---

## 📚 Documentation

### 🎓 Learn

- **[Quick Start](https://www.dagengine.ai/guide/quick-start.html)** - Get started in 5 minutes
- **[Core Concepts](https://www.dagengine.ai/guide/core-concepts.html)** - Understand sections, dimensions, dependencies
- **[Examples](examples/)** - Complete working examples

### 📖 Fundamentals (Step-by-Step Guides)

1. [Hello World](docs/examples/fundamentals/01-hello-world.md) - Your first plugin
2. [Dependencies](docs/examples/fundamentals/02-dependencies.md) - Control execution order
3. [Section vs Global](docs/examples/fundamentals/03-section-vs-global.md) - Two dimension types
4. [Transformations](docs/examples/fundamentals/04-transformations.md) - Reshape data mid-pipeline
5. [Skip Logic](docs/examples/fundamentals/05-skip-logic.md) - Optimize costs
6. [Multi-Provider](docs/examples/fundamentals/06-providers.md) - Route to different models
7. [Async Hooks](docs/examples/fundamentals/07-async-hooks.md) - Database integration
8. [Error Handling](docs/examples/fundamentals/08-error-handling.md) - Graceful recovery

### 🚀 Advanced

- [Portkey Gateway](docs/examples/advanced/01-portkey.md) - Rate limit protection & caching
- [Production Quickstart](docs/examples/fundamentals/00-quickstart.md) - Complete production workflow

### 🔧 API Reference

- [Configuration](docs/api/configuration.md) - Engine config options
- [Lifecycle Hooks](docs/api/hooks.md) - All 18 hooks explained
- [Type Definitions](docs/api/types.md) - TypeScript interfaces

---

## 🌐 Supported Providers

| Provider | Description | Best For | Docs |
|----------|-------------|----------|------|
| **Anthropic** | Claude models for reasoning and analysis | Complex tasks, deep reasoning | [Docs](https://docs.anthropic.com/) |
| **OpenAI** | GPT models for general-purpose tasks | Fast responses, versatile workflows | [Docs](https://platform.openai.com/docs) |
| **Google Gemini** | Gemini models for high-speed processing | High throughput, multimodal inputs | [Docs](https://ai.google.dev/docs) |

**Mix and match:** Route different dimensions to different providers in the same workflow.
```typescript
selectProvider(dimension) {
  if (dimension === 'quality_check') {
    return { provider: 'gemini', options: { model: 'gemini-1.5-flash' } };
  }
  if (dimension === 'deep_analysis') {
    return { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } };
  }
}
```

---

## 🔄 Gateway Support

dagengine supports **Portkey** as a unified AI gateway for advanced features:

| Feature | Direct Mode | With Portkey Gateway |
|---------|-------------|---------------------|
| **Automatic Retries** | ✅ Engine-level | ✅ Gateway-level with smart backoff |
| **Rate Limit Handling** | ⚠️ Manual | ✅ Automatic with queuing |
| **Semantic Caching** | ❌ | ✅ Reduce costs and latency |
| **Load Balancing** | ❌ | ✅ Multi-provider routing |
| **Observability** | ✅ Basic | ✅ Full dashboard & analytics |

**Enable Portkey:**
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

**Learn more:** [Portkey Integration Guide](docs/examples/advanced/01-portkey.md) • [Portkey Docs](https://docs.portkey.ai/)

---

## 📦 Configuration
```typescript
const engine = new DagEngine({
  plugin: new MyPlugin(),
  
  // Provider credentials
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }
  },
  
  // Execution settings
  execution: {
    concurrency: 10,        // Max parallel operations
    maxRetries: 3,          // Retry attempts
    retryDelay: 1000,       // Base delay (ms)
    timeout: 60000,         // Default timeout
    continueOnError: true   // Process partial results
  },
  
  // Cost tracking
  pricing: {
    models: {
      'claude-sonnet-4-5-20250929': {
        inputPer1M: 3.00,
        outputPer1M: 15.00
      }
    }
  },
  
  // Progress display
  progressDisplay: {
    display: 'bar',         // 'simple' | 'bar' | 'multi' | 'none'
    showDimensions: true
  }
});
```

---

## 🛠️ Development
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

# Run all checks
npm run validate
```

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Quick Start

1. **Fork the repository** on GitHub
2. **Clone your fork**: `git clone https://github.com/YOUR_USERNAME/dagengine.git`
3. **Create a branch**: `git checkout -b feature/your-feature-name`
4. **Make your changes** and add tests
5. **Run validation**: `npm run validate`
6. **Commit**: `git commit -m "feat: add your feature"`
7. **Push**: `git push origin feature/your-feature-name`
8. **Open a Pull Request** on GitHub

### Development Guidelines

- **Code Style**: We use Prettier and ESLint (run `npm run format && npm run lint:fix`)
- **Tests**: Add tests for new features (run `npm test`)
- **Types**: Maintain full TypeScript coverage (run `npm run type-check`)
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) format

### Need Help?

- 💬 [Start a discussion](https://github.com/dagengine/dagengine/discussions)
- 🐛 [Report a bug](https://github.com/dagengine/dagengine/issues/new)
- 💡 [Request a feature](https://github.com/dagengine/dagengine/issues/new)

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 💬 Community & Support

### 🙋 Need Help?

1. **📖 Check the docs** - [Documentation](https://www.dagengine.ai/guide/quick-start.html)
2. **🔍 Search existing Q&A** - [GitHub Discussions](https://github.com/dagengine/dagengine/discussions/categories/q-a)
3. **💬 Ask a question** - [Start a discussion](https://github.com/dagengine/dagengine/discussions/new?category=q-a)
4. **🐛 Found a bug?** - [Open an issue](https://github.com/dagengine/dagengine/issues/new)

### 🚀 Stay Updated

- 📦 [npm Package](https://www.npmjs.com/package/@dagengine/core) - Install and updates
- ⭐ [GitHub](https://github.com/dagengine/dagengine) - Star for updates
- 💬 [Discussions](https://github.com/dagengine/dagengine/discussions) - Feature requests, Q&A

---

## 🔒 Security

We take security seriously. See [SECURITY.md](SECURITY.md) for our security policy.

### Reporting Vulnerabilities

**Never report security issues through public GitHub issues.**

Use GitHub's [private vulnerability reporting](https://github.com/dagengine/dagengine/security/advisories/new) or email the maintainers directly.

---

## 📜 License

**Apache License 2.0** © dagengine contributors

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for the full license text.

### Patent Protection

This license includes an explicit patent grant (Section 3), protecting users from patent litigation. See [LICENSE](./LICENSE#L180) for details.

---

## 🙏 Acknowledgments

Built with:
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [@dagrejs/graphlib](https://github.com/dagrejs/graphlib) - DAG algorithms
- [p-queue](https://github.com/sindresorhus/p-queue) - Concurrency control

---

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/dagengine/dagengine?style=social)
![npm downloads](https://img.shields.io/npm/dm/@dagengine/core?style=flat)
![GitHub issues](https://img.shields.io/github/issues/dagengine/dagengine)
![GitHub pull requests](https://img.shields.io/github/issues-pr/dagengine/dagengine)
![GitHub contributors](https://img.shields.io/github/contributors/dagengine/dagengine)

---

## 🔗 Links

- 🌐 **Homepage**: [dagengine.ai](https://dagengine.ai)
- 📖 **Documentation**: [https://www.dagengine.ai/guide/quick-start.html](https://www.dagengine.ai/guide/quick-start.html)
- 📦 **npm Package**: [@dagengine/core](https://www.npmjs.com/package/@dagengine/core)
- 💬 **Community**: [GitHub Discussions](https://github.com/dagengine/dagengine/discussions)
- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/dagengine/dagengine/issues)
- 🔐 **Security**: [Security Policy](SECURITY.md)

---

<div align="center">

**⭐ Star us on GitHub — it helps the project grow!**

Made with ❤️ by the dagengine community

[⬆ Back to Top](#dagenginecore)

</div>