---
title: 03 - Section vs Global
description: THE killer feature - two types of dimensions
---

# 03 - Section vs Global

**THE killer feature of dag-ai.** Learn the difference between per-item and cross-item analysis.

---

## What You'll Learn

- ✅ Section dimensions (per-item, parallel)
- ✅ Global dimensions (cross-item, sequential)
- ✅ When to use each scope
- ✅ How dag-ai aggregates results automatically
- ✅ Building elegant multi-scope workflows

**Time:** 7 minutes

---

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 03
```

---

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
- 5 reviews analyzed **independently** in parallel (section)
- Results **automatically aggregated** by dag-ai
- 1 overall analysis created **across all reviews** (global)
- Total: **6 API calls** (5 parallel + 1 sequential)

---

## The Complete Code

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

**Key difference:**
- Section dimensions: Default scope, just use string
- Global dimensions: Must specify `{ name: '...', scope: 'global' }`

---

### Step 2: Define Dependencies
```typescript
defineDependencies() {
	return {
		overall_analysis: ['analyze_sentiment']
	};
}
```

Global dimension waits for **all** section results.

---

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

**Critical difference:**
- **Section**: Gets ONE item to analyze
- **Global**: Gets ALL results from dependencies

---

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

**[📁 View full source on GitHub](https://github.com/ivan629/dag-ai/tree/main/examples/03-section-vs-global)**

---

## Key Concepts

### 1. Section Dimensions (Default)

**Run once per item, in parallel:**
```typescript
this.dimensions = ['analyze_sentiment'];  // Section by default
```

**Characteristics:**
- Parallel execution (all items processed together)
- Independent analysis (each item isolated)
- Fast and scalable
- Per-item results

---

### 2. Global Dimensions (Explicit)

**Run once across all items, sequentially:**
```typescript
this.dimensions = [
  { name: 'overall_analysis', scope: 'global' }
];
```

**Characteristics:**
- Sequential execution (runs after dependencies)
- Cross-item synthesis
- Aggregation and comparison
- Single result for all items

---

### 3. Automatic Aggregation

**dag-ai automatically packages section results for global dimensions:**
```typescript
// You write this:
defineDependencies() {
  return {
    overall_analysis: ['analyze_sentiment']  // Global depends on section
  };
}

// dag-ai does this automatically:
// 1. Collects all section results
// 2. Packages into aggregated format
// 3. Passes to global dimension via ctx.dependencies
```

**No manual aggregation code needed!**

---

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
  dag-ai collects: [Result 1, Result 2, ..., Result 5]

GLOBAL SCOPE:
  All 5 results → overall_analysis → Overall result

Output: 5 section results + 1 global result
```

---

## When to Use Each Scope

### Use SECTION Dimensions For:

✅ **Sentiment analysis** - Each review independent  
✅ **Topic extraction** - Each document separate  
✅ **Entity recognition** - Each text analyzed alone  
✅ **Classification** - Each item categorized  
✅ **Translation** - Each sentence independent  
✅ **Summarization** - Each article separate

**Rule:** If analysis doesn't need other items → **Section**

---

### Use GLOBAL Dimensions For:

✅ **Overall summary** - Synthesize all results  
✅ **Comparison** - Find patterns across items  
✅ **Aggregation** - Count, average, totals  
✅ **Ranking** - Sort items by criteria  
✅ **Grouping** - Cluster similar items  
✅ **Recommendations** - Based on all data

**Rule:** If analysis needs other items → **Global**

---

## Execution Pattern

**Section dimensions run in parallel, global dimensions run sequentially:**
```
Section (parallel) → Aggregation (automatic) → Global (sequential)
```

With this example's 5 reviews:
- Section calls run in parallel (5 simultaneous calls)
- Global call runs after all section calls complete (1 call)
- Total: 6 API calls

**Benefit:** Parallel execution of independent work, with automatic aggregation for synthesis.

---

## Real-World Examples

### Example 1: Content Moderation
```typescript
this.dimensions = [
  'detect_toxicity',           // Section: per comment
  'detect_spam',               // Section: per comment
  { name: 'safety_report', scope: 'global' }  // Global: overall safety
];
```

---

