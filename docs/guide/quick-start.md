---
title: Quick Start
description: Build your first AI workflow in 5 minutes
---

# Quick Start

Get started with dagengine in 5 minutes. Build a simple sentiment analysis workflow.

## Installation

::: code-group

```bash [npm]
npm install @dagengine/dagengine
```

```bash [yarn]
yarn add @dagengine/dagengine
```

```bash [pnpm]
pnpm add @dagengine/dagengine
```

:::

## Your First Workflow

Let's analyze the sentiment of customer reviews.

### Step 1: Set Your API Key

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

Get your API key from [Anthropic Console](https://console.anthropic.com/).

### Step 2: Create a Plugin

A **plugin** defines what analyses to run. Here's a simple sentiment analyzer:

```typescript
import { Plugin } from '@dagengine/dagengine';

class SentimentPlugin extends Plugin {
  constructor() {
    super(
      'sentiment',              // Plugin ID
      'Sentiment Analyzer',     // Plugin name  
      'Analyzes text sentiment' // Description
    );
    
    // Define what to analyze
    this.dimensions = ['sentiment'];
  }

  // Build the AI prompt
  createPrompt(context) {
    return `Analyze the sentiment of this text: "${context.sections[0].content}"
    
    Return JSON:
    {
      "sentiment": "positive" | "negative" | "neutral",
      "score": 0.0 to 1.0,
      "reasoning": "brief explanation"
    }`;
  }

  // Choose which AI provider to use
  selectProvider() {
    return { 
      provider: 'anthropic',
      options: {
        model: 'claude-sonnet-4-5-20250929',
        temperature: 0.1
      }
    };
  }
}
```

**What's happening:**
- `dimensions` - What analyses to perform (just sentiment for now)
- `createPrompt()` - The prompt sent to the AI
- `selectProvider()` - Which AI service to use (Anthropic's Claude)

### Step 3: Create the Engine

The **engine** runs your plugin on your data:

```typescript
import { DagEngine } from '@dagengine/dagengine';

const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```

### Step 4: Process Your Data

```typescript
const reviews = [
  { content: 'This product is amazing! Love it!', metadata: { id: 1 } },
  { content: 'Terrible quality. Very disappointed.', metadata: { id: 2 } },
  { content: 'It works as expected.', metadata: { id: 3 } }
];

const result = await engine.process(reviews);

// Access results
result.sections.forEach((section, i) => {
  const sentiment = section.results.sentiment.data;
  
  console.log(`Review ${i + 1}:`, sentiment.sentiment);
  console.log(`Score:`, sentiment.score);
  console.log(`Reasoning:`, sentiment.reasoning);
  console.log('---');
});
```

**Output:**
```
Review 1: positive
Score: 0.95
Reasoning: Enthusiastic language with words like "amazing" and "love"
---
Review 2: negative
Score: 0.15
Reasoning: Strong negative words like "terrible" and "disappointed"
---
Review 3: neutral
Score: 0.5
Reasoning: Factual statement without emotional language
---
```

## Complete Example

Here's the full code in one place:

```typescript
import { DagEngine, Plugin } from '@dagengine/dagengine';

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
  { content: 'I love this!', metadata: {} }
]);

console.log(result.sections[0].results.sentiment.data);
// { sentiment: 'positive', score: 0.95 }
```

## Understanding the Results

The `process()` method returns:

```typescript
{
  sections: [
    {
      section: { content: '...', metadata: {...} },
      results: {
        sentiment: {
          data: { sentiment: 'positive', score: 0.95 },
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5-20250929',
            tokens: { inputTokens: 45, outputTokens: 12, totalTokens: 57 }
          }
        }
      }
    }
  ],
  globalResults: {},
  transformedSections: [...]
}
```

**Key parts:**
- `sections` - Results for each input section
- `results.sentiment.data` - Your analysis result
- `results.sentiment.metadata` - Provider info and token usage

## What's Next?

You've learned the basics! Now explore:

### Multiple Analyses
Run several analyses in parallel:
```typescript
this.dimensions = ['sentiment', 'topics', 'language'];
```

### Dependencies
Make one analysis depend on another:
```typescript
defineDependencies() {
  return { summary: ['sentiment', 'topics'] };
}
```

### Error Handling
Add fallback providers and retry logic:
```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    fallbacks: [
      { provider: 'openai' },
      { provider: 'gemini' }
    ]
  };
}
```

### Cost Optimization
Skip unnecessary processing:
```typescript
shouldSkipSectionDimension(context) {
  return context.section.content.length < 50;
}
```

## Common Issues

### "Provider not found"

**Problem:**
```typescript
const engine = new DagEngine({
  plugin: new SentimentPlugin(),
  providers: {}  // ❌ Empty!
});
```

**Solution:**
```typescript
providers: {
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
}
```

### "API key not set"

**Problem:**
```
Error: Anthropic API key is required
```

**Solution:**
```bash
# Set environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Or use .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

### Result is undefined

**Problem:**
```typescript
console.log(result.sections[0].results.sentiment);
// undefined
```

**Cause:** Dimension name mismatch

**Solution:**
```typescript
// Plugin dimension name must match
this.dimensions = ['sentiment'];  // ✅

// Access with same name
result.sections[0].results.sentiment  // ✅
```
