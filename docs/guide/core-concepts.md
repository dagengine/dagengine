# Core Concepts

dag-ai has **3 core concepts**: Sections, Dimensions, and Dependencies.

---

## 1. Sections

**Sections** are the content you want to analyze.
```typescript
const sections = [
  { 
    content: 'Your text here', 
    metadata: { id: 1, author: 'John' } 
  },
  { 
    content: 'More text', 
    metadata: { id: 2, author: 'Jane' } 
  }
];
```

**Think of sections as:**
- 📄 Documents to analyze
- 📝 Paragraphs in a report
- 💬 Customer reviews
- 📧 Emails or messages
- 🎫 Support tickets

### Section Structure
```typescript
interface SectionData {
  content: string;              // The text to analyze
  metadata: Record<string, any>; // Any extra data you want to track
}
```

**Example:**
```typescript
{
  content: 'I love this product!',
  metadata: {
    userId: 123,
    date: '2025-01-15',
    source: 'email'
  }
}
```

---

## 2. Dimensions

**Dimensions** are the analysis tasks you want to perform.
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('my-plugin', 'My Plugin', 'Description');
    this.dimensions = [
      'sentiment',    // Task 1: Analyze sentiment
      'topics',       // Task 2: Extract topics
      'summary'       // Task 3: Create summary
    ];
  }
}
```

### Section Dimensions (Default)

Each section is analyzed independently:
```typescript
this.dimensions = ['sentiment', 'topics'];

// Section 1 → sentiment + topics
// Section 2 → sentiment + topics
// Section 3 → sentiment + topics
```

**Perfect for:**
- Per-document analysis
- Independent reviews
- Separate emails

### Global Dimensions

All sections analyzed together:
```typescript
this.dimensions = [
  { name: 'overall_themes', scope: 'global' }
];

// All sections → find common themes
```

**Perfect for:**
- Cross-document patterns
- Aggregated insights
- Global summaries

### Mixed Dimensions

Combine both:
```typescript
this.dimensions = [
  'sentiment',                              // Section
  'topics',                                 // Section
  { name: 'overall_tone', scope: 'global' } // Global
];
```

---

## 3. Dependencies

**Dependencies** define execution order.

### No Dependencies

Dimensions run in parallel:
```typescript
defineDependencies() {
  return {
    sentiment: [],  // No dependencies
    topics: []      // No dependencies
  };
}

// Execution: sentiment + topics (parallel)
```

### Simple Dependency

One dimension waits for another:
```typescript
defineDependencies() {
  return {
    sentiment: [],
    summary: ['sentiment']  // Wait for sentiment first
  };
}

// Execution: sentiment → summary
```

### Multiple Dependencies

Wait for multiple dimensions:
```typescript
defineDependencies() {
  return {
    sentiment: [],
    topics: [],
    summary: ['sentiment', 'topics']  // Wait for both
  };
}

// Execution: (sentiment + topics in parallel) → summary
```

### Complex Dependencies

Build complex workflows:
```typescript
defineDependencies() {
  return {
    A: [],
    B: ['A'],
    C: ['A'],
    D: ['B', 'C']
  };
}

// Execution:
//     A
//    / \
//   B   C
//    \ /
//     D
```

---

## How They Work Together

### Example: Content Analysis Pipeline
```typescript
class ContentPipeline extends Plugin {
  constructor() {
    super('pipeline', 'Content Pipeline', 'Full analysis');
    
    // 1. Define dimensions
    this.dimensions = [
      'sentiment',      // Analyze emotion
      'topics',         // Extract topics
      'quality',        // Check quality
      'summary'         // Create summary
    ];
  }

  // 2. Define dependencies
  defineDependencies() {
    return {
      sentiment: [],          // No deps - runs first
      topics: [],             // No deps - runs first (parallel with sentiment)
      quality: ['sentiment'], // Needs sentiment
      summary: ['sentiment', 'topics', 'quality']  // Needs all three
    };
  }

