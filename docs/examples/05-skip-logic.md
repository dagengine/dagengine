# Fundamentals 05: Skip Logic

Learn cost optimization through smart skipping.

## Quick Run

```bash
npm run 05
```

## What This Does

Analyzes reviews in two stages:
1. **Quality Check** (Haiku) - Fast, cheap filter
2. **Deep Analysis** (Sonnet) - Expensive, comprehensive analysis

**The key**: `shouldSkipSectionDimension()` prevents deep analysis on low-quality reviews.

## Code Structure

```typescript
class SmartReviewAnalyzer extends Plugin {
  defineDependencies(): Record<string, string[]> {
    return {
      deep_analysis: ["quality_check"]  // Deep analysis depends on quality check
    };
  }

  shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
    if (ctx.dimension !== "deep_analysis") {
      return false;
    }

    const qualityResult = ctx.dependencies.quality_check as
      DimensionResult<QualityCheckResult> | undefined;

    const isHighQuality = qualityResult?.data?.is_high_quality;
    const qualityScore = qualityResult?.data?.quality_score || 0;

    // Skip if low quality
    if (!isHighQuality || qualityScore < QUALITY_THRESHOLD) {
      console.log(`   ⏭️  Skipped: Low quality (score: ${qualityScore.toFixed(2)})`);
      return true;
    }

    return false;
  }
}
```

## Real Output

Processing 10 reviews (4 high-quality, 6 low-quality):

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

## What Happened

- **All 10 reviews** got quality checks (cheap Haiku calls)
- **Only 4 reviews** got deep analysis (expensive Sonnet calls)
- **6 reviews** were skipped based on quality scores

The system automatically filtered out spam, single-word reviews, and emoji-only content before spending money on deep analysis.

## Key Concepts

**Dependencies**: Deep analysis depends on quality check results
```typescript
defineDependencies(): Record<string, string[]> {
  return {
    deep_analysis: ["quality_check"]
  };
}
```

**Skip Hook**: Check dependencies and decide whether to skip
```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
  // Access dependency results through ctx.dependencies
  const qualityResult = ctx.dependencies.quality_check;
  
  // Make skip decision based on actual data
  return qualityScore < QUALITY_THRESHOLD;
}
```

**Model Selection**: Use cheap model for filter, expensive model for analysis
```typescript
selectProvider(dimension: string): ProviderSelection {
  if (dimension === "quality_check") {
    return { provider: "anthropic", options: { model: "claude-3-5-haiku-20241022" } };
  }
  return { provider: "anthropic", options: { model: "claude-3-5-sonnet-20241022" } };
}
```

## Pattern

This is the **quality filter pattern**:
1. Cheap check → Identify items worth processing
2. Skip decision → Avoid expensive calls
3. Deep analysis → Only process high-value items

Useful for: review filtering, content moderation, lead qualification, document triage.