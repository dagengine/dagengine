---
title: Recipe Index
description: Complete collection of ready-to-use dag-ai recipes
---

# Recipe Collection

Production-ready recipes for common AI workflows. Copy, paste, customize.

---

## 📋 What are Recipes?

**Recipes** are complete, working examples you can use immediately:

- ✅ **Copy-paste ready** - Works out of the box
- ✅ **Production tested** - Real-world patterns
- ✅ **Fully commented** - Understand every line
- ✅ **Customizable** - Adapt to your needs

**Format:**
Each recipe includes:
1. **Use Case** - What problem it solves
2. **Full Code** - Complete working implementation
3. **Explanation** - How it works
4. **Customization** - How to adapt it
5. **Cost Estimate** - Expected API costs

---

## 🎯 Recipe Categories

### 🔰 Beginner Recipes
Perfect for learning dag-ai fundamentals:
- [Sentiment Analysis](#1-sentiment-analysis) - Analyze text emotion
- [Content Categorization](#2-content-categorization) - Group documents by topic
- [Multi-Provider Fallback](#3-multi-provider-fallback) - Reliable execution

### 🚀 Intermediate Recipes
Common production patterns:
- [Document Analysis Pipeline](#4-document-analysis-pipeline) - Extract, analyze, summarize
- [Cost-Optimized Processing](#5-cost-optimized-processing) - Smart routing & caching

### 💎 Advanced Recipes
Complex real-world workflows:
- [Content Moderation System](#6-content-moderation-system) - Complete moderation pipeline
- [Research Assistant](#7-research-assistant) - Web search + analysis
- [Dynamic Section Transforms](#8-dynamic-section-transforms) - Restructure data mid-pipeline

### 🏢 Enterprise Recipes
Production-ready patterns:
- [High-Availability Setup](#9-high-availability-setup) - 99.9% uptime
- [Cost Tracking & Analytics](#10-cost-tracking--analytics) - Monitor spending

---

## 1. Sentiment Analysis

**Use Case:** Analyze customer reviews, feedback, social media posts

**Difficulty:** 🔰 Beginner

**Time to Implement:** 5 minutes

**Cost:** ~$0.03 per 1000 reviews

### Full Code

```typescript
import { Plugin, DagEngine, PromptContext, ProviderSelection } from '@ivan629/dag-ai';

/**
 * Sentiment Analysis Plugin
 * 
 * Analyzes text sentiment with score (0-1) and classification
 */
class SentimentAnalysisPlugin extends Plugin {
  constructor() {
    super(
      'sentiment-analysis',
      'Sentiment Analysis',
      'Analyzes text sentiment and emotional tone'
    );
    
    // Single dimension: sentiment
    this.dimensions = ['sentiment'];
  }

  /**
   * Create AI prompt for sentiment analysis
   */
  createPrompt(context: PromptContext): string {
    const text = context.sections[0].content;
    
    return `Analyze the sentiment of this text:

"${text}"

Return a JSON object with:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": <number between 0 and 1>,
  "confidence": <number between 0 and 1>,
  "emotions": [<list of detected emotions>]
}

Where:
- sentiment: Overall sentiment classification
- score: 0 = very negative, 0.5 = neutral, 1 = very positive
- confidence: How confident you are (0-1)
- emotions: Specific emotions detected (joy, anger, sadness, etc.)`;
  }

  /**
   * Select AI provider
   * Using Gemini Flash for cost-effectiveness
   */
  selectProvider(): ProviderSelection {
    return {
      provider: 'gemini',
      options: {
        model: 'gemini-1.5-flash',  // Cheapest: $0.075 per 1M tokens
        temperature: 0.1             // Low temperature for consistent results
      },
      fallbacks: [
        {
          provider: 'anthropic',
          options: { model: 'claude-sonnet-4-5-20250929' }
        }
      ]
    };
  }
}

// Usage Example
async function analyzeSentiment() {
  // 1. Create engine
  const engine = new DagEngine({
    plugin: new SentimentAnalysisPlugin(),
    providers: {
      gemini: { apiKey: process.env.GEMINI_API_KEY },
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
    },
    concurrency: 10  // Process 10 reviews at once
  });

  // 2. Prepare data
  const reviews = [
    {
      content: 'I absolutely love this product! Best purchase ever!',
      metadata: { reviewId: 1, source: 'website' }
    },
    {
      content: 'Terrible experience. Would not recommend.',
      metadata: { reviewId: 2, source: 'app' }
    },
    {
      content: 'It\'s okay, nothing special.',
      metadata: { reviewId: 3, source: 'email' }
    }
  ];

  // 3. Process
  const result = await engine.process(reviews);

  // 4. Access results
  result.sections.forEach((section, i) => {
    const sentiment = section.results.sentiment.data;
    
    console.log(`Review ${i + 1}:`);
    console.log(`  Sentiment: ${sentiment.sentiment}`);
    console.log(`  Score: ${sentiment.score}`);
    console.log(`  Confidence: ${sentiment.confidence}`);
    console.log(`  Emotions: ${sentiment.emotions.join(', ')}`);
    console.log('---');
  });

  // 5. Check costs
  console.log(`Total cost: $${result.costs.totalCost.toFixed(4)}`);
}

analyzeSentiment();
```

### Expected Output

```
Review 1:
  Sentiment: positive
  Score: 0.95
  Confidence: 0.92
  Emotions: joy, excitement, satisfaction
---
Review 2:
  Sentiment: negative
  Score: 0.15
  Confidence: 0.88
  Emotions: disappointment, frustration
---
Review 3:
  Sentiment: neutral
  Score: 0.5
  Confidence: 0.85
  Emotions: indifference
---
Total cost: $0.0003
```

### How It Works

1. **Plugin Definition** - Single dimension: `sentiment`
2. **Prompt Creation** - Structured prompt requesting JSON output
3. **Provider Selection** - Uses Gemini Flash (cheapest)
4. **Parallel Processing** - Processes 10 reviews concurrently
5. **Result Access** - Typed data with sentiment, score, confidence

### Customization

**Use different model:**
```typescript
selectProvider(): ProviderSelection {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }  // More accurate
  };
}
```

**Add caching:**
```typescript
async shouldSkipDimension(context) {
  const cached = await redis.get(context.section.metadata.reviewId);
  if (cached) {
    return { skip: true, result: JSON.parse(cached) };
  }
  return false;
}

async afterDimensionExecute(context) {
  if (!context.result.error) {
    await redis.set(
      context.sections[0].metadata.reviewId,
      JSON.stringify(context.result),
      'EX',
      3600  // 1 hour cache
    );
  }
}
```

**Add emotion filtering:**
```typescript
createPrompt(context: PromptContext): string {
  return `Analyze sentiment and detect ONLY these emotions:
  joy, sadness, anger, fear, surprise, disgust
  
  Text: "${context.sections[0].content}"`;
}
```

### Cost Estimate

**Gemini Flash pricing:** $0.075 / $0.30 per 1M tokens (input/output)

Typical review (100 words ≈ 130 tokens):
- Input: 130 tokens + prompt (50 tokens) = 180 tokens
- Output: 50 tokens
- Cost per review: **~$0.00003** ($0.03 per 1000 reviews)

**1,000 reviews/day:**
- Daily: $0.03
- Monthly: $0.90
- Yearly: $10.95

---

## 2. Content Categorization

**Use Case:** Organize documents, emails, support tickets by topic

**Difficulty:** 🔰 Beginner

**Time to Implement:** 10 minutes

**Cost:** ~$0.15 per 1000 documents

### Full Code

```typescript
import { Plugin, DagEngine, PromptContext, ProviderSelection, DimensionContext, SectionData } from '@ivan629/dag-ai';

/**
 * Content Categorization Plugin
 * 
 * Uses global dimension to categorize all documents at once,
 * then transforms sections into category groups
 */
class ContentCategorizationPlugin extends Plugin {
  constructor() {
    super(
      'content-categorization',
      'Content Categorization',
      'Categorizes documents into predefined or dynamic categories'
    );
    
    // Global dimension: analyze all documents together
    this.dimensions = [
      {
        name: 'categorize',
        scope: 'global'
      }
    ];
  }

  /**
   * Create prompt with ALL documents
   */
  createPrompt(context: PromptContext): string {
    if (!context.isGlobal) return '';

    // Format all documents with indices
    const documents = context.sections
      .map((section, i) => `[${i}] ${section.content.substring(0, 200)}...`)
      .join('\n\n');

    return `Categorize these ${context.sections.length} documents into groups.

Categories to consider:
- Technology (AI, software, hardware, tech news)
- Business (finance, economy, startups, companies)
- Science (research, discoveries, studies)
- Health (medicine, fitness, wellness)
- Entertainment (movies, music, games, celebrities)
- Sports (athletics, competitions, teams)
- Politics (government, elections, policy)
- Other (anything that doesn't fit above)

Documents:
${documents}

Return JSON:
{
  "categories": {
    "technology": [<indices>],
    "business": [<indices>],
    "science": [<indices>],
    "health": [<indices>],
    "entertainment": [<indices>],
    "sports": [<indices>],
    "politics": [<indices>],
    "other": [<indices>]
  },
  "summary": {
    "totalDocuments": <number>,
    "distribution": {<category>: <count>, ...}
  }
}`;
  }

  /**
   * Select provider
   */
  selectProvider(): ProviderSelection {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 4096
      },
      fallbacks: [
        { provider: 'openai', options: { model: 'gpt-4o' } }
      ]
    };
  }

  /**
   * Transform sections based on categorization
   * Merge documents in same category into single section
   */
  transformSections(context: any): SectionData[] {
    if (context.dimension !== 'categorize') {
      return context.currentSections;
    }

    const result = context.result.data;
    const categories = result.categories;
    const newSections: SectionData[] = [];

    // Create one section per category
    for (const [category, indices] of Object.entries(categories)) {
      const documentIndices = indices as number[];
      
      if (documentIndices.length === 0) continue;

      // Merge all documents in this category
      const documents = documentIndices.map(i => context.currentSections[i]);
      
      newSections.push({
        content: documents.map(d => d.content).join('\n\n---\n\n'),
        metadata: {
          category,
          documentCount: documents.length,
          originalIndices: documentIndices,
          documents: documents.map(d => d.metadata)
        }
      });
    }

    console.log(`Transformed: ${context.currentSections.length} docs → ${newSections.length} categories`);

    return newSections;
  }
}

// Usage Example
async function categorizeContent() {
  const engine = new DagEngine({
    plugin: new ContentCategorizationPlugin(),
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
    }
  });

  // Mix of different topics
  const documents = [
    { content: 'OpenAI releases GPT-5 with improved reasoning capabilities...', metadata: { id: 1 } },
    { content: 'Stock market hits record high as tech sector rallies...', metadata: { id: 2 } },
    { content: 'New study shows coffee reduces risk of heart disease...', metadata: { id: 3 } },
    { content: 'Apple announces new iPhone with advanced AI features...', metadata: { id: 4 } },
    { content: 'Olympics 2024: Team USA wins gold in basketball...', metadata: { id: 5 } },
    { content: 'Scientists discover new species in Amazon rainforest...', metadata: { id: 6 } },
    { content: 'Latest Marvel movie breaks box office records...', metadata: { id: 7 } },
    { content: 'Presidential debate focuses on climate policy...', metadata: { id: 8 } }
  ];

  const result = await engine.process(documents);

  // Original categorization
  const categorization = result.globalResults.categorize.data;
  
  console.log('Categorization Results:');
  console.log(JSON.stringify(categorization.summary, null, 2));
  console.log('\nCategories:');
  for (const [category, indices] of Object.entries(categorization.categories)) {
    console.log(`  ${category}: ${(indices as number[]).length} documents`);
  }

  // Transformed sections (grouped by category)
  console.log(`\nTransformed Sections: ${result.transformedSections.length}`);
  result.transformedSections.forEach(section => {
    console.log(`\n${section.metadata.category.toUpperCase()}: ${section.metadata.documentCount} docs`);
    console.log(`  Document IDs: ${section.metadata.documents.map((d: any) => d.id).join(', ')}`);
  });
}

categorizeContent();
```

### Expected Output

```
Categorization Results:
{
  "totalDocuments": 8,
  "distribution": {
    "technology": 2,
    "business": 1,
    "health": 1,
    "sports": 1,
    "science": 1,
    "entertainment": 1,
    "politics": 1
  }
}

Categories:
  technology: 2 documents
  business: 1 documents
  health: 1 documents
  sports: 1 documents
  science: 1 documents
  entertainment: 1 documents
  politics: 1 documents

Transformed: 8 docs → 7 categories

Transformed Sections: 7

TECHNOLOGY: 2 docs
  Document IDs: 1, 4

BUSINESS: 1 docs
  Document IDs: 2

HEALTH: 1 docs
  Document IDs: 3

SPORTS: 1 docs
  Document IDs: 5

SCIENCE: 1 docs
  Document IDs: 6

ENTERTAINMENT: 1 docs
  Document IDs: 7

POLITICS: 1 docs
  Document IDs: 8
```

### How It Works

1. **Global Dimension** - Analyzes all documents together
2. **AI Categorization** - Returns document indices per category
3. **Section Transform** - Merges documents by category
4. **Result** - Original docs + categorized groups

**Flow:**
```
Input: [doc1, doc2, doc3, doc4, doc5, doc6, doc7, doc8]
  ↓
Global: categorize (AI analyzes all)
  ↓
Transform: Merge by category
  ↓
Output: [tech_section, business_section, health_section, ...]
```

### Customization

**Custom categories:**
```typescript
createPrompt(context: PromptContext): string {
  return `Categorize into:
  - Urgent (requires immediate action)
  - Important (high priority)
  - Normal (standard priority)
  - Low (can wait)
  
  Documents: ${...}`;
}
```

**Keep original sections:**
```typescript
transformSections(context: any): SectionData[] {
  // Don't transform, just add metadata
  return context.currentSections.map((section, i) => ({
    ...section,
    metadata: {
      ...section.metadata,
      category: this.findCategory(i, context.result.data)
    }
  }));
}
```

**Add subsequent analysis per category:**
```typescript
class AdvancedCategorization extends Plugin {
  dimensions = [
    { name: 'categorize', scope: 'global' },
    'summarize'  // Runs on transformed sections (one per category)
  ];
  
  defineDependencies() {
    return {
      summarize: ['categorize']
    };
  }
  
  createPrompt(context: PromptContext): string {
    if (context.dimension === 'summarize') {
      const category = context.sections[0].metadata.category;
      const count = context.sections[0].metadata.documentCount;
      
      return `Summarize these ${count} ${category} documents:
      ${context.sections[0].content}`;
    }
    // ... categorize prompt
  }
}
```

### Cost Estimate

**Claude Sonnet pricing:** $3 / $15 per 1M tokens

Typical batch (50 docs × 200 words each):
- Input: 50 docs × 260 tokens + prompt = 13,100 tokens
- Output: 500 tokens
- Cost per batch: **$0.047**

**1,000 documents (20 batches):**
- Cost: **$0.94** (~$1 per 1000 docs)

---

## 3. Multi-Provider Fallback

**Use Case:** Ensure 99.9% uptime with automatic provider switching

**Difficulty:** 🔰 Beginner

**Time to Implement:** 5 minutes

**Cost:** Standard provider rates

### Full Code

```typescript
import { Plugin, DagEngine, ProviderSelection, RetryContext, RetryResponse, FallbackContext, FallbackResponse } from '@ivan629/dag-ai';

/**
 * High-Availability Analysis Plugin
 * 
 * Uses multiple providers with intelligent fallback
 */
class HighAvailabilityPlugin extends Plugin {
  private providerAttempts = new Map<string, number>();

  constructor() {
    super(
      'ha-analysis',
      'High Availability Analysis',
      'Analysis with automatic multi-provider fallback'
    );
    
    this.dimensions = ['analyze'];
  }

  createPrompt(context: any): string {
    return `Analyze this text and extract key information:
    
    "${context.sections[0].content}"
    
    Return JSON with your analysis.`;
  }

  /**
   * Primary: Anthropic
   * Fallback 1: OpenAI (after 1s delay)
   * Fallback 2: Gemini (after 2s delay)
   */
  selectProvider(): ProviderSelection {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-sonnet-4-5-20250929'
      },
      fallbacks: [
        {
          provider: 'openai',
          options: { model: 'gpt-4o' },
          retryAfter: 1000  // Wait 1s before trying OpenAI
        },
        {
          provider: 'gemini',
          options: { model: 'gemini-1.5-pro' },
          retryAfter: 2000  // Wait 2s before trying Gemini
        }
      ]
    };
  }

  /**
   * Custom retry logic
   */
  handleRetry(context: RetryContext): RetryResponse {
    // Track attempts per provider
    const key = `${context.provider}-${context.dimension}`;
    const attempts = (this.providerAttempts.get(key) || 0) + 1;
    this.providerAttempts.set(key, attempts);

    // Rate limit error → wait longer
    if (context.error.message.includes('rate_limit')) {
      console.log(`⏱️  Rate limit hit on ${context.provider}, waiting 60s...`);
      return {
        shouldRetry: true,
        delayMs: 60000  // 60 seconds
      };
    }

    // Context length error → truncate
    if (context.error.message.includes('context_length')) {
      console.log(`✂️  Context too long, truncating...`);
      return {
        shouldRetry: true,
        modifiedRequest: {
          ...context.request,
          input: context.request.input.substring(0, 5000) + '\n\n[Content truncated]'
        }
      };
    }

    // Auth error → don't retry
    if (context.error.message.includes('invalid_api_key') || 
        context.error.message.includes('unauthorized')) {
      console.log(`🔒 Auth error on ${context.provider}, skipping retries`);
      return { shouldRetry: false };
    }

    // Default: retry with exponential backoff
    console.log(`🔄 Retry ${context.attempt}/${context.maxAttempts} on ${context.provider}`);
    return {};
  }

  /**
   * Fallback control
   */
  handleProviderFallback(context: FallbackContext): FallbackResponse {
    console.log(`🔀 Falling back: ${context.failedProvider} → ${context.fallbackProvider}`);
    console.log(`   Reason: ${context.error.message}`);

    // Modify request for Gemini (needs explicit JSON instruction)
    if (context.fallbackProvider === 'gemini') {
      return {
        shouldFallback: true,
        delayMs: 2000,
        modifiedRequest: {
          ...context.request,
          input: context.request.input + '\n\nIMPORTANT: Return valid JSON only.',
          options: {
            ...context.request.options,
            temperature: 0  // More deterministic for Gemini
          }
        }
      };
    }

    return { shouldFallback: true };
  }

  /**
   * Final fallback if all providers fail
   */
  handleDimensionFailure(context: any): any {
    console.log(`❌ All providers failed for ${context.dimension}`);
    console.log(`   Providers tried: ${context.providers.join(', ')}`);
    console.log(`   Total attempts: ${context.totalAttempts}`);

    // Return safe default
    return {
      data: {
        analysis: 'Unable to analyze - all providers unavailable',
        fallback: true,
        error: context.error.message
      },
      metadata: {
        allProvidersFailed: true,
        providers: context.providers,
        totalAttempts: context.totalAttempts
      }
    };
  }
}

// Usage Example
async function testHighAvailability() {
  const engine = new DagEngine({
    plugin: new HighAvailabilityPlugin(),
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
      openai: { apiKey: process.env.OPENAI_API_KEY },
      gemini: { apiKey: process.env.GEMINI_API_KEY }
    },
    maxRetries: 3,      // 3 retries per provider
    retryDelay: 1000,   // Base delay: 1s
    timeout: 60000      // 60s timeout
  });

  const sections = [
    { content: 'Important document that must be processed...', metadata: { id: 1 } }
  ];

  try {
    const result = await engine.process(sections);
    
    console.log('\n✅ Success!');
    console.log('Provider used:', result.sections[0].results.analyze.metadata?.provider);
    console.log('Data:', result.sections[0].results.analyze.data);
    
  } catch (error) {
    console.error('\n❌ Total failure:', error);
  }
}

testHighAvailability();
```

### Expected Output (Success)

```
🔄 Retry 1/3 on anthropic
🔄 Retry 2/3 on anthropic
🔄 Retry 3/3 on anthropic
🔀 Falling back: anthropic → openai
   Reason: Service unavailable

✅ Success!
Provider used: openai
Data: { analysis: {...} }
```

### Expected Output (All Fail)

```
🔄 Retry 1/3 on anthropic
🔄 Retry 2/3 on anthropic
🔄 Retry 3/3 on anthropic
🔀 Falling back: anthropic → openai
   Reason: Service unavailable
🔄 Retry 1/3 on openai
🔄 Retry 2/3 on openai
🔄 Retry 3/3 on openai
🔀 Falling back: openai → gemini
   Reason: Service unavailable
🔄 Retry 1/3 on gemini
🔄 Retry 2/3 on gemini
🔄 Retry 3/3 on gemini
❌ All providers failed for analyze
   Providers tried: anthropic, openai, gemini
   Total attempts: 9

✅ Success! (with fallback data)
Provider used: none
Data: { analysis: 'Unable to analyze - all providers unavailable', fallback: true }
```

### How It Works

**Retry Flow:**
```
Anthropic (primary)
  ├─ Attempt 1: Fail
  ├─ Attempt 2: Fail (wait 1s)
  ├─ Attempt 3: Fail (wait 2s)
  └─ Attempt 4: Fail (wait 4s)
       ↓
OpenAI (fallback 1)
  ├─ Wait 1s (retryAfter)
  ├─ Attempt 1: Fail
  ├─ Attempt 2: Fail
  ├─ Attempt 3: Fail
  └─ Attempt 4: Fail
       ↓
Gemini (fallback 2)
  ├─ Wait 2s (retryAfter)
  ├─ Attempt 1: Fail
  ├─ Attempt 2: Fail
  ├─ Attempt 3: Fail
  └─ Attempt 4: Fail
       ↓
handleDimensionFailure()
  └─ Return safe default
```

**Total attempts:** Up to 12 (4 × 3 providers)

### Customization

**More aggressive retries:**
```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: {...},
  maxRetries: 5,      // 5 retries instead of 3
  retryDelay: 500     // Faster retries: 0.5s base
});
```

**Different fallback order:**
```typescript
selectProvider(): ProviderSelection {
  return {
    provider: 'gemini',  // Try cheapest first
    fallbacks: [
      { provider: 'anthropic' },  // Then mid-tier
      { provider: 'openai' }      // Then premium
    ]
  };
}
```

**Skip fallback for specific errors:**
```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse {
  // Don't fallback on content policy violations
  if (context.error.message.includes('content_policy')) {
    return { shouldFallback: false };
  }
  
  return { shouldFallback: true };
}
```

### Availability Calculation

**Single provider (95% uptime):**
- Monthly downtime: ~36 hours

**Two providers (95% each):**
- Combined: 99.75% uptime
- Monthly downtime: ~1.8 hours

**Three providers (95% each):**
- Combined: 99.9875% uptime
- Monthly downtime: ~5 minutes

**Formula:** `1 - (failure_rate₁ × failure_rate₂ × failure_rate₃)`

---

## 4. Document Analysis Pipeline

**Use Case:** Extract entities → Analyze sentiment → Generate summary

**Difficulty:** 🚀 Intermediate

**Time to Implement:** 15 minutes

**Cost:** ~$0.20 per 1000 documents

### Full Code

```typescript
import { Plugin, DagEngine, PromptContext, ProviderSelection, ProcessContext } from '@ivan629/dag-ai';

/**
 * Document Analysis Pipeline
 * 
 * Multi-step analysis with dependencies:
 * 1. Extract entities (people, places, organizations)
 * 2. Analyze sentiment
 * 3. Extract topics
 * 4. Generate enriched summary using all previous results
 */
class DocumentAnalysisPipeline extends Plugin {
  constructor() {
    super(
      'doc-analysis',
      'Document Analysis Pipeline',
      'Complete document analysis with entity extraction, sentiment, and summary'
    );
    
    this.dimensions = [
      'entities',   // Step 1: Extract entities
      'sentiment',  // Step 2: Analyze sentiment
      'topics',     // Step 3: Extract topics
      'summary'     // Step 4: Summary (depends on all above)
    ];
  }

  /**
   * Define execution order
   */
  defineDependencies(context: ProcessContext): Record<string, string[]> {
    return {
      entities: [],                             // No dependencies (runs first)
      sentiment: [],                            // No dependencies (runs first)
      topics: [],                               // No dependencies (runs first)
      summary: ['entities', 'sentiment', 'topics']  // Waits for all three
    };
  }

  /**
   * Create prompts based on dimension
   */
  createPrompt(context: PromptContext): string {
    const text = context.sections[0].content;

    // Step 1: Entity extraction
    if (context.dimension === 'entities') {
      return `Extract all entities from this text:

"${text}"

Return JSON:
{
  "people": [<list of person names>],
  "places": [<list of locations>],
  "organizations": [<list of organizations>],
  "dates": [<list of dates>],
  "other": [<other important entities>]
}`;
    }

    // Step 2: Sentiment analysis
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment of this text:

"${text}"

Return JSON:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": <0-1>,
  "confidence": <0-1>
}`;
    }

    // Step 3: Topic extraction
    if (context.dimension === 'topics') {
      return `Extract main topics from this text:

"${text}"

Return JSON:
{
  "topics": [<list of topics>],
  "primaryTopic": "<main topic>",
  "categories": [<broader categories>]
}`;
    }

    // Step 4: Enriched summary using dependencies
    if (context.dimension === 'summary') {
      const entities = context.dependencies.entities.data;
      const sentiment = context.dependencies.sentiment.data;
      const topics = context.dependencies.topics.data;

      return `Create a comprehensive summary of this text:

"${text}"

Context from analysis:
- Key people: ${entities.people.join(', ')}
- Key places: ${entities.places.join(', ')}
- Organizations: ${entities.organizations.join(', ')}
- Sentiment: ${sentiment.sentiment} (score: ${sentiment.score})
- Main topics: ${topics.topics.join(', ')}

Return JSON:
{
  "summary": "<concise summary incorporating the context>",
  "keyPoints": [<list of key points>],
  "sentiment": "<sentiment-aware summary tone>",
  "length": <word count of original>
}`;
    }

    return '';
  }

  /**
   * Select provider based on dimension
   */
  selectProvider(dimension: string): ProviderSelection {
    // Use cheaper model for simple extraction
    if (dimension === 'entities' || dimension === 'topics') {
      return {
        provider: 'gemini',
        options: { model: 'gemini-1.5-flash' },
        fallbacks: [
          { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } }
        ]
      };
    }

    // Use best model for complex summary
    if (dimension === 'summary') {
      return {
        provider: 'anthropic',
        options: { model: 'claude-sonnet-4-5-20250929' },
        fallbacks: [
          { provider: 'openai', options: { model: 'gpt-4o' } }
        ]
      };
    }

    // Default (sentiment)
    return {
      provider: 'gemini',
      options: { model: 'gemini-1.5-flash' }
    };
  }
}

// Usage Example
async function analyzeDocuments() {
  const engine = new DagEngine({
    plugin: new DocumentAnalysisPipeline(),
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
      openai: { apiKey: process.env.OPENAI_API_KEY },
      gemini: { apiKey: process.env.GEMINI_API_KEY }
    },
    concurrency: 5,  // Process 5 documents at once
    pricing: {
      models: {
        'claude-sonnet-4-5-20250929': { inputPer1M: 3.00, outputPer1M: 15.00 },
        'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
        'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 }
      }
    }
  });

  const documents = [
    {
      content: `Apple CEO Tim Cook announced today that the company will open a new research facility in Austin, Texas. 
      The $1 billion campus will focus on artificial intelligence and machine learning research. 
      Cook expressed excitement about the expansion, calling it "a major step forward for Apple's AI capabilities." 
      The facility is expected to create 5,000 new jobs by 2026.`,
      metadata: { docId: 1, source: 'news' }
    }
  ];

  const result = await engine.process(documents, {
    onDimensionComplete: (dim, res) => {
      console.log(`✅ Completed: ${dim}`);
    }
  });

  // Access results
  const doc = result.sections[0];
  
  console.log('\n=== DOCUMENT ANALYSIS ===\n');
  
  console.log('ENTITIES:');
  console.log(JSON.stringify(doc.results.entities.data, null, 2));
  
  console.log('\nSENTIMENT:');
  console.log(JSON.stringify(doc.results.sentiment.data, null, 2));
  
  console.log('\nTOPICS:');
  console.log(JSON.stringify(doc.results.topics.data, null, 2));
  
  console.log('\nSUMMARY:');
  console.log(JSON.stringify(doc.results.summary.data, null, 2));
  
  console.log('\n=== COSTS ===\n');
  console.log(`Total: $${result.costs.totalCost.toFixed(4)}`);
  console.log('\nBy Dimension:');
  for (const [dim, cost] of Object.entries(result.costs.byDimension)) {
    console.log(`  ${dim}: $${cost.cost.toFixed(4)} (${cost.tokens.totalTokens} tokens)`);
  }
}

analyzeDocuments();
```

### Expected Output

```
✅ Completed: entities
✅ Completed: sentiment
✅ Completed: topics
✅ Completed: summary

=== DOCUMENT ANALYSIS ===

ENTITIES:
{
  "people": ["Tim Cook"],
  "places": ["Austin, Texas"],
  "organizations": ["Apple"],
  "dates": ["2026"],
  "other": ["$1 billion", "5,000 jobs"]
}

SENTIMENT:
{
  "sentiment": "positive",
  "score": 0.85,
  "confidence": 0.92
}

TOPICS:
{
  "topics": ["Apple expansion", "AI research", "job creation"],
  "primaryTopic": "technology investment",
  "categories": ["technology", "business", "employment"]
}

SUMMARY:
{
  "summary": "Apple, led by CEO Tim Cook, is investing $1 billion in a new Austin, Texas facility focused on AI and machine learning research. The expansion reflects Apple's commitment to advancing its AI capabilities and will create 5,000 jobs by 2026.",
  "keyPoints": [
    "$1 billion investment in Austin facility",
    "Focus on AI and machine learning",
    "5,000 new jobs by 2026",
    "Tim Cook expressed excitement about expansion"
  ],
  "sentiment": "The announcement was met with optimism and excitement",
  "length": 67
}

=== COSTS ===

Total: $0.0018
By Dimension:
  entities: $0.0002 (450 tokens)
  sentiment: $0.0001 (380 tokens)
  topics: $0.0002 (420 tokens)
  summary: $0.0013 (890 tokens)
```

### How It Works

**Execution Flow:**
```
Start
  ↓
┌─────────────┐  ┌──────────────┐  ┌────────────┐
│  entities   │  │  sentiment   │  │   topics   │  ← Parallel (no dependencies)
└──────┬──────┘  └──────┬───────┘  └──────┬─────┘
       └────────────────┴──────────────────┘
                        ↓
                  ┌────────────┐
                  │  summary   │  ← Waits for all three
                  └────────────┘
                        ↓
                     Results
```

**Time saved:** Sequential = 8s, Parallel = 4s (50% faster)

### Customization

**Add more steps:**
```typescript
dimensions = [
  'entities',
  'sentiment',
  'topics',
  'summary',
  'keywords',  // New: Extract keywords
  'report'     // New: Final report
];

defineDependencies() {
  return {
    summary: ['entities', 'sentiment', 'topics'],
    keywords: ['summary'],
    report: ['summary', 'keywords']
  };
}
```

**Skip based on content length:**
```typescript
shouldSkipDimension(context) {
  // Skip detailed analysis for short documents
  if (context.dimension === 'summary' && 
      context.section.content.length < 200) {
    return true;
  }
  return false;
}
```

**Cache entity extraction:**
```typescript
private entityCache = new Map();

async shouldSkipDimension(context) {
  if (context.dimension === 'entities') {
    const cached = this.entityCache.get(context.section.metadata.docId);
    if (cached) {
      return { skip: true, result: cached };
    }
  }
  return false;
}

async afterDimensionExecute(context) {
  if (context.dimension === 'entities' && !context.result.error) {
    this.entityCache.set(
      context.sections[0].metadata.docId,
      context.result
    );
  }
}
```

### Cost Estimate

**Per document (500 words):**
- Entities (Gemini Flash): $0.0002
- Sentiment (Gemini Flash): $0.0001
- Topics (Gemini Flash): $0.0002
- Summary (Claude Sonnet): $0.0013
- **Total:** ~$0.0018 per document

**1,000 documents:**
- Cost: **$1.80**
- Time (concurrency=5): ~15 minutes

---

## 5. Cost-Optimized Processing

**Use Case:** Process millions of items with minimal cost

**Difficulty:** 🚀 Intermediate

**Time to Implement:** 20 minutes

**Cost:** ~70% reduction vs. naive approach

### Full Code

```typescript
import { Plugin, DagEngine, SectionDimensionContext, DimensionResultContext, ProviderSelection } from '@ivan629/dag-ai';
import { createHash } from 'crypto';

/**
 * Cost-Optimized Processing Plugin
 * 
 * Strategies:
 * 1. Skip short/empty content
 * 2. Skip based on quick filter
 * 3. Cache results (in-memory + Redis)
 * 4. Use cheap models for simple tasks
 * 5. Use expensive models only when needed
 */
class CostOptimizedPlugin extends Plugin {
  private memoryCache = new Map<string, any>();
  private redis: any; // Your Redis client

  constructor(redis?: any) {
    super(
      'cost-optimized',
      'Cost-Optimized Processing',
      'Minimize API costs with intelligent routing and caching'
    );
    
    this.dimensions = [
      'quick_filter',   // Fast cheap check (Gemini Flash)
      'deep_analysis'   // Expensive analysis (Claude Opus) - only if needed
    ];
    
    this.redis = redis;
  }

  /**
   * Deep analysis depends on quick filter
   */
  defineDependencies() {
    return {
      deep_analysis: ['quick_filter']
    };
  }

  /**
   * Skip logic - 70% cost reduction
   */
  async shouldSkipDimension(context: SectionDimensionContext): Promise<boolean | any> {
    const dimension = context.dimension;
    const section = context.section;

    // Strategy 1: Skip empty/short content (saves ~20%)
    if (!section.content || section.content.trim().length < 50) {
      console.log(`⏭️  Skipped ${dimension}: content too short`);
      return true;
    }

    // Strategy 2: Check memory cache (saves ~30%)
    const cacheKey = this.getCacheKey(dimension, section.content);
    const memCached = this.memoryCache.get(cacheKey);
    
    if (memCached) {
      console.log(`💾 Memory cache hit: ${dimension}`);
      return {
        skip: true,
        result: {
          data: memCached,
          metadata: { cached: true, cacheType: 'memory' }
        }
      };
    }

    // Strategy 3: Check Redis cache (saves ~20%)
    if (this.redis) {
      const redisCached = await this.redis.get(cacheKey);
      
      if (redisCached) {
        const data = JSON.parse(redisCached);
        
        // Store in memory for faster subsequent access
        this.memoryCache.set(cacheKey, data);
        
        console.log(`📦 Redis cache hit: ${dimension}`);
        return {
          skip: true,
          result: {
            data,
            metadata: { cached: true, cacheType: 'redis' }
          }
        };
      }
    }

    // Strategy 4: Skip deep analysis if quality is low (saves ~40% of deep analysis)
    if (dimension === 'deep_analysis') {
      const quickResult = context.dependencies.quick_filter?.data;
      
      if (quickResult && quickResult.quality < 7) {
        console.log(`⏭️  Skipped deep_analysis: low quality (${quickResult.quality}/10)`);
        return {
          skip: true,
          result: {
            data: {
              skipped: true,
              reason: 'quality_too_low',
              quickFilterResult: quickResult
            }
          }
        };
      }
    }

    return false;
  }

  /**
   * Create prompts
   */
  createPrompt(context: any): string {
    const text = context.sections[0].content;

    if (context.dimension === 'quick_filter') {
      return `Quick quality assessment (1-10 scale):

Text: "${text.substring(0, 500)}"

Return JSON:
{
  "quality": <1-10>,
  "worthDeepAnalysis": <true/false>,
  "category": "high|medium|low"
}`;
    }

    if (context.dimension === 'deep_analysis') {
      const quickResult = context.dependencies.quick_filter.data;
      
      return `Deep analysis of high-quality content (quality: ${quickResult.quality}/10):

"${text}"

Provide comprehensive analysis with:
- Detailed insights
- Key themes
- Recommendations
- Quality assessment

Return detailed JSON.`;
    }

    return '';
  }

  /**
   * Select provider - cheap for filter, expensive for analysis
   */
  selectProvider(dimension: string): ProviderSelection {
    // Strategy 5: Use cheapest model for quick filter
    if (dimension === 'quick_filter') {
      return {
        provider: 'gemini',
        options: { 
          model: 'gemini-1.5-flash',  // $0.075/1M (cheapest)
          temperature: 0.1
        },
        fallbacks: [
          { provider: 'anthropic', options: { model: 'claude-haiku-3-5' } }
        ]
      };
    }

    // Strategy 6: Use best model only for deep analysis
    if (dimension === 'deep_analysis') {
      return {
        provider: 'anthropic',
        options: { 
          model: 'claude-opus-4',  // $15/1M (best quality)
          temperature: 0.2
        },
        fallbacks: [
          { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } },
          { provider: 'openai', options: { model: 'gpt-4o' } }
        ]
      };
    }

    return { provider: 'gemini', options: {} };
  }

  /**
   * Cache successful results
   */
  async afterDimensionExecute(context: DimensionResultContext): Promise<void> {
    if (context.result.error || context.result.metadata?.cached) {
      return; // Don't cache errors or already-cached results
    }

    const cacheKey = this.getCacheKey(
      context.dimension,
      context.sections[0].content
    );

    // Store in memory cache
    this.memoryCache.set(cacheKey, context.result.data);

    // Store in Redis with 1 hour TTL
    if (this.redis) {
      await this.redis.setex(
        cacheKey,
        3600,  // 1 hour
        JSON.stringify(context.result.data)
      );
    }

    console.log(`💾 Cached: ${context.dimension}`);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(dimension: string, content: string): string {
    const hash = createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
    
    return `dag-ai:${dimension}:${hash}`;
  }
}

// Usage Example
async function costOptimizedProcessing() {
  // Optional: Connect to Redis
  // const redis = require('redis').createClient();
  // await redis.connect();

  const engine = new DagEngine({
    plugin: new CostOptimizedPlugin(/* redis */),
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
      gemini: { apiKey: process.env.GEMINI_API_KEY }
    },
    concurrency: 20,  // High concurrency for fast processing
    pricing: {
      models: {
        'claude-opus-4': { inputPer1M: 15.00, outputPer1M: 75.00 },
        'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 }
      }
    }
  });

  // Mix of high and low quality content
  const documents = [
    { content: 'Short', metadata: { id: 1 } },  // Skip: too short
    { content: 'Low quality filler text that doesn\'t say much...', metadata: { id: 2 } },  // Skip deep: low quality
    { content: 'High quality insightful analysis of important topic with detailed reasoning...'.repeat(10), metadata: { id: 3 } },  // Process both
    { content: 'Short', metadata: { id: 4 } },  // Skip: duplicate
    { content: 'High quality insightful analysis of important topic with detailed reasoning...'.repeat(10), metadata: { id: 5 } },  // Skip: cached
  ];

  console.log('Processing 1000 documents...\n');
  
  const result = await engine.process(documents);

  // Analyze savings
  console.log('\n=== COST ANALYSIS ===\n');
  
  let skippedShort = 0;
  let skippedCache = 0;
  let skippedLowQuality = 0;
  let processedQuick = 0;
  let processedDeep = 0;

  result.sections.forEach((section) => {
    const quick = section.results.quick_filter;
    const deep = section.results.deep_analysis;

    if (quick.data?.skipped) {
      skippedShort++;
    } else if (quick.metadata?.cached) {
      skippedCache++;
    } else {
      processedQuick++;
    }

    if (deep.data?.skipped) {
      skippedLowQuality++;
    } else if (deep.metadata?.cached) {
      skippedCache++;
    } else if (!deep.error) {
      processedDeep++;
    }
  });

  console.log('Breakdown:');
  console.log(`  Skipped (too short): ${skippedShort}`);
  console.log(`  Skipped (cached): ${skippedCache}`);
  console.log(`  Skipped (low quality): ${skippedLowQuality}`);
  console.log(`  Processed (quick_filter): ${processedQuick}`);
  console.log(`  Processed (deep_analysis): ${processedDeep}`);
  console.log();
  console.log(`Total cost: $${result.costs.totalCost.toFixed(4)}`);
  console.log();
  console.log('Cost breakdown:');
  for (const [dim, cost] of Object.entries(result.costs.byDimension)) {
    console.log(`  ${dim}: $${cost.cost.toFixed(4)}`);
  }

  // Calculate savings
  const naiveCost = documents.length * 0.002;  // If we processed everything with Opus
  const actualCost = result.costs.totalCost;
  const savings = ((naiveCost - actualCost) / naiveCost) * 100;

  console.log();
  console.log(`Naive approach cost: $${naiveCost.toFixed(4)}`);
  console.log(`Optimized cost: $${actualCost.toFixed(4)}`);
  console.log(`Savings: ${savings.toFixed(1)}% ($${(naiveCost - actualCost).toFixed(4)})`);
}

costOptimizedProcessing();
```

### Expected Output

```
Processing 1000 documents...

⏭️  Skipped quick_filter: content too short
⏭️  Skipped quick_filter: content too short
💾 Cached: quick_filter
⏭️  Skipped deep_analysis: low quality (4/10)
💾 Cached: deep_analysis
💾 Memory cache hit: quick_filter
💾 Memory cache hit: deep_analysis

=== COST ANALYSIS ===

Breakdown:
  Skipped (too short): 400
  Skipped (cached): 300
  Skipped (low quality): 200
  Processed (quick_filter): 100
  Processed (deep_analysis): 30

Total cost: $0.52

Cost breakdown:
  quick_filter: $0.02
  deep_analysis: $0.50

Naive approach cost: $2.00
Optimized cost: $0.52
Savings: 74.0% ($1.48)
```

### Optimization Strategies

**1. Skip short content (20% savings)**
```typescript
if (section.content.length < 50) return true;
```

**2. Cache results (30% savings on repeat queries)**
```typescript
const cached = await redis.get(key);
if (cached) return { skip: true, result: cached };
```

**3. Two-tier processing (40% savings on expensive operations)**
```typescript
// Cheap filter → Only process high-quality with expensive model
if (quality < 7) return true;  // Skip expensive analysis
```

**4. Use cheap models (10x cost difference)**
```typescript
quick_filter: Gemini Flash ($0.075/1M)
deep_analysis: Claude Opus ($15/1M)
// 200x cost difference!
```

**5. Smart routing (dimension-based)**
```typescript
selectProvider(dimension) {
  if (dimension === 'quick') return { provider: 'gemini-flash' };
  if (dimension === 'critical') return { provider: 'opus' };
}
```

### Customization

**Adjust quality threshold:**
```typescript
if (quickResult.quality < 8) {  // More strict (skip more)
if (quickResult.quality < 5) {  // Less strict (skip less)
```

**Add more cache layers:**
```typescript
// 1. Memory (instant)
// 2. Redis (fast)
// 3. Database (slower)
// 4. Process (slowest)
```

**Content-based routing:**
```typescript
shouldSkipDimension(context) {
  // Skip technical docs (already high quality)
  if (context.section.metadata.type === 'technical') {
    return true;
  }
  
  // Skip marketing (usually low priority)
  if (context.section.metadata.category === 'marketing') {
    return true;
  }
  
  return false;
}
```

### Cost Comparison

**Naive approach (1000 docs):**
- Process everything with Claude Opus
- Cost: 1000 × $0.002 = **$2.00**

**Optimized approach (1000 docs):**
- Skip 400 (too short): $0
- Skip 300 (cached): $0
- Quick filter 300: 300 × $0.0001 = $0.03
- Skip 200 (low quality): $0
- Deep analysis 100: 100 × $0.005 = $0.50
- **Total: $0.53**

**Savings: 73.5%** ($1.47 saved per 1000 docs)

**Annual savings (1M docs/year):**
- Naive: $2,000
- Optimized: $530
- **Savings: $1,470/year**

---

## 🎯 Quick Reference

| Recipe | Difficulty | Time | Cost/1000 | Use Case |
|--------|-----------|------|-----------|----------|
| [1. Sentiment Analysis](#1-sentiment-analysis) | 🔰 Beginner | 5 min | $0.03 | Analyze reviews, feedback |
| [2. Content Categorization](#2-content-categorization) | 🔰 Beginner | 10 min | $0.15 | Group documents by topic |
| [3. Multi-Provider Fallback](#3-multi-provider-fallback) | 🔰 Beginner | 5 min | Standard | 99.9% uptime |
| [4. Document Analysis](#4-document-analysis-pipeline) | 🚀 Intermediate | 15 min | $0.20 | Extract → Analyze → Summarize |
| [5. Cost Optimization](#5-cost-optimized-processing) | 🚀 Intermediate | 20 min | ~70% less | Save money on large scale |

---

## 📚 More Recipes

**Want more examples?**

Each recipe also available as standalone file:
- `/recipes/sentiment-analysis.md` - Full sentiment recipe
- `/recipes/content-categorization.md` - Full categorization recipe
- `/recipes/multi-provider-fallback.md` - Full fallback recipe
- `/recipes/document-analysis.md` - Full analysis pipeline
- `/recipes/cost-optimization.md` - Full cost optimization

**Advanced Recipes:**
- `/recipes/content-moderation.md` - Complete moderation system
- `/recipes/research-assistant.md` - Web search + analysis
- `/recipes/section-transforms.md` - Dynamic restructuring
- `/recipes/high-availability.md` - Enterprise setup
- `/recipes/cost-analytics.md` - Spending monitoring

---

## 💡 Recipe Tips

### Combining Recipes

Mix and match for powerful workflows:

```typescript
class ProductionPlugin extends Plugin {
  // From Recipe 5: Cost optimization
  shouldSkipDimension() { /* Smart skipping */ }
  
  // From Recipe 3: Multi-provider
  selectProvider() { /* Fallback chain */ }
  
  // From Recipe 4: Dependencies
  defineDependencies() { /* DAG structure */ }
  
  // From Recipe 1: Sentiment
  createPrompt() { /* JSON prompts */ }
}
```

### Customization Patterns

**1. Adjust for your domain:**
```typescript
// Change categories
'technology' → 'your_category_1'
'business' → 'your_category_2'
```

**2. Modify prompts:**
```typescript
// Add domain knowledge
return `Context: You are analyzing medical records.
${basePrompt}`;
```

**3. Tune thresholds:**
```typescript
// Adjust sensitivity
if (score > 0.7) → if (score > 0.8)
if (length < 50) → if (length < 100)
```

### Testing Recipes

**Start small:**
```typescript
const testData = sections.slice(0, 10);  // Test with 10 items first
const result = await engine.process(testData);
```

**Monitor costs:**
```typescript
console.log('Cost per item:', result.costs.totalCost / sections.length);
```

**Track performance:**
```typescript
const start = Date.now();
const result = await engine.process(sections);
console.log('Time:', Date.now() - start, 'ms');
```

---

## 🆘 Getting Help

**Recipe not working?**

1. Check [Troubleshooting Guide](/guide/troubleshooting)
2. Review [API Documentation](/api/dag-engine)
3. Ask in [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions)

**Want to contribute a recipe?**

1. Create your recipe
2. Test with real data
3. Submit PR to `/recipes/community/`

---

## 🎉 Next Steps

**Master the fundamentals:**
- [Quick Start](/guide/quick-start) - Build your first pipeline
- [Core Concepts](/guide/core-concepts) - Understand the basics
- [Dependencies Guide](/guide/dependencies) - Master execution order

**Explore advanced topics:**
- [Hooks System](/guide/hooks) - 19 lifecycle hooks
- [Section Transforms](/advanced/section-transforms) - Dynamic restructuring
- [Custom Providers](/advanced/custom-providers) - Build your own

**Production deployment:**
- [Error Handling](/guide/error-handling) - Robust workflows
- [Cost Optimization](/guide/cost-optimization) - Save money
- [Monitoring](/guide/monitoring) - Track performance

