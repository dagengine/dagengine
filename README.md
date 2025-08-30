# DagEngine

Process text through AI analysis dimensions with dependency management.

## Install

```bash
npm install dag-engine
```

## Quick Start

```typescript
import { DagEngine, BasePlugin } from 'dag-engine';

// Create your plugin
class MyPlugin extends BasePlugin {
  constructor() {
    super();
    this.id = 'my-plugin';
    this.name = 'My Analysis Plugin';
    this.description = 'Analyzes sentiment and creates summaries';
  }

  getDimensions() {
    return ['sentiment', 'summary'];
  }

  createDimensionPrompt(section, dimension, dependencies = {}) {
    if (dimension === 'sentiment') {
      return `What's the sentiment of: ${section.content}`;
    }
    if (dimension === 'summary') {
      return `Summarize: ${section.content}`;
    }
    throw new Error(`Unknown dimension: ${dimension}`);
  }

  getAIConfigForDimension(dimension, section) {
    return { 
      provider: 'openai', 
      model: 'gpt-4',
      temperature: 0.1,
      maxTokens: 1000
    };
  }

  getDimensionDependencyGraph() {
    return {
      'sentiment': [],        // no dependencies
      'summary': ['sentiment'] // summary depends on sentiment
    };
  }

  processSectionResultBeforeSave(dimensionResults) {
    // Add metadata to results
    return {
      ...dimensionResults,
      _metadata: {
        processedAt: new Date().toISOString(),
        plugin: this.id
      }
    };
  }
}

// Setup engine
const engine = new DagEngine({
  ai: { openai: { apiKey: 'your-key' } },
  plugin: new MyPlugin()
});

// Process text
const sections = [{
  content: "I love this product!",
  metadata: { id: 1 }
}];

const results = await engine.process(sections);
```

## Core Concepts

### Sections
Text chunks you want to analyze:
```typescript
{
  content: "Your text here",
  metadata: { id: 1, source: 'email' }
}
```

### Dimensions
Different types of analysis (sentiment, topics, summary, etc.)

### Dependencies
Some dimensions can depend on others:
```typescript
getDimensionDependencyGraph() {
  return {
    'summary': ['sentiment'],  // summary needs sentiment first
    'insights': ['summary']    // insights needs summary first
  };
}
```

## AI Providers

Supports OpenAI, Anthropic, and Google Gemini:

```typescript
const engine = new DagEngine({
  ai: {
    openai: { apiKey: 'sk-...' },
    anthropic: { apiKey: 'sk-ant-...' },
    gemini: { apiKey: 'AIza...' }
  },
  plugin: new MyPlugin()
});
```

Choose provider per dimension:
```typescript
getAIConfigForDimension(dimension, section) {
  if (dimension === 'sentiment') {
    return { provider: 'openai', model: 'gpt-4' };
  }
  if (dimension === 'summary') {
    return { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' };
  }
  return { provider: 'openai' }; // fallback
}
```

## Configuration

```typescript
new DagEngine({
  ai: { /* provider configs */ },
  plugin: new YourPlugin(),
  concurrency: 3,     // process 3 sections at once
  maxRetries: 2,      // retry failed requests 
  retryDelay: 1000    // wait 1s between retries
})
```

## Plugin Methods

### Required
- `getDimensions()` - return list of analysis types
- `createDimensionPrompt(section, dimension)` - create AI prompt
- `getAIConfigForDimension(dimension)` - choose AI provider/model

### Optional
- `getDimensionDependencyGraph()` - define dependencies
- `processSectionResultBeforeSave(results)` - modify final results

## Progress Tracking

```typescript
await engine.process(sections, {
  onSectionComplete: (index, result) => {
    console.log(`Done with section ${index}`);
  },
  onError: (index, error) => {
    console.log(`Error in section ${index}:`, error.message);
  }
});
```

## License

MIT