---
title: Core Concepts
description: Understand sections, dimensions, dependencies and transformations
---

# Core Concepts

Master the four core concepts of dag-ai: **Sections**, **Dimensions**, **Dependencies** and **transformations**.

## Sections

**Sections** are the pieces of data you want to analyze.

### Structure

```typescript
interface SectionData {
  content: string;                    // The text to analyze
  metadata: Record<string, unknown>;  // Any additional data
}
```

### Example

```typescript
const sections = [
  { 
    content: 'This product exceeded my expectations!',
    metadata: { 
      id: 'review-001',
      userId: 12345,
      productId: 'SKU-789',
      timestamp: '2024-01-15'
    }
  },
  { 
    content: 'Shipping was slow but product is good.',
    metadata: { 
      id: 'review-002',
      userId: 67890,
      productId: 'SKU-789',
      timestamp: '2024-01-16'
    }
  }
];
```

**Think of sections as:**
- Customer reviews
- Email messages
- Document paragraphs
- Social media posts
- Support tickets
- Any text-based data you want to analyze

## Dimensions

**Dimensions** are the analyses you want to perform on your sections.

### Simple Definition

```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('my-plugin', 'My Plugin', 'Description');
    
    // Define what analyses to run
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }
}
```

Each dimension becomes an analysis task. With 3 dimensions and 10 sections, you get **30 total analyses** (3 per section).

## Two Types of Dimensions

### Section Dimensions (Default)

Process **each section independently** in parallel.

```typescript
this.dimensions = ['sentiment', 'topics'];
```

**Execution:**
```
Section 1 → sentiment + topics
Section 2 → sentiment + topics  } All in parallel
Section 3 → sentiment + topics
```

**When to use:**
- Analyzing individual items
- Per-document analysis
- Independent processing

**Result location:**
```typescript
result.sections[0].results.sentiment  // Section 1's sentiment
result.sections[1].results.sentiment  // Section 2's sentiment
```

### Global Dimensions

Process **all sections together** as one batch.

```typescript
this.dimensions = [
  { name: 'categorize', scope: 'global' }
];
```

**Execution:**
```
All sections → categorize (once)
```

**When to use:**
- Cross-document analysis
- Grouping/categorization
- Aggregation tasks
- Comparison across sections

**Result location:**
```typescript
result.globalResults.categorize  // One result for all sections
```

### Mixed Mode

Combine both types:

```typescript
this.dimensions = [
  'sentiment',                              // Section: runs per-section
  'topics',                                 // Section: runs per-section
  { name: 'overall_tone', scope: 'global' } // Global: runs once for all
];
```

**Execution:**
```
┌─────────────────────────────────────┐
│  Section Dimensions (Parallel)      │
├─────────────────────────────────────┤
│  Section 1 → sentiment + topics     │
│  Section 2 → sentiment + topics     │  } All at once
│  Section 3 → sentiment + topics     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Global Dimensions                  │
├─────────────────────────────────────┤
│  All sections → overall_tone        │
└─────────────────────────────────────┘
```

## Dependencies

**Dependencies** control the order of execution. By default, all dimensions run in parallel.

### No Dependencies = Parallel

```typescript
defineDependencies() {
  return {
    sentiment: [],  // No dependencies
    topics: []      // No dependencies
  };
}
```

**Execution:**
```
sentiment ──┐
            ├── Both run simultaneously
topics ─────┘
```

**Duration:** `max(sentiment, topics)` ≈ 3 seconds

### With Dependencies = Sequential

```typescript
defineDependencies() {
  return {
    sentiment: [],           // Runs first (no dependencies)
    summary: ['sentiment']   // Waits for sentiment
  };
}
```

**Execution:**
```
sentiment → summary
```

**Duration:** `sentiment + summary` ≈ 6 seconds

---

### DAG (Directed Acyclic Graph)

Multiple dependencies create a graph:

```typescript
defineDependencies() {
  return {
    sentiment: [],
    topics: [],
    entities: [],
    summary: ['sentiment', 'topics', 'entities']  // Waits for all three
  };
}
```

**Execution:**
```
sentiment ──┐
topics ─────┼── All three parallel → summary
entities ───┘
```

**Duration:** `max(sentiment, topics, entities) + summary` ≈ 5 seconds

**Key insight:** Parallel execution where possible, sequential only when needed.

## Accessing Dependency Results

### In Section Dimensions

Each section gets its **own** dependency results:

```typescript
createPrompt(context) {
  if (context.dimension === 'summary') {
    // Access THIS section's sentiment result
    const sentiment = context.dependencies.sentiment.data;
    
    return `Create a ${sentiment.sentiment} summary of:
    "${context.sections[0].content}"`;
  }
}
```

