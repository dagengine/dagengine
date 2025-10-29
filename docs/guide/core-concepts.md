---
title: Core Concepts
description: Understand sections, dimensions, dependencies and transformations
---

# Core Concepts

> **TL;DR** - dag-engine processes your data (sections) through multiple analyses (dimensions) in parallel. Use dependencies to control order when needed. Use transformations to restructure data mid-pipeline.
>
> **Read time:** ~15 minutes

Master the four core concepts of dag-engine: **Sections**, **Dimensions**, **Dependencies**, and **Transformations**.

## Quick Overview

| Concept | What It Is | When to Use |
|---------|-----------|-------------|
| **Sections** | Your input data (reviews, emails, docs) | Always - this is what you analyze |
| **Dimensions** | The analyses you run (sentiment, topics) | Define what insights you want |
| **Dependencies** | Control execution order (A before B) | When results depend on each other |
| **Transformations** | Restructure sections mid-pipeline | Group, filter, or merge data |

## How It All Fits Together

```
Input Data              Dimensions              Results
────────────           ──────────────          ────────────

[Review 1] ─┐
[Review 2] ─┤          sentiment ──┐           [Review 1]
[Review 3] ─┼────────▶ topics ─────┼──────────▶ ├─ sentiment
    ...     │          entities ───┘            ├─ topics
[Review N] ─┘               │                   ├─ entities
                            ▼                   └─ summary
                         summary
                    (waits for all)            [Review 2]
                                                ├─ sentiment
                                                ├─ topics
                                                ├─ entities
                                                └─ summary
                                                   ...
```

**The key insight:** All sections flow through all dimensions in parallel. When dimensions have dependencies (like `summary` waiting for `sentiment`, `topics`, and `entities`), they execute sequentially only where needed.

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

### Choosing: Section vs Global

```
Need to analyze items?
│
├─ Items are independent?
│  └─ YES → Section Dimensions
│     "For each review, analyze sentiment"
│
└─ NO → Need to compare/group across items?
   └─ YES → Global Dimensions
      "Looking at all reviews, find common themes"
```

**Rule of thumb:**
- **Section:** "For each X, do Y"
- **Global:** "Looking at all X, do Y"

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
  sections: SectionData[];              // Current section(s)
  dimension: string;                    // Current dimension name
  dependencies: DimensionDependencies;  // Results from dependencies
  isGlobal: boolean;                    // false for section, true for global
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

## Putting It Together

Here's how these concepts work together in a real workflow:

```typescript
// 1. Define your dimensions
this.dimensions = [
  'sentiment',   // Section: analyze each review
  'topics',      // Section: extract topics from each
  'summary'      // Section: summarize using both
];

// 2. Define dependencies (execution order)
defineDependencies() {
  return {
    sentiment: [],                   // Run first (parallel)
    topics: [],                      // Run first (parallel)
    summary: ['sentiment', 'topics'] // Wait for both
  };
}

// 3. Use dependency results in prompts
createPrompt(context) {
  if (context.dimension === 'summary') {
    // Access results from both dependencies
    const sentiment = context.dependencies.sentiment.data;
    const topics = context.dependencies.topics.data;
    
    return `Create a ${sentiment.sentiment} summary covering these topics: 
    ${topics.topics.join(', ')}
    
    Content: "${context.sections[0].content}"`;
  }
  
  // Other dimensions...
}
```

**Result:**
```typescript
const result = await engine.process(reviews);

result.sections[0].results = {
  sentiment: { sentiment: 'positive', score: 0.95 },
  topics: { topics: ['quality', 'price'] },
  summary: { text: 'Positive review highlighting quality and price...' }
};
```

## Transformations

**Transformations** let you restructure your sections mid-pipeline. This is an advanced feature that changes the data flowing through your workflow.

### Why Transform?

Sometimes you need to:
- **Group** items by category (100 reviews → 5 category groups)
- **Filter** unwanted items (100 reviews → 80 valid reviews)
- **Merge** related sections (10 paragraphs → 3 chapters)
- **Split** large sections (1 document → 5 sections)

### How It Works

Only **global dimensions** can transform sections. Return a new section array from `transformSections()`:

```typescript
class MyPlugin extends Plugin {
  defineDependencies() {
    return {
      classify: [],                          // Classify each review
      group_by_category: ['classify'],       // Group by classification (global)
      analyze_category: ['group_by_category'] // Analyze each group
    };
  }

  transformSections(context) {
    // Only transform after group_by_category dimension
    if (context.dimension === 'group_by_category') {
      const categories = context.result.data.categories;
      
      // Transform: Return NEW sections (one per category)
      return categories.map(category => ({
        content: category.items.join('\n\n'),
        metadata: { 
          category: category.name,
          count: category.items.length 
        }
      }));
    }
    
    // For dimensions that don't transform, return undefined
    return undefined;
  }
}
```

