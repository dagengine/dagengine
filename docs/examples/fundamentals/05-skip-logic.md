---
title: 05 - Skip Logic
description: Optimize costs by conditionally skipping dimensions
---

# 05 - Skip Logic

The `shouldSkipSectionDimension()` hook prevents expensive API calls on low-value items.

## What You'll Learn

- ✅ Implement conditional dimension execution
- ✅ Use the `shouldSkipSectionDimension()` hook
- ✅ Access dependency results in skip logic
- ✅ Apply the quality filter pattern
- ✅ Optimize costs with smart filtering

**Time:** 6 minutes

## Quick Run

```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 05
```

**[📁 View example on GitHub](https://github.com/dagengine/dag-engine/tree/main/examples/fundamentals/05-skip-logic)**

## What You'll See

```
📚 Fundamentals 05: Skip Logic

Processing 10 reviews...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "Excellent product! The build quality is outstandi..."
   ✅ Quality: 0.90 - Detailed, specific review with helpful feedback
   📊 Sentiment: positive
   🏷️  Topics: product quality, customer service, expectations
   💡 Insights: 3 found

2. "Very disappointed. The product broke after just t..."
   ✅ Quality: 0.85 - Specific complaint with actionable details
   📊 Sentiment: negative
   🏷️  Topics: product durability, customer support, warranty
   💡 Insights: 3 found

3. "Good value for money. Works as advertised and the..."
   ✅ Quality: 0.88 - Clear, helpful review with specific details
   📊 Sentiment: positive
   🏷️  Topics: value, features, documentation
   💡 Insights: 3 found

4. "The features are powerful but the learning curve ..."
   ✅ Quality: 0.82 - Balanced review with constructive feedback
   📊 Sentiment: neutral
   🏷️  Topics: features, documentation, learning curve
   💡 Insights: 3 found

5. "Bad"
   ❌ Quality: 0.10 - Too short, no substance
   ⏭️  Deep analysis skipped

6. "⭐⭐⭐⭐⭐"
   ❌ Quality: 0.15 - No actual review text
   ⏭️  Deep analysis skipped

7. "BUY NOW!!! CLICK HERE www.spam.com"
   ❌ Quality: 0.05 - Clear spam
   ⏭️  Deep analysis skipped

8. "ok i guess"
   ❌ Quality: 0.20 - Too vague, minimal effort
   ⏭️  Deep analysis skipped

9. "meh"
   ❌ Quality: 0.12 - No useful information
   ⏭️  Deep analysis skipped

10. "terrible"
    ❌ Quality: 0.15 - Too short, no details
    ⏭️  Deep analysis skipped

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Total: 10 reviews
✅ Analyzed: 4
⏭️  Skipped: 6

💰 Cost: $0.0089
🎫 Tokens: 4,523
⚡ Duration: 3.42s

✨ Skip logic saved money by not analyzing low-quality reviews.
```

**What happened?**

- 10 reviews passed through quality check with cheap Haiku model (10 API calls)
- 4 high-quality reviews received deep analysis with expensive Sonnet model (4 API calls)
- 6 low-quality reviews skipped deep analysis based on quality scores (6 calls saved)
- Skip logic prevented wasting $0.006+ on spam and single-word reviews

## Code Walkthrough

### Step 1: Define Dimensions with Dependencies

```typescript
class SmartReviewAnalyzer extends Plugin {
  constructor() {
    super('smart-review-analyzer', 'Smart Review Analyzer', 'Skip demo');
    
    this.dimensions = ['quality_check', 'deep_analysis'];
  }
  
  defineDependencies() {
    return {
      deep_analysis: ['quality_check']  // Deep analysis depends on quality
    };
  }
}
```

**Key point:** Deep analysis depends on quality check, ensuring quality scores are available before skip decisions.

### Step 2: Implement Skip Logic Hook

```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
  // Only apply skip logic to deep_analysis dimension
  if (ctx.dimension !== 'deep_analysis') {
    return false;
  }

  // Access quality check results from dependencies
  const qualityResult = ctx.dependencies.quality_check as 
    DimensionResult<QualityCheckResult> | undefined;

  const isHighQuality = qualityResult?.data?.is_high_quality;
  const qualityScore = qualityResult?.data?.quality_score || 0;

  // Skip if quality is below threshold
  if (!isHighQuality || qualityScore < 0.7) {
    console.log(`   ⏭️  Skipped: Low quality (score: ${qualityScore.toFixed(2)})`);
    return true;
  }

  return false;  // Don't skip - proceed with deep analysis
}
```

**Key point:** Return `true` to skip the dimension for this section, `false` to execute it. Access dependency results through `ctx.dependencies`.

### Step 3: Use Different Models for Different Dimensions

```typescript
selectProvider(dimension: string): ProviderSelection {
  if (dimension === 'quality_check') {
    // Cheap, fast model for filtering
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-haiku-20241022' }
    };
  }
  
  // Expensive, powerful model for deep analysis
  return {
    provider: 'anthropic',
    options: { model: 'claude-3-5-sonnet-20241022' }
  };
}
```

**Key point:** Use cheap models for filter dimensions, reserve expensive models for analysis dimensions that only run on high-value items.

### Step 4: Create Prompts for Each Dimension

```typescript
createPrompt(ctx: PromptContext): string {
  const { dimension, sections } = ctx;
  const review = sections[0]?.content || '';
  
  if (dimension === 'quality_check') {
    return `Assess quality of this review: "${review}"
    
    Return JSON: {
      "is_high_quality": boolean,
      "quality_score": 0-1,
      "reasoning": "why"
    }`;
  }
  
  if (dimension === 'deep_analysis') {
    return `Deep analysis of: "${review}"
    
    Return JSON: {
      "sentiment": "positive|negative|neutral",
      "topics": ["topic1", "topic2"],
      "insights": ["insight1", "insight2"]
    }`;
  }
}
```

## Key Concepts

### 1. The shouldSkipSectionDimension Hook

Signature:
```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean | SkipWithResult
```

**Context includes:**
- `dimension` - Current dimension being evaluated
- `section` - Current section being processed
- `sectionIndex` - Index of current section
- `dependencies` - Results from dependency dimensions

**Characteristics:**
- Called before each section dimension executes
- Return `true` to skip execution
- Return `false` to proceed with execution
- Only applies to section dimensions
- Access dependency results to make decisions

**Advanced usage:**

Return a `SkipWithResult` object to skip execution but provide a cached result:
```typescript
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'deep_analysis') return false;
  
  // Check if we have cached result
  const cached = getCachedResult(ctx.section);
  if (cached) {
    return {
      skip: true,
      result: cached  // Use cached result instead of calling API
    };
  }
  
  // Otherwise check quality as normal
  const quality = ctx.dependencies.quality_check?.data?.quality_score;
  return quality < 0.7;
}
```

This is useful for:
- Returning cached results without API calls
- Providing default/fallback values when skipping
- Implementing custom result injection

> **Note:** For global dimensions, use `shouldSkipGlobalDimension(ctx: DimensionContext)` instead. The global hook receives `sections` (array) instead of `section` (single). Example: skip global synthesis if fewer than 3 sections passed the quality filter.

## When to Use Skip Logic

### Use Skip Logic For:

**Quality filtering** - Skip low-quality reviews, spam content, or incomplete submissions

**Content moderation** - Skip safe content, only analyze flagged items deeply

**Lead qualification** - Skip low-value leads, analyze promising prospects

**Document triage** - Skip irrelevant documents, process relevant ones

**Confidence thresholds** - Skip low-confidence results, refine high-confidence ones

### Skip Skip Logic For:

**All items need processing** - Every item requires the dimension

**No clear filter criteria** - Cannot determine what to skip

**Cheap dimensions** - Skipping costs more than executing

**Simple workflows** - Two dimensions, no filtering needed

## Real-World Examples

### Content Moderation

```typescript
// Skip detailed review on safe content
this.dimensions = ['toxicity_check', 'detailed_review'];

shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'detailed_review') return false;
  
  const toxicity = ctx.dependencies.toxicity_check?.data?.toxicity_score;
  return toxicity < 0.3;  // Skip safe content
}
```

### Lead Scoring

```typescript
// Skip qualification on low-scoring leads
this.dimensions = ['score_lead', 'deep_qualification'];

shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'deep_qualification') return false;
  
  const score = ctx.dependencies.score_lead?.data?.score;
  return score < 70;  // Skip low-scoring leads
}
```

### Document Processing

```typescript
// Skip entity extraction on irrelevant documents
this.dimensions = ['relevance_check', 'extract_entities'];

shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'extract_entities') return false;
  
  const relevant = ctx.dependencies.relevance_check?.data?.is_relevant;
  return !relevant;  // Skip irrelevant documents
}
```

## Summary

**What you learned:**

✅ **shouldSkipSectionDimension hook** - Conditionally skip dimension execution  
✅ **Access dependencies** - Make skip decisions based on previous results  
✅ **Quality filter pattern** - Cheap filter + expensive analysis on high-value items  
✅ **Cost optimization** - Avoid unnecessary API calls on low-value content  
✅ **Model selection** - Use appropriate models at each stage

**Key insight:**

Skip logic creates two-tier processing pipelines where cheap filters identify high-value items, and expensive analysis only runs on items that pass the filter. This pattern dramatically reduces costs in scenarios with mixed-quality input data. The hook has access to dependency results, enabling sophisticated skip decisions based on actual runtime data rather than static rules.

## Troubleshooting

### Skip Logic Not Working

```typescript
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'deep_analysis') return false;
  
  const quality = ctx.dependencies.quality_check?.data;
  // Missing return statement for skip case!
}
```

**Cause:** No return statement for skip condition.

**Fix:**
```typescript
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'deep_analysis') return false;
  
  const quality = ctx.dependencies.quality_check?.data;
  if (quality?.quality_score < 0.7) {
    return true;  // Must explicitly return true to skip
  }
  return false;
}
```

### Dependency Result Undefined

```typescript
const quality = ctx.dependencies.quality_check?.data;  // undefined
```

**Cause:** Dimension name mismatch or missing dependency declaration.

**Fix:**
```typescript
// Ensure dependency is declared
defineDependencies() {
  return {
    deep_analysis: ['quality_check']  // Name must match exactly
  };
}

// Dimension name must match
this.dimensions = ['quality_check', 'deep_analysis'];
```

### All Sections Skipped

```typescript
shouldSkipSectionDimension(ctx) {
  const quality = ctx.dependencies.quality_check?.data?.quality_score || 0;
  return quality < 0.7;  // Always skips if data is undefined
}
```

**Cause:** Logic skips when dependency data is missing or malformed.

**Fix:**
```typescript
shouldSkipSectionDimension(ctx) {
  const qualityData = ctx.dependencies.quality_check?.data;
  
  // Check if data exists before making skip decision
  if (!qualityData) {
    return false;  // Don't skip if no quality data
  }
  
  return qualityData.quality_score < 0.7;
}
```

### Dependent Dimension Still Executing

```typescript
// ❌ Problem: deep_analysis executes even when quality_check was skipped
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'deep_analysis') return false;
  
  const score = ctx.dependencies.quality_check?.data?.quality_score || 0;
  return score < 0.7;
}
```

**Cause:** Not checking if the dependency was skipped.

**Fix:**
```typescript
// ✅ Solution: Check for skipped dependency
shouldSkipSectionDimension(ctx) {
  if (ctx.dimension !== 'deep_analysis') return false;
  
  const qualityResult = ctx.dependencies.quality_check;
  
  // First check if dependency was skipped
  if (!qualityResult || qualityResult.metadata?.skipped) {
    return true;  // Skip if dependency unavailable
  }
  
  const score = qualityResult.data?.quality_score || 0;
  return score < 0.7;
}
```