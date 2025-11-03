---
title: Advanced Quickstart
description: Build a production-ready review analyzer with all dagengine features
---

# Advanced Quickstart

Build a complete customer review analyzer that demonstrates spam filtering, parallel execution, smart grouping, multi-model orchestration, and real-time cost tracking.

## What You'll Learn

- ✅ Skip logic for spam filtering
- ✅ Parallel execution of independent tasks
- ✅ Data transformations for smart grouping
- ✅ Multi-model orchestration
- ✅ Real-time cost tracking
- ✅ Production-ready patterns

**Time:** 10 minutes

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 00
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/00-quickstart)**

## What You'll See
```
🚀 dagengine Quickstart: Review Analysis

📊 Analyzing 20 customer reviews...

⏭️  Skipped [sentiment] for spam: "WIN BIG!!! Claim your $1000 gi..."
⏭️  Skipped [sentiment] for spam: "Your account has been suspende..."
⏭️  Skipped 8 more
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ANALYSIS RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Analyzed 10 legitimate reviews
✓ Filtered 10 spam reviews

🔴 FEATURES
├─ Insight: Users find high value in the comprehensive feature set, particularly highlighting automation capabilities and all-in-one functionality
├─ Action: Create marketing materials that emphasize the time-saving automation features and the consolidated nature of the tool
├─ Impact: high
└─ Quote: "Amazing features! The automation saves us hours every week."

🔴 PERFORMANCE
├─ Insight: Product delivers rapid return on investment within first month of use
├─ Action: Highlight fast ROI and payback period in marketing materials and sales conversations
├─ Impact: high
└─ Quote: "Best investment we made this year. ROI in first month."

🔴 PRICING
├─ Insight: Customers appreciate transparent pricing model and value the annual subscription discount
├─ Action: Continue offering annual subscription discounts and maintain pricing transparency to drive long-term customer retention
├─ Impact: high
└─ Quote: "Pricing is fair and transparent. Love the annual discount."

🔴 SUPPORT
├─ Insight: Customers are experiencing unacceptably long response times and difficulty reaching support staff
├─ Action: Increase support team headcount and implement SLA of maximum 1-hour response time for all tickets
├─ Impact: high
└─ Quote: "Support takes forever to respond. Waited 6 hours for simple question."

🔴 UX
├─ Insight: Users struggle with basic onboarding and interface navigation, leading to extended learning periods
├─ Action: Create an interactive guided tour and improve documentation for core features and basic tasks
├─ Impact: high
└─ Quote: "Interface is confusing. Took weeks to figure out basic tasks."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Product shows strong value proposition with comprehensive features and rapid ROI, but is held back by significant customer experience issues. Users praise the automation capabilities and transparent pricing model, while struggling with poor support response times and difficult interface navigation. These friction points are limiting full product adoption and value realization.

🎯 Top Priorities:
   1. Improve support response times by expanding team and implementing 1-hour SLA
   2. Enhance user onboarding with guided product tour and improved documentation
   3. Develop marketing materials highlighting automation ROI and all-in-one functionality

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 COST BREAKDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 By Dimension:

   filter_spam:
   ├─ Calls:  20
   ├─ Model:  Haiku
   ├─ Tokens: 8,107 (6,548 in, 1,559 out)
   └─ Cost:   $0.0115

   sentiment:
   ├─ Calls:  10
   ├─ Model:  Haiku
   ├─ Tokens: 934 (704 in, 230 out)
   └─ Cost:   $0.0015

   categorize:
   ├─ Calls:  10
   ├─ Model:  Haiku
   ├─ Tokens: 846 (704 in, 142 out)
   └─ Cost:   $0.0011

   group_by_category:
   ├─ Calls:  1
   ├─ Model:  Haiku
   ├─ Tokens: 747 (372 in, 375 out)
   └─ Cost:   $0.0018

   analyze_category:
   ├─ Calls:  5
   ├─ Model:  Sonnet
   ├─ Tokens: 1,080 (621 in, 459 out)
   └─ Cost:   $0.0087

   executive_summary:
   ├─ Calls:  1
   ├─ Model:  Sonnet
   ├─ Tokens: 575 (419 in, 156 out)
   └─ Cost:   $0.0036

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️ Duration:        24.0s
💰 Total Cost:      $0.0282
🎫 Total Tokens:    12,289
📞 API Calls Made:  47
⏭️  API Calls Saved: 20 (spam filtered)
🎯 Efficiency Gain: 30% fewer API calls
```