**💡 See the full implementation:** [Transformations Example](/examples/fundamentals/04-transformations)

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
  → Original 100 sections preserved internally for cost tracking
  → New pipeline continues with 3 sections
↓
Step 3: analyze_category (section dimension)
  → 3 category sections analyzed in parallel
  → NOT 100 individual reviews!
```

**Important:** After transformation:
- Section count changes (100 → 3)
- Original section results preserved internally for cost calculation
- New dimensions work with transformed sections
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

// ⚠️  Original section results: Preserved internally for costs
// The engine stores original results for cost calculation
// but result.sections only contains post-transformation data
result.costs  // ✅ Includes costs from BOTH original AND transformed sections
```

**To access original data explicitly:**

Store it in the global dimension's metadata:

```typescript
transformSections(context) {
  if (context.dimension === 'group_by_category') {
    const categories = context.result.data.categories;
    
    // Save original classifications in result metadata
    context.result.metadata = {
      ...context.result.metadata,
      originalClassifications: context.dependencies.classify.data.sections
    };
    
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

### When to Use Transformations

**✅ Good use cases:**
- Grouping items by category/type
- Filtering out unwanted sections
- Merging related sections
- Splitting large sections
- Reordering based on analysis

**❌ Avoid transformations for:**
- Simple data extraction (use metadata instead)
- Calculations that don't change sections
- Operations that can be done in `finalizeResults`

## Common Pitfalls

### ❌ Pitfall 1: Creating Unnecessary Dependencies

```typescript
// BAD: summary doesn't actually need sentiment data
defineDependencies() {
  return {
    sentiment: [],
    summary: ['sentiment']  // ← Creates unnecessary wait time
  };
}

// GOOD: Let them run in parallel
defineDependencies() {
  return {
    sentiment: [],
    summary: []  // ← Both run simultaneously
  };
}
```

**Ask yourself:** "Does dimension B truly need dimension A's result?"

### ❌ Pitfall 2: Using Section Dimensions for Aggregation

```typescript
// BAD: 100 sections = 100 API calls trying to aggregate
this.dimensions = ['find_common_themes'];  // Runs per-section

// GOOD: 100 sections = 1 API call
this.dimensions = [
  { name: 'find_common_themes', scope: 'global' }
];
```

### ❌ Pitfall 3: Transforming Too Late

```typescript
// BAD: Analyze 100 items, then filter to 10
dimensions = [
  'analyze_deeply',      // 100 expensive analyses
  { name: 'filter', scope: 'global' }  // Reduces to 10 (wasted 90)
]

// GOOD: Filter to 10, then analyze
dimensions = [
  { name: 'filter', scope: 'global' },  // Reduces to 10
  'analyze_deeply'       // Only 10 analyses needed
]
```

### ❌ Pitfall 4: Forgetting isGlobal Check

```typescript
// BAD: Crashes on global dimensions
createPrompt(context) {
  const content = context.sections[0].content;  // ← undefined for global!
  return `Analyze: ${content}`;
}

// GOOD: Handle both cases
createPrompt(context) {
  if (context.isGlobal) {
    const allContent = context.sections.map(s => s.content).join('\n');
    return `Analyze all: ${allContent}`;
  }
  return `Analyze: ${context.sections[0].content}`;
}
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

## Performance Best Practices

### 1. Minimize Dependencies

**❌ Bad:** Everything sequential
```typescript
defineDependencies() {
  return {
    A: [],
    B: ['A'],
    C: ['B'],
    D: ['C']
  };
}
// Duration: A + B + C + D = 16 seconds
```

**✅ Good:** Parallel where possible
```typescript
defineDependencies() {
  return {
    A: [],
    B: [],
    C: [],
    D: ['A', 'B', 'C']
  };
}
// Duration: max(A, B, C) + D = 8 seconds
```

### 2. Use Global Dimensions Wisely

**Section dimensions:** Scale with section count (100 sections = 100 API calls)  
**Global dimensions:** Fixed cost (100 sections = 1 API call)

For aggregation tasks, prefer global dimensions:

```typescript
// ❌ Inefficient: 100 API calls to aggregate
dimensions = ['aggregate_per_section']

// ✅ Efficient: 1 API call to aggregate
dimensions = [{ name: 'aggregate_all', scope: 'global' }]
```

### 3. Order Transformations Early

If you're going to filter/reduce sections, do it early:

```typescript
// ✅ Good: Filter early, analyze less
dimensions = [
  { name: 'filter_spam', scope: 'global' },  // 100 → 80 sections
  'sentiment',                                // 80 analyses
  'topics'                                    // 80 analyses
]

// ❌ Bad: Analyze everything, then filter
dimensions = [
  'sentiment',                                // 100 analyses
  'topics',                                   // 100 analyses
  { name: 'filter_spam', scope: 'global' }   // 100 → 80 sections (wasted 20)
]
```

## Quick Reference Cheatsheet

### Dimension Definition

```typescript
// Section dimension (default)
this.dimensions = ['sentiment', 'topics'];

// Global dimension (explicit)
this.dimensions = [
  { name: 'categorize', scope: 'global' }
];

// Mixed
this.dimensions = [
  'sentiment',                              // section
  { name: 'overall_tone', scope: 'global' } // global
];
```

### Dependency Syntax

```typescript
defineDependencies() {
  return {
    A: [],              // No dependencies (runs first)
    B: ['A'],          // Waits for A
    C: ['A', 'B'],     // Waits for both A and B
  };
}
```

### Accessing Results

```typescript
// In section dimensions
context.dependencies.sentiment.data
// → { sentiment: 'positive', score: 0.95 }

// In global dimensions
context.dependencies.sentiment.data.sections
// → [{ data: {...} }, { data: {...} }, ...]
```

### Transformation Return

```typescript
transformSections(context) {
  if (context.dimension === 'group') {
    return [
      { content: '...', metadata: {...} },
      { content: '...', metadata: {...} }
    ];
  }
  return undefined;  // No transformation
}
```

## Key Takeaways

### 🎯 Core Principles

1. **Sections** = Your input data with `content` and `metadata`
2. **Dimensions** = Analyses that run on sections (section or global scope)
3. **Dependencies** = Execution order (parallel by default, sequential when needed)
4. **Transformations** = Restructure sections mid-pipeline (global dimensions only)

### ⚡ Performance Rules

1. **Minimize dependencies** → More parallel execution → Faster processing
2. **Use global for aggregation** → 1 API call instead of N
3. **Transform early** → Filter/reduce before expensive analyses
4. **Think parallel-first** → Only add dependencies when truly needed

### 🔍 Mental Models

**Section Dimensions:** "For each X, do Y"
- Scales with section count
- Results stored per-section
- Perfect for independent analysis

**Global Dimensions:** "Looking at all X, do Y"
- Fixed cost (one execution)
- Results stored globally
- Perfect for aggregation/grouping

**Dependencies:** "Y needs X's result"
- Only use when Y truly depends on X
- Creates sequential execution
- Trade speed for data access

**Transformations:** "Change what sections look like"
- Happens between dimension steps
- Affects all downstream dimensions
- Original sections preserved for costs

## Common Patterns

### Pattern 1: Filter → Analyze

```typescript
dimensions = [
  { name: 'filter', scope: 'global' },  // Remove unwanted items
  'analyze'                              // Analyze remaining items
]
```

### Pattern 2: Classify → Group → Aggregate

```typescript
dimensions = [
  'classify',                            // Classify each item
  { name: 'group', scope: 'global' },   // Group by classification
  'analyze_group'                        // Analyze each group
]
```

### Pattern 3: Extract → Aggregate → Summarize

```typescript
dimensions = [
  'extract_features',                    // Extract from each
  { name: 'aggregate', scope: 'global' }, // Combine all features
  { name: 'summarize', scope: 'global' }  // Final summary
]
```

### Pattern 4: Parallel Analysis → Synthesis

```typescript
dimensions = [
  'sentiment',                           // Parallel
  'topics',                              // Parallel
  'entities',                            // Parallel
  { name: 'synthesize', scope: 'global' } // Combine insights
]
```

## Troubleshooting

### "My dimension isn't receiving dependency data"

✅ **Check:** Did you declare the dependency in `defineDependencies()`?

```typescript
// This won't work - summary can't access sentiment
defineDependencies() {
  return {
    sentiment: [],
    summary: []  // ← No dependency declared!
  };
}
```

### "Global dimension shows wrong data structure"

✅ **Check:** Are you accessing the `.sections` array?

```typescript
// Wrong
const sentiment = context.dependencies.sentiment.data.sentiment;

// Correct for global dimensions
const sentiments = context.dependencies.sentiment.data.sections.map(
	s => s.data.sentiment
);
```

### "Transformations aren't applying"

✅ **Check three things:**
1. Is the dimension scope: `'global'`?
2. Does `transformSections()` return a section array?
3. Is the dimension listed in `defineDependencies()`?

### "Performance is slow"

✅ **Check:**
1. Are you creating unnecessary dependencies?
2. Are you using section dimensions for aggregation?
3. Are you transforming late in the pipeline?

See [Performance Best Practices](#performance-best-practices) above.
