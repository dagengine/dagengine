---
title: 03 - Section vs Global
description: Two types of dimensions for per-item and cross-item analysis
---

# 03 - Section vs Global

Section dimensions analyze each item independently in parallel. Global dimensions synthesize across all items sequentially.

## What You'll Learn

- ✅ Define section dimensions for per-item analysis
- ✅ Define global dimensions for cross-item synthesis
- ✅ Understand automatic result aggregation
- ✅ Choose the right scope for your task
- ✅ Build multi-scope workflows

**Time:** 7 minutes

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 03
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/03-section-vs-global)**

## What You'll See
```
📚 Fundamentals 03: Section vs Global

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE CONCEPT: Section vs Global
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 SECTION DIMENSIONS (default)
   - Run once PER item
   - Execute in PARALLEL
   - Independent analysis

   Example: analyze_sentiment
   ├─ Review 1 → sentiment (parallel)
   ├─ Review 2 → sentiment (parallel)
   ├─ Review 3 → sentiment (parallel)
   ├─ Review 4 → sentiment (parallel)
   └─ Review 5 → sentiment (parallel)

🌍 GLOBAL DIMENSIONS
   - Run once ACROSS ALL items
   - Execute SEQUENTIALLY
   - Cross-item synthesis

   Example: overall_analysis
   └─ All 5 sentiments → overall (1 call)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION RESULTS (per review)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "Amazing product! Exceeded all expectations."
   😊 Sentiment: positive (0.95)

2. "Good quality, fair price. Happy with purchase."
   😊 Sentiment: positive (0.80)

3. "Terrible. Broke after one day."
   😞 Sentiment: negative (0.90)

4. "It's okay. Nothing special."
   😐 Sentiment: neutral (0.30)

5. "Love it! Best purchase this year."
   😊 Sentiment: positive (0.95)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GLOBAL RESULTS (across all reviews)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Total Reviews: 5
   ├─ 😊 Positive: 3
   ├─ 😞 Negative: 1
   └─ 😐 Neutral: 1

📈 Average Score: 0.78
🎯 Overall Sentiment: positive

💡 Recommendation:
   Business performing well with 60% positive reviews.
   Focus on addressing negative feedback while maintaining
   positive aspects.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Completed in 5.17s
💰 Cost: $0.0044
🎫 Tokens: 1,054
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What happened?**

- 5 reviews analyzed independently with section dimension (5 parallel API calls)
- dag-engine automatically aggregated all sentiment results
- 1 overall analysis synthesized across all reviews with global dimension (1 sequential call)
- Total execution: 5.17 seconds, $0.0044 cost, 1,054 tokens across 6 API calls

## Code Walkthrough

### Step 1: Define Section and Global Dimensions
```typescript
class ReviewAnalyzer extends Plugin {
  constructor() {
    super('review-analyzer', 'Review Analyzer', 'Dual scope demo');

    this.dimensions = [
      'analyze_sentiment',                           // Section (default)
      { name: 'overall_analysis', scope: 'global' }  // Global (explicit)
    ];
  }
}
```

**Key point:** Section dimensions use string syntax. Global dimensions require explicit object notation with `scope: 'global'`.

### Step 2: Define Dependencies
```typescript
defineDependencies() {
  return {
    overall_analysis: ['analyze_sentiment']
  };
}
```

**Key point:** Global dimension waits for all section results to complete before executing.

### Step 3: Create Prompts for Each Scope
```typescript
createPrompt(ctx: PromptContext): string {
  const { dimension, sections, dependencies } = ctx;

  if (dimension === 'analyze_sentiment') {
    // SECTION: ctx.sections contains ONE review
    const review = sections[0]?.content || '';

    return `Analyze sentiment: "${review}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }

  if (dimension === 'overall_analysis') {
    // GLOBAL: ctx.dependencies contains ALL sentiment results
    const sentimentData = dependencies.analyze_sentiment?.data;
    const allSentiments = sentimentData.sections.map(sectionResult => ({
      sentiment: sectionResult.data?.sentiment,
      score: sectionResult.data?.score
    }));

    return `Analyze ${allSentiments.length} reviews:
    ${JSON.stringify(allSentiments)}
    
    Return JSON: {
      "total_reviews": number,
      "positive_count": number,
      "negative_count": number,
      "average_score": number,
      "overall_sentiment": "positive|negative|neutral",
      "recommendation": "business recommendation"
    }`;
  }
}
```

**Key point:** Section dimensions receive one item at a time. Global dimensions receive all aggregated results from their dependencies.

### Step 4: Process and Access Results
```typescript
const result = await engine.process(sections);

// Section results (per-item)
result.sections.forEach(sectionResult => {
  const sentiment = sectionResult.results.analyze_sentiment?.data;
  console.log('Review sentiment:', sentiment.sentiment);
});

// Global results (cross-item)
const overall = result.globalResults.overall_analysis?.data;
console.log('Overall:', overall.overall_sentiment);
console.log('Breakdown:', overall.positive_count, 'positive');
```

## Key Concepts

### 1. Section Dimensions

Run once per item, in parallel:
```typescript
this.dimensions = ['analyze_sentiment'];  // Section by default
```

**Characteristics:**
- Parallel execution across all items
- Independent analysis with no cross-item visibility
- Scales linearly with item count
- Each item produces its own result

### 2. Global Dimensions

Run once across all items, sequentially:
```typescript
this.dimensions = [
  { name: 'overall_analysis', scope: 'global' }
];
```

**Characteristics:**
- Sequential execution after dependencies complete
- Cross-item synthesis and aggregation
- Single result covering all items
- Receives aggregated dependency results

### 3. Automatic Aggregation

dag-engine automatically packages section results for global dimensions:
```typescript
// Define dependency
defineDependencies() {
  return {
    overall_analysis: ['analyze_sentiment']  // Global depends on section
  };
}

// dag-engine automatically:
// 1. Collects all section results
// 2. Packages into aggregated format
// 3. Passes to global dimension via ctx.dependencies
```

**Characteristics:**
- No manual aggregation code required
- Section results automatically collected
- Aggregated data structure provided to global dimensions
- Maintains result metadata and structure

### 4. Data Flow Between Scopes
```
Input: 5 reviews

SECTION SCOPE:
  Review 1 → analyze_sentiment → Result 1
  Review 2 → analyze_sentiment → Result 2
  Review 3 → analyze_sentiment → Result 3
  Review 4 → analyze_sentiment → Result 4
  Review 5 → analyze_sentiment → Result 5

AUTOMATIC AGGREGATION:
  dag-engine collects: [Result 1, Result 2, ..., Result 5]

GLOBAL SCOPE:
  All 5 results → overall_analysis → Overall result

Output: 5 section results + 1 global result
```

**Characteristics:**
- Section dimensions process items independently
- Aggregation happens automatically between scopes
- Global dimensions receive complete aggregated data
- Results available at both section and global levels

## When to Use Each Scope

### Use Section Dimensions For:

Independent analysis where each item stands alone:

- Sentiment analysis on individual reviews
- Topic extraction from separate documents
- Entity recognition in isolated texts
- Classification of individual items
- Translation of separate sentences
- Summarization of distinct articles

### Use Global Dimensions For:

Cross-item synthesis where analysis requires multiple items:

- Overall summaries synthesizing all results
- Pattern detection across items
- Aggregation of counts, averages, totals
- Ranking items by specific criteria
- Clustering similar items into groups
- Recommendations based on complete dataset

## Execution Patterns

### Pattern 1: Section → Global (This Example)
```typescript
this.dimensions = [
  'sentiment',                              // Section
  { name: 'overall', scope: 'global' }     // Global
];

defineDependencies() {
  return {
    overall: ['sentiment']
  };
}
```

Execution: 5 parallel section calls → 1 global call

### Pattern 2: Multiple Globals
```typescript
this.dimensions = [
  'sentiment',                              // Section
  { name: 'summary', scope: 'global' },    // Global 1
  { name: 'trends', scope: 'global' }      // Global 2
];

defineDependencies() {
  return {
    summary: ['sentiment'],
    trends: ['sentiment']
  };
}
```

Both global dimensions run in parallel after section completes.

### Pattern 3: Multi-Model Strategy
```typescript
selectProvider(dimension: string) {
  if (dimension === 'analyze_sentiment') {
    // Section: Fast, cheap model (many calls)
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-haiku-20241022' }
    };
  }
  
  if (dimension === 'overall_analysis') {
    // Global: Powerful model (one call, complex synthesis)
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-sonnet-20241022' }
    };
  }
}
```

Optimize cost for bulk work, optimize quality for synthesis.

## Summary

**What you learned:**

✅ **Section dimensions** - Per-item parallel analysis for independent tasks  
✅ **Global dimensions** - Cross-item sequential synthesis for aggregation  
✅ **Automatic aggregation** - dag-engine handles data flow between scopes  
✅ **Scope selection** - Clear rules for choosing section vs global  
✅ **Multi-scope workflows** - Combine both scopes for powerful pipelines

**Key insight:**

Section and global dimensions create a natural pattern for scalable data processing. Section dimensions parallelize independent work across items, while global dimensions synthesize results across the entire dataset. dag-engine automatically aggregates section results and passes them to global dimensions, eliminating manual coordination code. This dual-scope architecture handles both breadth (analyzing many items) and depth (synthesizing insights) in a single pipeline.

## Troubleshooting

### Global Result is Undefined
```typescript
const overall = result.globalResults.overall_analysis?.data;  // undefined
```

**Cause:** Dimension name doesn't match or scope not set to global.

**Fix:**
```typescript
// Ensure name matches exactly and scope is 'global'
this.dimensions = [
  { name: 'overall_analysis', scope: 'global' }
];
```

### Dependencies Not Aggregated
```typescript
// In global dimension prompt
const sentimentData = ctx.dependencies.analyze_sentiment?.data;
// sentimentData is not in aggregated format
```

**Cause:** Dependency dimension is global instead of section.

**Fix:**
```typescript
// Dependent dimension must be section-scoped
this.dimensions = [
  'analyze_sentiment',  // Section (default)
  { name: 'overall', scope: 'global' }
];
```

### Wrong Data Structure in Global
```typescript
// Accessing aggregated data incorrectly
const allResults = ctx.dependencies.analyze_sentiment?.data;
```

**Cause:** Incorrect path to aggregated section results.

**Fix:**
```typescript
// Correct path to aggregated results
const sentimentData = ctx.dependencies.analyze_sentiment?.data;
if (sentimentData?.aggregated) {
  const allResults = sentimentData.sections;  // Array of all results
}
```