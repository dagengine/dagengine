# Examples

Real-world examples you can copy and use.

---

## Example 1: Content Moderation

Flag toxic, spam, and inappropriate content.
```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

class ModerationPlugin extends Plugin {
  constructor() {
    super('moderation', 'Content Moderation', 'Moderate content');
    this.dimensions = ['toxicity', 'spam', 'inappropriate'];
  }

  createPrompt(context) {
    const prompts = {
      toxicity: `Check toxicity: "${context.sections[0].content}"
        Return: {"toxic": true/false, "score": 0-1, "categories": []}`,
      
      spam: `Check spam: "${context.sections[0].content}"
        Return: {"spam": true/false, "score": 0-1, "reason": ""}`,
      
      inappropriate: `Check inappropriate: "${context.sections[0].content}"
        Return: {"inappropriate": true/false, "score": 0-1, "reason": ""}`
    };
    
    return prompts[context.dimension];
  }

  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}

// Use it
const engine = new DagEngine({
  plugin: new ModerationPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

const posts = [
  { content: 'Great product!', metadata: { id: 1 } },
  { content: 'Buy cheap viagra!!!', metadata: { id: 2 } },
  { content: 'You are stupid!', metadata: { id: 3 } }
];

const result = await engine.process(posts);

// Check results
result.sections.forEach((section, i) => {
  const { toxicity, spam, inappropriate } = section.results;
  
  if (toxicity.data.toxic || spam.data.spam || inappropriate.data.inappropriate) {
    console.log(`⚠️ Flag post ${i + 1}`);
  } else {
    console.log(`✅ Post ${i + 1} is clean`);
  }
});
```

---

## Example 2: Document Analysis

Extract entities, topics, sentiment, and create a summary.
```typescript
class DocumentAnalysis extends Plugin {
  constructor() {
    super('doc-analysis', 'Document Analysis', 'Analyze documents');
    this.dimensions = ['entities', 'topics', 'sentiment', 'summary'];
  }

  defineDependencies() {
    return {
      summary: ['entities', 'topics', 'sentiment']
    };
  }

  createPrompt(context) {
    if (context.dimension === 'entities') {
      return `Extract entities: "${context.sections[0].content}"
        Return: {"people": [], "places": [], "organizations": []}`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract topics: "${context.sections[0].content}"
        Return: {"topics": ["topic1", "topic2"], "main_topic": ""}`;
    }
    
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"
        Return: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'summary') {
      const entities = context.dependencies.entities.data;
      const topics = context.dependencies.topics.data;
      const sentiment = context.dependencies.sentiment.data;
      
      return `Create summary using this context:
        Entities: ${JSON.stringify(entities)}
        Topics: ${topics.main_topic}
        Sentiment: ${sentiment.sentiment}
        Text: "${context.sections[0].content}"`;
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

// Use it
const documents = [
  { 
    content: 'Apple CEO Tim Cook announced new iPhone features in Cupertino.',
    metadata: { source: 'news' }
  }
];

const result = await engine.process(documents);

console.log(result.sections[0].results);
// {
//   entities: { people: ['Tim Cook'], places: ['Cupertino'], organizations: ['Apple'] },
//   topics: { topics: ['technology', 'iPhone'], main_topic: 'technology' },
//   sentiment: { sentiment: 'neutral', score: 0.5 },
//   summary: { text: '...' }
// }
```

---

## Example 3: Cost Optimization

Skip expensive analysis for low-quality content.
```typescript
class CostOptimizedPlugin extends Plugin {
  constructor() {
    super('cost-optimized', 'Cost Optimized', 'Save money');
    this.dimensions = ['quick_check', 'deep_analysis'];
  }

  defineDependencies() {
    return {
      deep_analysis: ['quick_check']
    };
  }

  createPrompt(context) {
    if (context.dimension === 'quick_check') {
      return `Quick quality check: "${context.sections[0].content}"
        Return: {"quality": 1-10, "worth_analyzing": true/false}`;
    }
    
    if (context.dimension === 'deep_analysis') {
      return `Deep analysis: "${context.sections[0].content}"`;
    }
  }

  // Skip expensive analysis for low-quality content
  shouldSkipDimension(context) {
    if (context.dimension === 'deep_analysis') {
      const quality = context.dependencies.quick_check?.data?.quality;
      
      // Skip if quality < 7
      if (quality < 7) {
        console.log(`Skipping deep analysis (quality: ${quality})`);
        return true;
      }
    }
    
    return false;
  }

  selectProvider(dimension) {
    if (dimension === 'quick_check') {
      // Use cheap model for quick check
      return {
        provider: 'anthropic',
        options: { model: 'claude-haiku-3-5' }
      };
    }
    
    // Use expensive model only for high-quality content
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}

// Process 1000 documents
const result = await engine.process(documents);

// Result: 70% of deep_analysis calls skipped
// Cost: $0.75 instead of $2.50 (70% savings!)
```

---

## Example 4: Multi-Provider with Fallback

Use different providers for different tasks, with automatic fallback.
```typescript
class MultiProviderPlugin extends Plugin {
  constructor() {
    super('multi-provider', 'Multi Provider', 'Multiple AIs');
    this.dimensions = ['fast_check', 'quality_analysis', 'creative_summary'];
  }

  defineDependencies() {
    return {
      quality_analysis: ['fast_check'],
      creative_summary: ['quality_analysis']
    };
  }

  createPrompt(context) {
    const prompts = {
      fast_check: `Quick check: "${context.sections[0].content}"`,
      quality_analysis: `Quality analysis: "${context.sections[0].content}"`,
      creative_summary: `Creative summary: "${context.sections[0].content}"`
    };
    
    return prompts[context.dimension];
  }

  selectProvider(dimension) {
    // Use different providers for different tasks
    const config = {
      fast_check: {
        provider: 'anthropic',
        options: { model: 'claude-haiku-3-5' },
        fallbacks: [
          { provider: 'openai', options: { model: 'gpt-4o-mini' } }
        ]
      },
      
      quality_analysis: {
        provider: 'openai',
        options: { model: 'gpt-4o' },
        fallbacks: [
          { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } }
        ]
      },
      
      creative_summary: {
        provider: 'gemini',
        options: { model: 'gemini-1.5-pro' },
        fallbacks: [
          { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } },
          { provider: 'openai', options: { model: 'gpt-4o' } }
        ]
      }
    };
    
    return config[dimension];
  }
}

