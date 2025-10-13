---
title: Core Concepts
description: Understand sections, dimensions, and dependencies
---

# Core Concepts

Three core concepts: **Sections**, **Dimensions**, and **Dependencies**.

## Sections

Sections are the data you want to process.

```typescript
const sections = [
  { 
    content: 'Your text here', 
    metadata: { id: 1 } 
  },
  { 
    content: 'More text', 
    metadata: { id: 2 } 
  }
];
```

**Structure:**
```typescript
interface SectionData {
  content: string;                 // Text to process
  metadata: Record<string, any>;   // Additional data
}
```

Sections can be reviews, emails, paragraphs, or any text-based data.

## Dimensions

Dimensions are analysis tasks.

```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('my-plugin', 'My Plugin', 'Description');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }
}
```

### Section Dimensions

Process each section independently in parallel:

```typescript
this.dimensions = ['sentiment', 'topics'];

// Each section processed separately:
// Section 1 → sentiment + topics
// Section 2 → sentiment + topics
// Section 3 → sentiment + topics
```

### Global Dimensions

Process all sections together:

```typescript
this.dimensions = [
  { name: 'categorize', scope: 'global' }
];

// All sections processed together:
// Sections 1-3 → categorize once
```

### Mixed Mode

Combine both:

```typescript
this.dimensions = [
  'sentiment',                              // Section (parallel)
  { name: 'overall_tone', scope: 'global' } // Global (once)
];
```

## Dependencies

Dependencies define execution order.

### Parallel Execution

No dependencies = parallel execution:

```typescript
defineDependencies() {
  return {
    sentiment: [],
    topics: []
  };
}

// Execution: sentiment and topics in parallel
```

### Sequential Execution

With dependencies = ordered execution:

```typescript
defineDependencies() {
  return {
    sentiment: [],
    summary: ['sentiment']  // Waits for sentiment
  };
}

// Execution: sentiment → summary
```

### DAG Execution

Multiple dependencies create a graph:

```typescript
defineDependencies() {
  return {
    sentiment: [],
    topics: [],
    summary: ['sentiment', 'topics']  // Waits for both
  };
}

// Execution:
//   sentiment ↘
//              summary
//   topics   ↗
```

## Dependency Access

Each dimension receives results from its dependencies:

```typescript
createPrompt(context) {
  if (context.dimension === 'summary') {
    // Access dependency results
    const sentiment = context.dependencies.sentiment.data;
    const topics = context.dependencies.topics.data;
    
    return `Summarize with context:
      Sentiment: ${sentiment.sentiment}
      Topics: ${topics.topics.join(', ')}
      Content: ${context.sections[0].content}`;
  }
}
```

### Section Dependencies

Section dimensions receive that section's dependency results:

```typescript
// This section's sentiment result
const sentiment = context.dependencies.sentiment.data;
```

### Global Dependencies

Global dimensions receive aggregated results from section dimensions:

```typescript
// All sections' sentiment results
const allSentiments = context.dependencies.sentiment.data.sections;
```

## Complete Example

```typescript
class ContentAnalysis extends Plugin {
  dimensions = [
    'sentiment',
    'topics',
    'summary'
  ];

  defineDependencies() {
    return {
      sentiment: [],
      topics: [],
      summary: ['sentiment', 'topics']
    };
  }

  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract topics: "${context.sections[0].content}"
      Return JSON: {"topics": ["topic1", "topic2"]}`;
    }
    
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment.data;
      const topics = context.dependencies.topics.data;
      
      return `Create ${sentiment.sentiment} summary about ${topics.topics.join(', ')}:
      "${context.sections[0].content}"`;
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

**Execution:**
```
sentiment + topics (parallel)
       ↓
    summary (uses both results)
```

## Section Transformations

Global dimensions can restructure the section array:

```typescript
class CategoryPlugin extends Plugin {
  dimensions = [
    { name: 'classify', scope: 'section' },
    { name: 'group', scope: 'global' },
    { name: 'analyze', scope: 'section' }
  ];

  defineDependencies() {
    return {
      group: ['classify'],
      analyze: ['group']
    };
  }

  transformSections(context) {
    if (context.dimension === 'group') {
      // Transform: 100 items → 5 categories
      const categories = context.result.data.categories;
      
      return categories.map(cat => ({
        content: cat.items.join('\n'),
        metadata: { category: cat.name }
      }));
    }
  }

  createPrompt(context) {
    if (context.dimension === 'classify') {
      return `Classify: "${context.section.content}"`;
    }
    
    if (context.dimension === 'group') {
      const items = context.dependencies.classify.data.sections;
      return `Group ${items.length} items into categories`;
    }
    
    if (context.dimension === 'analyze') {
      return `Analyze ${context.section.metadata.category} category:
      ${context.section.content}`;
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

// Input: 100 items
// After classify: 100 sections with categories
// After group + transform: 5 merged category sections
// After analyze: 5 category analyses (not 100!)
```

**Execution:**
```
1. classify: 100 items (parallel)
2. group: Categorizes all items
3. transform: 100 sections → 5 category sections
4. analyze: 5 categories (parallel)
```

## Processing Flow

### Section Processing

```typescript
const sections = [
  { content: 'Text 1', metadata: {} },
  { content: 'Text 2', metadata: {} },
  { content: 'Text 3', metadata: {} }
];

const result = await engine.process(sections);

// Access results per section
result.sections[0].results.sentiment
result.sections[1].results.sentiment
result.sections[2].results.sentiment
```

### Global Processing

```typescript
this.dimensions = [
  { name: 'themes', scope: 'global' }
];

const result = await engine.process(sections);

// Access global result
result.globalResults.themes  // Result for all sections combined
```

## Key Points

**Sections:** Data to process  
**Dimensions:** Tasks to perform  
**Dependencies:** Execution order  
**Section scope:** Process each independently (parallel)  
**Global scope:** Process all together (once)  
**Transformations:** Restructure sections mid-pipeline  
**Dependency access:** Each dimension receives previous results

---

## Examples

### Simple Analysis

```typescript
class Simple extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

### With Dependencies

```typescript
class WithDeps extends Plugin {
  dimensions = ['entities', 'summary'];
  
  defineDependencies() {
    return { summary: ['entities'] };
  }
  
  createPrompt(context) {
    if (context.dimension === 'entities') {
      return `Extract entities: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'summary') {
      const entities = context.dependencies.entities.data;
      return `Summarize focusing on: ${entities.join(', ')}`;
    }
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

### Mixed Scopes

```typescript
class Mixed extends Plugin {
  dimensions = [
    'sentiment',
    { name: 'overall', scope: 'global' }
  ];
  
  defineDependencies() {
    return { overall: ['sentiment'] };
  }
  
  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'overall') {
      const allResults = context.dependencies.sentiment.data.sections;
      return `Overall analysis from ${allResults.length} items`;
    }
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

## Next Steps

- [Quick Start](/guide/quick-start) - Build your first workflow
- [Dependencies Guide](/guide/dependencies) - Advanced dependency patterns
- [Cost Optimization](/guide/cost-optimization) - Reduce API costs
- [Examples](/guide/examples) - Real-world workflows
- [API Reference](/api/engine) - Complete API