**What happened?**

- Pipeline processed 20 customer reviews through 6 dimensions
- Spam filter (Haiku) detected 10 spam reviews and skipped downstream analysis
- Sentiment and categorization ran in parallel on 10 legitimate reviews
- Reviews grouped by category (features, performance, pricing, support, UX)
- Deep analysis (Sonnet) generated insights per category (5 categories)
- Executive summary (Sonnet) synthesized findings into actionable priorities
- Skip logic saved 20 API calls (30% efficiency gain)

## Code Walkthrough

The pipeline combines skip logic, parallel execution, transformations, and multi-model selection into a production-ready workflow.

**[📁 View full source on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/00-quickstart)**
```typescript
class ReviewAnalyzer extends Plugin {
	constructor() {
		super(
			"review-analyzer",
			"Review Analyzer",
			"Production review analysis"
		);

		this.dimensions = [
			"filter_spam",        // Stage 1: Detect spam
			"sentiment",          // Stage 2: Parallel analysis
			"categorize",         // Stage 2: Parallel analysis
			{
				name: "group_by_category",  // Stage 3: Transform data
				scope: "global",
				transform: this.groupByCategory.bind(this)
			},
			"analyze_category",   // Stage 4: Deep insights per category
			{
				name: "executive_summary",  // Stage 5: Synthesize findings
				scope: "global"
			}
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			sentiment: ["filter_spam"],
			categorize: ["filter_spam"],
			group_by_category: ["categorize"],
			analyze_category: ["group_by_category"],
			executive_summary: ["analyze_category"]
		};
	}
}
```

**Key point:** Six dimensions execute in five stages. Stages 1-2 process individual reviews. Stage 3 transforms data. Stages 4-5 analyze grouped data.

### Step 1: Skip spam in downstream dimensions
```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
	if (ctx.dimension === "sentiment" || ctx.dimension === "categorize") {
		const spamCheck = ctx.dependencies.filter_spam as 
			DimensionResult<SpamCheckResult> | undefined;
		
		if (spamCheck?.data?.is_spam) {
			const content = ctx.section.content.slice(0, 50);
			console.log(`⏭️  Skipped [${ctx.dimension}] for spam: "${content}..."`);
			return true;
		}
	}
	return false;
}
```

**Key point:** The `shouldSkipSectionDimension` hook checks spam filter results and skips analysis for spam reviews. This saved 20 API calls (10 spam reviews × 2 dimensions).

### Step 2: Transform individual reviews into category groups
```typescript
groupByCategory(
	result: DimensionResult,
	sections: SectionData[]
): SectionData[] {
	const categories = new Map<string, string[]>();

	sections.forEach((section, index) => {
		const categoryResult = result.sections?.[index]?.results.categorize;
		const category = categoryResult?.data?.category || "uncategorized";

		if (!categories.has(category)) {
			categories.set(category, []);
		}
		categories.get(category)!.push(section.content);
	});

	return Array.from(categories.entries()).map(([category, reviews]) => ({
		content: reviews.join("\n\n"),
		metadata: { category, count: reviews.length }
	}));
}
```

**Key point:** The `transform` function converts individual reviews into category groups. Instead of analyzing 10 reviews individually, the pipeline analyzes 5 category groups.

### Step 3: Route dimensions to appropriate models
```typescript
selectProvider(dimension: string): ProviderSelection {
	// Use Haiku for filtering and categorization
	if (dimension === "filter_spam" || 
	    dimension === "sentiment" || 
	    dimension === "categorize" ||
	    dimension === "group_by_category") {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",  // $0.80/$4.00 per 1M tokens
				temperature: 0.2
			}
		};
	}

	// Use Sonnet for deep analysis and synthesis
	return {
		provider: "anthropic",
		options: {
			model: "claude-3-5-sonnet-20241022",  // $3.00/$15.00 per 1M tokens
			temperature: 0.3
		}
	};
}
```

