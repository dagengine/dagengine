# 05 - Skip Logic

Learn how to skip expensive operations based on cheap quality checks.

---

## Quick Run

```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 05
```

---

## What This Does

This example processes 10 product reviews:
- **Runs quality check** on all 10 reviews (cheap, fast)
- **Skips low-quality reviews** (score < 0.6)
- **Deep analysis** only on high-quality reviews (expensive, slow)

---

## Output

```
📚 Fundamentals 05: Skip Logic

Processing 10 reviews...

   ⏭️  Skipped: Low quality (score: 0.30)
   ⏭️  Skipped: Low quality (score: 0.10)
   ⏭️  Skipped: Low quality (score: 0.10)
   ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Total: 10 reviews
✅ Analyzed: 3
⏭️  Skipped: 7

💰 Cost: $0.0113
🎫 Tokens: 2,587
⚡ Duration: 7.76s

✨ Skip logic saved money by not analyzing low-quality reviews.
```

---

## The Code

### 1. Define Two Dimensions

```typescript
class SmartReviewAnalyzer extends Plugin {
  constructor() {
    super('smart-review-analyzer', 'Smart Review Analyzer', 'Skip demo');
    this.dimensions = ['quality_check', 'deep_analysis'];
  }
  
  defineDependencies() {
    return {
      deep_analysis: ['quality_check']  // Must check quality first
    };
  }
}
```

---

### 2. Implement Skip Logic

```typescript
shouldSkipDimension(ctx: SectionDimensionContext): boolean {
  // Only apply to deep_analysis
  if (ctx.dimension !== 'deep_analysis') {
    return false;
  }
  
  // Get quality score from previous dimension
  const qualityResult = ctx.dependencies.quality_check as 
    DimensionResult<QualityCheckResult> | undefined;
  
  const qualityScore = qualityResult?.data?.quality_score || 0;
  
  // Skip if low quality
  if (qualityScore < 0.6) {
    console.log(`   ⏭️  Skipped: Low quality (score: ${qualityScore.toFixed(2)})`);
    return true;
  }
  
  return false;
}
```

**How it works:**
- Return `true` → Skip execution (free!)
- Return `false` → Run dimension (costs money)
- Check runs **before** dimension executes

---

### 3. Use Different Models

```typescript
selectProvider(dimension: string): ProviderSelection {
  // Cheap model for quality checks
  if (dimension === 'quality_check') {
    return {
      provider: 'anthropic',
      options: { model: 'claude-3-5-haiku-20241022' }
    };
  }
  
  // Expensive model for deep analysis
  return {
    provider: 'anthropic',
    options: { model: 'claude-3-5-sonnet-20241022' }
  };
}
```

---

## Pattern

```
┌─────────────────────┐
│ quality_check       │  All 10 reviews (Haiku - cheap)
│ Score each 0.0-1.0  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ shouldSkipDimension │  Check score < 0.6?
└──────────┬──────────┘
           │
      ┌────┴────┐
      │         │
   Yes (7)   No (3)
      │         │
      ▼         ▼
    Skip    deep_analysis
   (free)   (Sonnet - expensive)
```

**Result:** Only 3 reviews analyzed instead of 10.

---

## Real Results

From the actual run:

| Metric | Value |
|--------|-------|
| Total reviews | 10 |
| Analyzed | 3 |
| Skipped | 7 |
| Cost | $0.0113 |
| Tokens | 2,587 |
| Duration | 7.76s |

**Skip rate:** 70% of reviews filtered out

---

## When to Use

✅ **Use skip logic when:**
- Processing user-generated content (spam, low-effort)
- Expensive operation follows cheap check
- Quality varies significantly

❌ **Skip not needed when:**
- All items require processing
- No clear filter criteria
- Check costs as much as analysis

---

## Common Patterns

### Skip by quality score
```typescript
return qualityScore < 0.6;
```

### Skip by content length
```typescript
return ctx.section.content.length < 50;
```

### Skip by language
```typescript
const lang = ctx.dependencies.detect_language?.data?.language;
return lang !== 'en';
```

### Skip by metadata
```typescript
return ctx.section.metadata?.isPremium !== true;
```

---

## Key Points

**How skip logic works:**
1. `shouldSkipDimension()` called before dimension runs
2. Check dependencies for decision criteria
3. Return `true` to skip (no cost)
4. Return `false` to proceed (costs money)

**Why it saves money:**
- Skipped dimensions don't execute
- No API calls made
- No tokens used
- Only pay for what you analyze

**Threshold matters:**
- Lower threshold (0.4) → Analyze more, skip less
- Higher threshold (0.8) → Analyze less, skip more
- Current example uses 0.6 (balanced)

---

## Summary

**What you learned:**
- How to implement `shouldSkipDimension()`
- Quality filter pattern (cheap check first)
- Cost savings by not processing low-quality content

**Key insight:** Check quality first with a cheap model, skip expensive analysis on junk.

---

**[📁 View full code](https://github.com/ivan629/dag-ai/tree/main/examples/05-skip-logic)**

**Next:** [06 - Error Handling →](/examples/06-error-handling)