### Example 2: Document Analysis
```typescript
this.dimensions = [
  'extract_entities',          // Section: per document
  'classify_topic',            // Section: per document
  { name: 'knowledge_graph', scope: 'global' }  // Global: connect all entities
];
```

---

### Example 3: Customer Feedback
```typescript
this.dimensions = [
  'sentiment',                 // Section: per review
  'categorize',                // Section: per review
  { name: 'trend_analysis', scope: 'global' }  // Global: trends over time
];
```

---

## Multi-Model Strategy

**Use different models for different scopes:**
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
    // Global: Powerful model (one call, complex task)
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-sonnet-20241022' }
    };
  }
}
```

**Benefits:**
- Optimize cost (cheap model for bulk work)
- Optimize quality (smart model for synthesis)
- Best of both worlds

---

## Customization

### Add More Reviews
```typescript
const sections: SectionData[] = [
  { content: 'Review 1...', metadata: { id: 1 } },
  { content: 'Review 2...', metadata: { id: 2 } },
  // Add as many as you want
];
```

Scales automatically - more reviews = more parallel section calls.

---

### Multiple Global Dimensions
```typescript
this.dimensions = [
  'sentiment',                           // Section
  { name: 'summary', scope: 'global' },  // Global 1
  { name: 'trends', scope: 'global' }    // Global 2
];

defineDependencies() {
  return {
    summary: ['sentiment'],
    trends: ['sentiment']   // Both globals use same section results
  };
}
```

Both global dimensions run in parallel (independent of each other).

---

### Chain Scopes
```typescript
this.dimensions = [
  'sentiment',                         // Section
  { name: 'categorize', scope: 'global' },  // Global 1: group by sentiment
  'detailed_analysis',                 // Section (on new grouped sections)
  { name: 'final_report', scope: 'global' } // Global 2: final synthesis
];
```

Alternate between scopes for complex workflows!

---

## Next Steps

**Ready for more?**

1. **[04 - Transformations](/examples/04-transformations)** - Dynamic section changes
2. **[05 - Skip Logic](/examples/05-skip-logic)** - Conditional execution
3. **[Production Quickstart](/examples/00-quickstart)** - All features together

**Want to experiment?**

- Add a `categorize` section dimension to group reviews
- Add a `comparison` global dimension to compare categories
- Try with more reviews to see parallelization

---

## Troubleshooting

### Global Result is Undefined
```typescript
const overall = result.globalResults.overall_analysis?.data;  // undefined
```

**Cause:** Dimension name mismatch or wrong scope

**Fix:**
```typescript
// Make sure name matches and scope is 'global'
this.dimensions = [
	{ name: 'overall_analysis', scope: 'global' }  // ✓
];
```

---

### Dependencies Not Aggregated
```typescript
// In global dimension prompt
const sentimentData = ctx.dependencies.analyze_sentiment?.data;
// Not aggregated format
```

**Cause:** Dependency is not a section dimension

**Fix:** Make sure dependent dimension is section-scoped:
```typescript
this.dimensions = [
	'analyze_sentiment',  // Section (default) ✓
	{ name: 'overall', scope: 'global' }
];
```

---

### Wrong Results in Global

**Check:** Are you accessing the data correctly?
```typescript
// ✓ Correct
const sentimentData = ctx.dependencies.analyze_sentiment?.data;
if (sentimentData?.aggregated) {
	const allResults = sentimentData.sections;  // Array of results
}

// ✗ Wrong
const sentimentData = ctx.dependencies.analyze_sentiment;
const allResults = sentimentData.data;  // Not aggregated format
```

---

## Summary

**What you learned:**

✅ Section dimensions - Per-item, parallel analysis  
✅ Global dimensions - Cross-item, sequential synthesis  
✅ Automatic aggregation - dag-ai handles data flow  
✅ Dual-scope workflows - The killer feature  
✅ When to use each - Clear decision framework

**Key insight:**

**This is what makes dag-ai unique.** Other frameworks treat everything as sequential tasks. dag-ai has **two scopes** that let you elegantly combine parallel per-item analysis with sequential cross-item synthesis.

**The power:** Build workflows that scale (parallel section) AND synthesize (global) without writing concurrency code.

**Next:** [04 - Transformations →](/examples/04-transformations)

Learn how to dynamically restructure your data mid-pipeline!