**Key point:** Cheap Haiku model handles filtering and categorization (37 of 47 API calls). Expensive Sonnet model handles deep insights (6 of 47 API calls). This balance optimizes cost and quality.

### Step 4: Configure engine with pricing
```typescript
const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
	"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
};

const engine = new DagEngine({
	plugin: new ReviewAnalyzer(),
	providers: {
		anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
	},
	execution: {
		pricing: { models: PRICING },
		concurrency: 5  // Process 5 dimensions in parallel (default: 5)
	}
});

const result = await engine.process(reviews);
```

**Key point:** The `execution.pricing` config enables automatic cost tracking. The engine calculates costs per dimension and provides detailed breakdowns.

## Key Concepts

### 1. Five-Stage Pipeline Architecture

The pipeline processes data through five distinct stages.
```
Stage 1: Filter Spam (20 reviews)
   ↓
Stage 2: Parallel Analysis (10 reviews, spam filtered)
   sentiment + categorize run simultaneously
   ↓
Stage 3: Group by Category (10 reviews → 5 categories)
   transform reshapes data
   ↓
Stage 4: Deep Analysis (5 category groups)
   analyze_category runs per group
   ↓
Stage 5: Executive Summary (1 global synthesis)
   executive_summary synthesizes all findings
```

**Characteristics:**

- Stages 1-2 operate on individual reviews (section dimensions)
- Stage 3 transforms data structure via global dimension with transform
- Stages 4-5 operate on transformed data (section then global)
- Dependencies ensure correct execution order
- Parallelism within stages improves performance

### 2. Skip Logic for Cost Optimization

Skip logic prevents unnecessary API calls on low-value data.
```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
	if (ctx.dimension === "sentiment" || ctx.dimension === "categorize") {
		const spamCheck = ctx.dependencies.filter_spam;
		if (spamCheck?.data?.is_spam) {
			return true;  // Skip analysis on spam
		}
	}
	return false;
}
```

**Impact in this example:**

- 10 spam reviews detected by filter_spam
- 2 dependent dimensions (sentiment, categorize) skipped per spam review
- 20 API calls saved (10 reviews × 2 dimensions)
- 30% efficiency gain (20 saved / 67 total possible calls)

### 3. Data Transformations for Smart Grouping

Transformations reshape data between dimensions.
```typescript
{
	name: "group_by_category",
	scope: "global",
	transform: (result, sections) => {
		// Convert: 10 individual reviews → 5 category groups
		return groupByCategory(result, sections);
	}
}
```

**Benefits:**

- Reduces analysis from 10 individual reviews to 5 category groups
- Enables pattern recognition across similar reviews
- Generates insights at category level rather than review level
- More actionable output for product teams

### 4. Multi-Model Strategy

Use cheap models for simple tasks, expensive models for complex analysis.

**Cost breakdown by model:**

- Haiku (41 calls): $0.0159 for filtering, sentiment, categorization
- Sonnet (6 calls): $0.0123 for deep insights and synthesis
- Total: $0.0282 for 47 API calls

**If using only Sonnet:**

- 47 calls × ~$0.002 per call = ~$0.094
- 3.3x more expensive than multi-model approach

**If using only Haiku:**

- Cost would be lower (~$0.016)
- But insights would lack depth and nuance
- Actionable recommendations would be generic

### 5. Real-Time Cost Tracking

Track spending automatically with detailed breakdowns.
```typescript
const result = await engine.process(reviews);

console.log(result.costs);
// {
//   totalCost: 0.0282,
//   totalTokens: 12289,
//   byDimension: {
//     filter_spam: { cost: 0.0115, tokens: 8107, model: "Haiku" },
//     sentiment: { cost: 0.0015, tokens: 934, model: "Haiku" },
//     // ...
//   },
//   byProvider: {
//     anthropic: { cost: 0.0282, tokens: 12289, models: ["Haiku", "Sonnet"] }
//   }
// }
```

**What you can track:**

