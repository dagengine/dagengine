---
title: Production Quickstart
description: Build a production-ready review analyzer in 10 minutes
---

# 🚀 Production Quickstart

:::info Prerequisites
👋 New to dag-ai? Start with the [5-minute Quick Start](/guide/quick-start) first.

This example shows production patterns with all features working together.
:::

Build a **complete customer review analyzer** that demonstrates every dag-ai superpower:

- ✅ **Automatic spam filtering** - Skip bad data with conditional execution
- ✅ **Parallel execution** - Independent tasks run simultaneously
- ✅ **Smart grouping** - Analyze categories instead of individual reviews
- ✅ **Multi-model orchestration** - Right model for each job
- ✅ **Real-time cost tracking** - Know exactly what you're spending

---

## Quick Run
```bash
# Clone and setup
git clone https://github.com/ivan629/dag-ai.git
cd dag-ai/examples
npm install
cp .env.example .env

# Add your API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-xxx" >> .env

# Run it!
npm run 00
```

---

## What You'll See

The pipeline processes 20 customer reviews and generates actionable insights:
```
🚀 dag-ai Quickstart: Review Analysis

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

---

## How It Works

The pipeline runs in 5 intelligent stages:
```
📥 Input: 20 reviews
    ↓
🛡️  Stage 1: Filter Spam (detects spam reviews)
    ↓
⚡ Stage 2: Parallel Analysis (sentiment + category)
    ↓
📦 Stage 3: Group by Category (transforms into category groups)
    ↓
🔍 Stage 4: Deep Analysis (per category)
    ↓
📋 Stage 5: Executive Summary
    ↓
✅ Output: Actionable insights
```

## Key Features Explained

### 1. Spam Filtering with Skip Logic

**Problem:** Why waste money analyzing spam?

**Solution:** Detect spam first, skip dependent analyses automatically.
```typescript
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension === 'sentiment' || ctx.dimension === 'categorize') {
    const spamCheck = ctx.dependencies.filter_spam;
    if (spamCheck?.data?.is_spam) {
      return true;  // 💰 Skip this review
    }
  }
  return false;
}
```

**Result:** Spam reviews automatically skipped in downstream dimensions

[Learn more →](/examples/05-skip-logic)

---

### 2. Parallel Execution

**Problem:** Sequential processing is slow.

**Solution:** Run independent analyses in parallel.
```typescript
this.dimensions = [
  'filter_spam',    // Runs first
  'sentiment',      // Runs in parallel ⚡
  'categorize',     // Runs in parallel ⚡
  // ...
];
```

**Result:** Sentiment + Category run together, utilizing parallelization

[Learn more →](/examples/02-dependencies)

---

### 3. Smart Grouping (Transformations)

**Problem:** Analyzing individual reviews is repetitive.

**Solution:** Group by category, analyze groups instead.
```typescript
transformSections(ctx) {
  if (ctx.dimension === 'group_by_category') {
    // Transform: individual reviews → category groups
    return grouping.categories.map(category => ({
      content: category.reviews.join('\n\n'),
      metadata: { category: category.name }
    }));
  }
}
```

**Result:** Analyze category groups instead of individual reviews

[Learn more →](/examples/04-transformations)

---

### 4. Multi-Model Strategy

**Problem:** Using expensive models for everything wastes money.

**Solution:** Use cheap models for simple tasks, expensive for complex.
```typescript
selectProvider(dimension) {
  // Haiku ($0.80/1M) for spam detection
  if (dimension === 'filter_spam') {
    return { model: 'claude-3-5-haiku-20241022' };
  }
  
  // Sonnet ($3.00/1M) for deep insights
  if (dimension === 'analyze_category') {
    return { model: 'claude-3-5-sonnet-20241022' };
  }
}
```

**Result:** Optimal cost/quality balance for each task

[Learn more →](/examples/06-providers)

---

### 5. Built-in Cost Tracking

Track spending automatically:
```typescript
const engine = new DagEngine({
  pricing: {
    models: {
      'claude-3-5-haiku-20241022': {
        inputPer1M: 0.8,
        outputPer1M: 4.0
      }
    }
  }
});

const result = await engine.process(reviews);
console.log(result.costs);
// {
//   totalCost: 0.0282,
//   totalTokens: 12289,
//   byDimension: { ... }
// }
```

---

## Cost Breakdown

**This pipeline (from actual run):**
```
Stage 1: Spam detection     → 20 calls (Haiku)   $0.0115
Stage 2: Sentiment          → 10 calls (Haiku)   $0.0015
Stage 2: Categorize         → 10 calls (Haiku)   $0.0011
Stage 3: Grouping           →  1 call  (Haiku)   $0.0018
Stage 4: Deep analysis      →  5 calls (Sonnet)  $0.0087
Stage 5: Summary            →  1 call  (Sonnet)  $0.0036
                              ───────────────────────────
Total: 47 API calls                              $0.0282
Saved: 20 API calls (spam filtered)
Efficiency: 30% fewer API calls
```

**Key optimizations applied:**
- Skip logic prevented 20 unnecessary API calls
- Grouping created 5 category analyses instead of individual review analyses
- Model selection used cheaper Haiku for filtering, expensive Sonnet for insights

## The Complete Code

View the full implementation on GitHub:

[📁 examples/00-quickstart](https://github.com/ivan629/dag-ai/tree/main/examples/00-quickstart)

**Key files:**
- `index.ts` - Main pipeline (200 lines)
- `prompts.ts` - AI prompts
- `data.ts` - Sample reviews
- `types.ts` - TypeScript types
- `utils.ts` - Display utilities

---

## What You Learned

By running this example, you've seen:

- ✅ **Skip Logic** - Conditional execution saves API calls
- ✅ **Dependencies** - DAG-based execution order
- ✅ **Transformations** - Dynamic data restructuring
- ✅ **Multi-scope** - Section vs Global dimensions
- ✅ **Multi-model** - Right tool for the job
- ✅ **Cost Tracking** - Precise spending metrics

---

### Customize for Your Needs

**Change categories:**
```typescript
// In prompts.ts
Categories: support, billing, technical, feature-request
```

**Use different models:**
```typescript
selectProvider() {
	return {
		provider: 'openai',
		options: { model: 'gpt-4' }
	};
}
```

**Process your own data:**
```typescript
// Replace SAMPLE_REVIEWS in data.ts
const YOUR_REVIEWS = [
	{ content: 'Your review text', metadata: { id: 1 } }
];
```

---

## Troubleshooting

### "API key not set"
```bash
# Set environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Or add to .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

### "Rate limit exceeded"

Reduce concurrency:
```typescript
const engine = new DagEngine({
	execution: { concurrency: 2 }  // Default: 5
});
```

### Cost tracking shows $0

Add pricing configuration:
```typescript
import { PRICING } from './config';

const engine = new DagEngine({
	pricing: { models: PRICING }
});
```

---

## FAQ

**Q: Can I use OpenAI or other providers?**  
A: Yes! Change `provider` in `selectProvider()` - see [Providers](/examples/06-providers)

**Q: Is this production-ready?**  
A: This demonstrates patterns. For production, add error handling, retries, and monitoring.

**Q: Can I add more review categories?**  
A: Yes! Modify the categories in `prompts.ts` - it's just a prompt change.

---

## Get Help

- 💬 [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions) - Ask questions
- 🐛 [Report Issues](https://github.com/ivan629/dag-ai/issues) - Found a bug?
- 📖 [Read the Docs](/guide/quick-start) - Learn the basics
- 🎓 [More Examples](/examples/) - See other use cases