**Context structure:**
```typescript
interface PromptContext {
  sections: SectionData[];           // Current section(s)
  dimension: string;                 // Current dimension name
  dependencies: DimensionDependencies;  // Results from dependencies
  isGlobal: boolean;                 // false for section, true for global
}
```

**Dependency data structure:**
```typescript
context.dependencies = {
  sentiment: {
    data: { sentiment: 'positive', score: 0.95 },
    metadata: { provider: 'anthropic', model: '...' }
  },
  topics: {
    data: { topics: ['feature', 'quality'] },
    metadata: { ... }
  }
}
```

### In Global Dimensions

Global dimensions get **aggregated** section results:

```typescript
createPrompt(context) {
  if (context.dimension === 'overall_tone') {
    // Access ALL sections' sentiment results
    const allSentiments = context.dependencies.sentiment.data;
    
    // Structure:
    // {
    //   sections: [
    //     { data: { sentiment: 'positive', score: 0.95 } },
    //     { data: { sentiment: 'negative', score: 0.2 } },
    //     { data: { sentiment: 'neutral', score: 0.5 } }
    //   ],
    //   aggregated: true,
    //   totalSections: 3
    // }
    
    const sentiments = allSentiments.sections.map(s => s.data.sentiment);
    
    return `Given these sentiments: ${sentiments.join(', ')}
    What is the overall tone?`;
  }
}
```

**Key difference:**
- **Section dimension:** `context.dependencies.sentiment.data` = single result
- **Global dimension:** `context.dependencies.sentiment.data.sections` = array of results

## Complete Example: Multi-Step Analysis

```typescript
class ContentAnalysis extends Plugin {
  constructor() {
    super('content-analysis', 'Content Analysis', 'Analyzes content');
    
    this.dimensions = [
      'sentiment',   // Section: analyze each review
      'topics',      // Section: extract topics from each
      'summary'      // Section: summarize each using sentiment + topics
    ];
  }

  defineDependencies() {
    return {
      sentiment: [],              // Run first (parallel)
      topics: [],                 // Run first (parallel)
      summary: ['sentiment', 'topics']  // Wait for both
    };
  }

  createPrompt(context) {
    const section = context.sections[0];
    
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${section.content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract main topics: "${section.content}"
      Return JSON: {"topics": ["topic1", "topic2", "topic3"]}`;
    }
    
    if (context.dimension === 'summary') {
      // Access results from both dependencies
      const sentiment = context.dependencies.sentiment.data;
      const topics = context.dependencies.topics.data;
      
      return `Create a ${sentiment.sentiment}-toned summary about ${topics.topics.join(', ')}:
      "${section.content}"
      
      Return JSON: {"summary": "brief summary here"}`;
    }
  }

  selectProvider() {
    return { 
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}

// Usage
const engine = new DagEngine({
  plugin: new ContentAnalysis(),
  providers: { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } }
});

const result = await engine.process([
  { content: 'I love this product! Great features and quality.', metadata: {} }
]);

// Access results
const section = result.sections[0];

console.log('Sentiment:', section.results.sentiment.data);
// { sentiment: 'positive', score: 0.95 }

console.log('Topics:', section.results.topics.data);
// { topics: ['features', 'quality'] }

console.log('Summary:', section.results.summary.data);
// { summary: 'An enthusiastic review highlighting features and quality' }
```

**Execution flow:**
```
Step 1 (Parallel):
  sentiment ──┐
              ├── Both run simultaneously on the review
  topics ─────┘

Step 2 (Sequential):
  summary (uses sentiment + topics)
```

## Section Transformations

**Advanced feature:** Global dimensions can restructure the sections array mid-pipeline.

### The Problem

You have 100 product reviews and want to:
1. Classify each review by category (electronics, books, clothing)
2. Group reviews by category
3. Analyze each category (not each individual review)

Without transformations: **100 analyses** in step 3  
With transformations: **3 analyses** in step 3 ✨

### How It Works

```typescript
class CategoryPlugin extends Plugin {
  dimensions = [
    { name: 'classify', scope: 'section' },      // Per-review
    { name: 'group_by_category', scope: 'global' },  // All reviews
    { name: 'analyze_category', scope: 'section' }   // Per-category
  ];

  defineDependencies() {
    return {
      group_by_category: ['classify'],      // Group needs classifications
      analyze_category: ['group_by_category']  // Analyze needs groups
    };
  }

  createPrompt(context) {
    if (context.dimension === 'classify') {
      return `Classify: "${context.sections[0].content}"
      Return JSON: {"category": "electronics|books|clothing"}`;
    }
    
    if (context.dimension === 'group_by_category') {
      // Get all classifications
      const items = context.dependencies.classify.data.sections;
      
      return `Group these ${items.length} items by category.
      Return JSON: {
        "categories": [
          {"name": "electronics", "items": [...]},
          {"name": "books", "items": [...]},
          {"name": "clothing", "items": [...]}
        ]
      }`;
    }
    
    if (context.dimension === 'analyze_category') {
      // Now analyzing merged category
      return `Analyze this ${context.sections[0].metadata.category} category:
      ${context.sections[0].content}
      
      Return insights about this category.`;
    }
  }