  // 3. Create prompts for each dimension
  createPrompt(context) {
    const prompts = {
      sentiment: `Analyze sentiment: "${context.sections[0].content}"
        Return: {"sentiment": "positive|negative|neutral", "score": 0-1}`,
      
      topics: `Extract topics: "${context.sections[0].content}"
        Return: {"topics": ["topic1", "topic2"]}`,
      
      quality: `Rate quality: "${context.sections[0].content}"
        Sentiment: ${context.dependencies.sentiment.data.sentiment}
        Return: {"quality": 1-10, "issues": []}`,
      
      summary: `Summarize: "${context.sections[0].content}"
        Sentiment: ${context.dependencies.sentiment.data.sentiment}
        Topics: ${context.dependencies.topics.data.topics.join(', ')}
        Quality: ${context.dependencies.quality.data.quality}/10`
    };
    
    return prompts[context.dimension];
  }

  // 4. Select provider
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

**Execution flow:**
```
Level 0: sentiment + topics (parallel)
         ↓           ↓
Level 1: quality ←──┘
         ↓
Level 2: summary (waits for all)
```

---

## Accessing Dependencies

When a dimension executes, it receives dependency results:
```typescript
createPrompt(context) {
  if (context.dimension === 'summary') {
    // Access previous results
    const sentiment = context.dependencies.sentiment.data;
    const topics = context.dependencies.topics.data;
    
    return `Create summary:
      Sentiment: ${sentiment.sentiment} (${sentiment.score})
      Topics: ${topics.topics.join(', ')}
      Text: "${context.sections[0].content}"`;
  }
}
```

### Section Dependencies

For section dimensions, you get that section's results:
```typescript
// Section dimension
context.dependencies.sentiment  // This section's sentiment result
```

### Global Dependencies

For global dimensions, you get aggregated section results:
```typescript
// Global dimension depends on section dimension
context.dependencies.sentiment.data.sections  // Array of all section results
```

---

## Section vs Global Processing

### Section Processing

Each section analyzed separately:
```typescript
// Input: 3 sections
const sections = [
  { content: 'Text 1', metadata: {} },
  { content: 'Text 2', metadata: {} },
  { content: 'Text 3', metadata: {} }
];

// Output: 3 separate results
result.sections[0].results.sentiment  // Text 1 sentiment
result.sections[1].results.sentiment  // Text 2 sentiment
result.sections[2].results.sentiment  // Text 3 sentiment
```

### Global Processing

All sections analyzed together:
```typescript
this.dimensions = [
  { name: 'themes', scope: 'global' }
];

// Input: 3 sections (analyzed together)
// Output: 1 global result
result.globalResults.themes  // Themes across all 3 sections
```

---

## Practical Examples

### Example 1: Simple Sentiment
```typescript
class SimpleSentiment extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Sentiment: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

### Example 2: With Dependencies
```typescript
class WithDeps extends Plugin {
  dimensions = ['extract', 'summarize'];
  
  defineDependencies() {
    return { summarize: ['extract'] };
  }
  
  createPrompt(context) {
    if (context.dimension === 'extract') {
      return `Extract entities: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'summarize') {
      const entities = context.dependencies.extract.data.entities;
      return `Summarize focusing on: ${entities.join(', ')}`;
    }
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

### Example 3: Mixed Scope
```typescript
class MixedScope extends Plugin {
  dimensions = [
    'sentiment',                           // Section-level
    { name: 'overall', scope: 'global' }   // Global-level
  ];
  
  defineDependencies() {
    return { overall: ['sentiment'] };
  }
  
  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Sentiment: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'overall') {
      // Access all section sentiments
      const sentiments = context.dependencies.sentiment.data.sections;
      return `Overall tone from ${sentiments.length} items`;
    }
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

---

## Key Takeaways

### Sections
- ✅ Content to analyze
- ✅ Can be any text with metadata
- ✅ Processed independently by default

### Dimensions
- ✅ Analysis tasks to perform
- ✅ Section-level (per document) or global (all documents)
- ✅ Can be mixed in one workflow

### Dependencies
- ✅ Define execution order
- ✅ Enable complex workflows
- ✅ Automatic parallel execution where possible

---

## Next Steps

- ✅ [Quick Start](/guide/quick-start) - Build your first workflow
- ✅ [Examples](/guide/examples) - See real-world examples
- ✅ [API Reference](/api/dag-engine) - Complete API docs