- Total cost and tokens across all dimensions
- Cost per dimension with model information
- Cost per provider (useful when using multiple providers)
- Token breakdown (input vs output)

## Production Patterns Demonstrated

### Pattern 1: Quality Filter

Cheap model filters bad data, expensive model analyzes good data.
```typescript
this.dimensions = [
	"quality_check",    // Haiku: Fast, cheap filter
	"deep_analysis"     // Sonnet: Expensive, high quality
];

shouldSkipSectionDimension(ctx) {
	const quality = ctx.dependencies.quality_check?.data?.quality_score;
	return quality < 0.7;  // Skip low-quality items
}
```

**Use cases:** Content moderation, lead qualification, document triage

### Pattern 2: Parallel Independent Tasks

Run multiple independent analyses simultaneously.
```typescript
this.dimensions = [
	"check_spam",       // Runs first
	"sentiment",        // Runs in parallel with categorize
	"categorize"        // Runs in parallel with sentiment
];

defineDependencies() {
	return {
		sentiment: ["check_spam"],
		categorize: ["check_spam"]  // Both depend only on check_spam
	};
}
```

**Use cases:** Multi-aspect analysis, independent feature extraction

### Pattern 3: Progressive Aggregation

Transform individual items into groups, analyze groups, synthesize globally.
```typescript
this.dimensions = [
	"analyze_item",           // Section: individual items
	{
		name: "group_items",    // Global: aggregate items
		scope: "global",
		transform: groupingLogic
	},
	"analyze_group",          // Section: grouped items
	{
		name: "synthesize",     // Global: final synthesis
		scope: "global"
	}
];
```

**Use cases:** Survey analysis, review analysis, multi-document synthesis

## Summary

**What you learned:**

✅ **Skip logic** - Filter spam and skip dependent analyses (saved 20 API calls, 30% efficiency gain)  
✅ **Parallel execution** - Sentiment and categorization ran simultaneously  
✅ **Transformations** - Converted 10 reviews into 5 category groups for smarter analysis  
✅ **Multi-model orchestration** - Haiku for filtering, Sonnet for insights ($0.0282 vs $0.094 if using only Sonnet)  
✅ **Cost tracking** - Real-time breakdown by dimension and model

**Key insight:**

Production pipelines combine multiple optimization strategies to balance cost, quality, and performance. This example used skip logic to avoid wasting API calls on spam (30% efficiency gain), transformations to enable category-level analysis instead of individual review analysis, and multi-model selection to use cheap models for simple tasks and expensive models only where needed (saving 70% vs using Sonnet everywhere). The result is a pipeline that processes 20 reviews into actionable business insights for $0.03 in 24 seconds.

## Troubleshooting

### API Key Not Set
```
Error: ANTHROPIC_API_KEY not found
```

**Cause:** Missing environment variable.

**Fix:**
```bash
# Option 1: Set environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Option 2: Add to .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

### Rate Limit Exceeded
```
Error: Rate limit exceeded (429)
```

**Cause:** Too many concurrent requests.

**Fix:**
```typescript
const engine = new DagEngine({
	plugin: new ReviewAnalyzer(),
	execution: {
		concurrency: 2  // Reduce from default 5 to 2
	}
});
```

### Cost Tracking Shows $0
```
💰 Total Cost: $0.0000
```

**Cause:** Missing pricing configuration.

**Fix:**
```typescript
const engine = new DagEngine({
	plugin: new ReviewAnalyzer(),
	execution: {
		pricing: {
			models: {
				'claude-3-5-haiku-20241022': { inputPer1M: 0.80, outputPer1M: 4.00 },
				'claude-3-5-sonnet-20241022': { inputPer1M: 3.00, outputPer1M: 15.00 }
			}
		}
	}
});
```

### Transform Not Applied
```
Expected 5 category groups but got 10 individual reviews
```

**Cause:** Transform function not bound correctly or not returning new sections.

**Fix:**
```typescript
{
	name: "group_by_category",
	scope: "global",
	transform: this.groupByCategory.bind(this)  // Must bind 'this'
}

groupByCategory(result, sections) {
	// Must return new SectionData[] array
	return categoryGroups;
}
```