const engine = new DagEngine({
  plugin: new MultiProviderPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
    gemini: { apiKey: process.env.GEMINI_API_KEY }
  }
});

// If Gemini fails → automatically tries Anthropic → then OpenAI
```

---

## Example 5: Section Transformation

Split documents, analyze, then merge results.
```typescript
class TransformPlugin extends Plugin {
  constructor() {
    super('transform', 'Transform', 'Transform sections');
    this.dimensions = [
      {
        name: 'split_by_topic',
        scope: 'global',
        transform: (result, sections) => {
          // AI identified topics and suggested splits
          const splits = result.data.splits;
          
          return splits.map(split => ({
            content: split.content,
            metadata: { topic: split.topic, original: sections[0].metadata }
          }));
        }
      },
      'analyze',
      {
        name: 'merge_insights',
        scope: 'global'
      }
    ];
  }

  defineDependencies() {
    return {
      analyze: ['split_by_topic'],
      merge_insights: ['analyze']
    };
  }

  createPrompt(context) {
    if (context.dimension === 'split_by_topic') {
      return `Split this into topics: "${context.sections[0].content}"
        Return: {"splits": [{"topic": "", "content": ""}]}`;
    }
    
    if (context.dimension === 'analyze') {
      return `Analyze: "${context.sections[0].content}"
        Topic: ${context.sections[0].metadata.topic}`;
    }
    
    if (context.dimension === 'merge_insights') {
      return `Merge insights from all topics`;
    }
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

// Input: 1 long document
// After split_by_topic: 5 topic-based sections
// After analyze: 5 analyzed sections
// After merge_insights: 1 final insight
```

---

## Example 6: Batch Processing with Progress

Process thousands of documents with progress tracking.
```typescript
class BatchPlugin extends Plugin {
  constructor() {
    super('batch', 'Batch', 'Batch processing');
    this.dimensions = ['sentiment', 'category'];
  }

  createPrompt(context) {
    const prompts = {
      sentiment: `Sentiment: "${context.sections[0].content}"`,
      category: `Category: "${context.sections[0].content}"`
    };
    return prompts[context.dimension];
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

const engine = new DagEngine({
  plugin: new BatchPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  },
  concurrency: 20  // Process 20 at once
});

// Load 10,000 documents
const documents = loadDocuments();  // Array of 10,000 items

let processed = 0;

const result = await engine.process(documents, {
  onSectionComplete: (index, total) => {
    processed++;
    if (processed % 100 === 0) {
      console.log(`Progress: ${processed}/${total} (${(processed/total*100).toFixed(1)}%)`);
    }
  },
  onDimensionComplete: (dimension) => {
    console.log(`✓ Completed dimension: ${dimension}`);
  }
});

console.log(`Processed ${result.sections.length} documents`);
console.log(`Total cost: $${result.costs?.totalCost.toFixed(2)}`);
```

---

## Example 7: Smart Caching

Cache results to avoid re-processing.
```typescript
class CachingPlugin extends Plugin {
  private cache = new Map();

  constructor() {
    super('caching', 'Caching', 'With cache');
    this.dimensions = ['analysis'];
  }

  shouldSkipDimension(context) {
    if (context.dimension === 'analysis') {
      // Create cache key from content
      const key = this.hashContent(context.section.content);
      const cached = this.cache.get(key);
      
      if (cached) {
        console.log('Cache hit!');
        return {
          skip: true,
          result: {
            data: cached,
            metadata: { cached: true }
          }
        };
      }
    }
    
    return false;
  }

  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }

  afterDimensionExecute(context) {
    // Save to cache
    const key = this.hashContent(context.sections[0].content);
    this.cache.set(key, context.result.data);
  }

  private hashContent(content: string): string {
    // Simple hash (use crypto.createHash in production)
    return Buffer.from(content).toString('base64').slice(0, 32);
  }
}

// First run: Processes all documents
// Second run: Uses cache (instant, $0 cost!)
```

---

## Example 8: Real-Time Stream Processing

Process documents as they arrive.
```typescript
class StreamPlugin extends Plugin {
  constructor() {
    super('stream', 'Stream', 'Stream processing');
    this.dimensions = ['classify', 'prioritize'];
  }

  defineDependencies() {
    return { prioritize: ['classify'] };
  }

  createPrompt(context) {
    if (context.dimension === 'classify') {
      return `Classify: "${context.sections[0].content}"
        Return: {"category": "urgent|normal|low", "topic": ""}`;
    }
    
    if (context.dimension === 'prioritize') {
      const category = context.dependencies.classify.data.category;
      return `Prioritize ${category} item: "${context.sections[0].content}"`;
    }
  }

  shouldSkipDimension(context) {
    // Skip prioritization for low priority items
    if (context.dimension === 'prioritize') {
      const category = context.dependencies.classify?.data?.category;
      return category === 'low';
    }
    return false;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

// Process stream
const processMessage = async (message) => {
  const result = await engine.process([
    { content: message, metadata: { timestamp: Date.now() } }
  ]);
  
  const classification = result.sections[0].results.classify.data;
  
  if (classification.category === 'urgent') {
    await sendAlert(message);
  }
  
  return classification;
};

// Process as messages arrive
websocket.on('message', async (msg) => {
  const result = await processMessage(msg);
  console.log('Processed:', result);
});
```

---

## Next Steps

- ✅ [API Reference](/api/dag-engine) - Complete API documentation
- ✅ [Quick Start](/guide/quick-start) - Build your first workflow
- ✅ [Core Concepts](/guide/core-concepts) - Understand the fundamentals

---

## More Examples

Check the GitHub repository for more examples:

- 📧 Email classification
- 📝 Resume parsing
- 🔍 Search result ranking
- 📊 Data enrichment
- 🌐 Multi-language processing
- 🎯 Lead scoring

[View on GitHub →](https://github.com/ivan629/dag-ai/tree/main/examples)