  // ⭐ Transform sections after grouping
  transformSections(context) {
    if (context.dimension === 'group_by_category') {
      const categories = context.result.data.categories;
      
      // Transform: 100 items → 3 categories
      return categories.map(cat => ({
        content: cat.items.join('\n'),
        metadata: { 
          category: cat.name,
          count: cat.items.length 
        }
      }));
    }
    
    // For other dimensions, return sections unchanged
    return context.currentSections;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

### Transformation Lifecycle

```
Input: 100 reviews
↓
Step 1: classify (section dimension)
  → 100 reviews analyzed in parallel
  → Each review gets a category
↓
Step 2: group_by_category (global dimension)
  → Processes all 100 classifications at once
  → Returns 3 category groups
↓
⭐ TRANSFORMATION HAPPENS HERE
  → 100 sections become 3 sections (one per category)
  → Original 100 section results are CLEARED
↓
Step 3: analyze_category (section dimension)
  → 3 category sections analyzed in parallel
  → NOT 100 individual reviews!
```

**Important:** After transformation:
- Section count changes (100 → 3)
- Section results from before transformation are cleared
- Only results AFTER transformation persist
- You analyze the NEW sections, not the old ones

---

### What Gets Preserved?

```typescript
const result = await engine.process(reviews);

// ✅ Available: Final transformed sections
result.transformedSections  // 3 category sections

// ✅ Available: Global dimension results
result.globalResults.group_by_category  // Still has the grouping data

// ✅ Available: Results from AFTER transformation
result.sections[0].results.analyze_category  // Category analysis

// ❌ Lost: Original 100 section results
// result.sections[0].results.classify is NOT available
// (unless you save it in the global dimension or metadata,
// or even in global state of the plugin)
```

**To preserve original data:**
```typescript
transformSections(context) {
  if (context.dimension === 'group_by_category') {
    const categories = context.result.data.categories;
    
    // Save original classifications in global result
    context.result.metadata.originalClassifications = 
      context.dependencies.classify.data.sections;
    
    return categories.map(cat => ({
      content: cat.items.join('\n'),
      metadata: { category: cat.name }
    }));
  }
}
```

Then access via:
```typescript
result.globalResults.group_by_category.metadata.originalClassifications
```

## Execution Order Summary

### Parallel Execution (Default)

```typescript
dimensions = ['A', 'B', 'C'];
// No dependencies = all parallel
```

```
A ──┐
B ──┼── All simultaneous
C ──┘
```

### Sequential Execution

```typescript
defineDependencies() {
  return {
    A: [],
    B: ['A'],
    C: ['B']
  };
}
```

```
A → B → C
```

### Mixed Execution

```typescript
defineDependencies() {
  return {
    A: [],
    B: [],
    C: ['A', 'B']
  };
}
```

```
A ──┐
    ├── Parallel → C
B ──┘
```

### Complex DAG

```typescript
defineDependencies() {
  return {
    A: [],
    B: [],
    C: ['A'],
    D: ['A', 'B'],
    E: ['C', 'D']
  };
}
```

```
    A ──┬→ C ──┐
        │      ├→ E
        └→ D ──┘
           ↑
    B ─────┘
```

**Execution groups:**
1. A, B (parallel)
2. C, D (parallel, wait for A, B)
3. E (waits for C, D)

## Key Takeaways

### Sections
✅ Your input data  
✅ Each has `content` and `metadata`  
✅ Can be any text-based data

### Dimensions
✅ The analyses you run  
✅ **Section scope** = per-item (parallel)  
✅ **Global scope** = all items together (once)  
✅ Mix both types freely

### Dependencies
✅ Control execution order  
✅ No dependencies = parallel  
✅ With dependencies = sequential  
✅ Forms a DAG for optimal scheduling

### Transformations
✅ Global dimensions can restructure sections  
✅ Changes section count mid-pipeline  
✅ Clears previous section results  
✅ Useful for grouping/filtering

## Next Steps

**Ready to master dependencies?**
- [Dependencies Guide](/guide/dependencies) - Advanced dependency patterns and optimization

**Want to see real examples?**
- [Examples](/guide/examples) - Complete workflows with real use cases

**Need to handle errors?**
- [Error Handling](/guide/error-handling) - Retries, fallbacks, and graceful degradation

**Want to optimize costs?**
- [Skip Logic](/guide/skip-logic) - Skip unnecessary processing

## Related

- [Quick Start](/guide/quick-start) - Build your first workflow
- [API Reference](/api/engine) - Configuration options
- [Lifecycle Hooks](/lifecycle/hooks) - Extension points

Ready for the next page?