# Fundamentals 06: Providers

Learn multi-provider strategies and smart model selection.

## Quick Run

```bash
npm run 06
```

For detailed explanation:
```bash
npm run 06 -- --explain
```

## What This Does

Analyzes reviews using **three different models** based on task complexity:

1. **spam_check** → Haiku (fast, cheap) - Binary decision
2. **basic_analysis** → Haiku (fast, cheap) - Simple categorization
3. **deep_analysis** → Sonnet (powerful, expensive) - Complex reasoning

**The key**: `selectProvider()` chooses the optimal model for each dimension.

## Real Output

```
📚 Fundamentals 06: Providers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSIS RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "Excellent product! The features are intuitive and customer..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ positive | features
   🧠 Deep Analysis (Sonnet):
      ├─ Highly enthusiastic and satisfied with product quality
      ├─ Topics: features, support, usability
      └─ 2 recommendations

2. "Disappointed with the pricing. It's too expensive compared..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ negative | pricing
   🧠 Deep Analysis (Sonnet):
      ├─ Dissatisfied with value proposition and competitive positioning
      ├─ Topics: pricing, competition, value
      └─ 2 recommendations

3. "The support team is unresponsive. I've been waiting 3 days..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ negative | support
   🧠 Deep Analysis (Sonnet):
      ├─ Frustrated with lack of timely support response
      ├─ Topics: support, responsiveness, service
      └─ 2 recommendations

4. "BUY VIAGRA NOW!!! CLICK HERE www.spam.com"
   🚫 Spam Check (Haiku): SPAM

5. "Love the new features in the latest update. The team clearl..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ positive | features
   🧠 Deep Analysis (Sonnet):
      ├─ Appreciative of product improvements and team responsiveness
      ├─ Topics: features, updates, feedback
      └─ 2 recommendations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODEL USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  spam_check: Haiku
    Cost: $0.0043
    Tokens: 1,234

  basic_analysis: Haiku
    Cost: $0.0028
    Tokens: 856

  deep_analysis: Sonnet
    Cost: $0.0156
    Tokens: 2,341

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ Duration: 4.23s
💰 Total Cost: $0.0227
🎫 Total Tokens: 4,431
```

**What happened?**
- 5 reviews processed with 3 dimensions each
- Spam review automatically skipped in analysis dimensions
- Used Haiku for simple tasks, Sonnet for complex analysis

## Code Structure

### Defining Dimensions

```typescript
class MultiProviderAnalyzer extends Plugin {
  constructor() {
    super('multi-provider-analyzer', 'Multi-Provider Analyzer', 'Demo');
    
    this.dimensions = [
      'spam_check',       // Fast: Binary decision
      'basic_analysis',   // Medium: Simple categorization
      'deep_analysis'     // Powerful: Complex reasoning
    ];
  }
}
```

### Smart Model Selection

```typescript
selectProvider(dimension: string): ProviderSelection {
  // Fast, cheap model for spam detection
  if (dimension === 'spam_check') {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-3-5-haiku-20241022',
        temperature: 0.1
      }
    };
  }

  // Powerful, expensive model for deep analysis
  if (dimension === 'deep_analysis') {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3
      }
    };
  }

  // Default to fast model
  return {
    provider: 'anthropic',
    options: {
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.2
    }
  };
}
```

**Key insight:** Each dimension can use a different model based on task complexity.

### Skip Logic Integration

```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
  if (ctx.dimension === 'basic_analysis' || ctx.dimension === 'deep_analysis') {
    const spamResult = ctx.dependencies.spam_check;
    if (spamResult?.data?.is_spam) {
      return true;  // Skip analysis for spam
    }
  }
  return false;
}
```

Combines provider selection with skip logic for maximum efficiency.

## Key Concepts

### 1. Per-Dimension Provider Selection

**Each dimension can use a different model:**
```typescript
spam_check → claude-3-5-haiku-20241022 (fast, cheap)
basic_analysis → claude-3-5-haiku-20241022 (fast, cheap)
deep_analysis → claude-3-5-sonnet-20241022 (powerful, expensive)
```

**Why?** Match model capability to task complexity for optimal cost/quality balance.

### 2. Model Selection Strategy

**Use fast models when:**
- Binary decisions (yes/no, true/false)
- Simple categorization
- Keyword extraction
- Quality filtering
- Speed matters more than nuance

**Use powerful models when:**
- Complex reasoning required
- Nuanced understanding needed
- Strategic recommendations
- Creative tasks
- Quality matters more than cost

### 3. Multi-Provider Support

**Mix providers based on strengths:**
```typescript
selectProvider(dimension: string) {
  if (dimension === 'image_analysis') {
    return { provider: 'google', options: { model: 'gemini-pro-vision' } };
  }
  if (dimension === 'fast_filter') {
    return { provider: 'openai', options: { model: 'gpt-4o-mini' } };
  }
  return { provider: 'anthropic', options: { model: 'claude-3-5-sonnet' } };
}
```

**Available providers:**
- `anthropic` - Claude models
- `openai` - GPT models
- `google` - Gemini models

### 4. Cost Optimization Pattern

**From the example above:**
- Spam check (5 calls): Haiku → $0.0043
- Basic analysis (4 calls): Haiku → $0.0028 (1 spam skipped)
- Deep analysis (4 calls): Sonnet → $0.0156 (1 spam skipped)

**Total:** $0.0227 for 5 reviews

**Pattern:** Use cheap models for filtering and simple tasks, reserve expensive models for complex analysis where quality matters.

## Real-World Examples

### Example 1: Content Moderation Pipeline

```typescript
selectProvider(dimension: string) {
  if (dimension === 'quick_filter') {
    // Fast binary decision
    return { provider: 'anthropic', options: { model: 'haiku' } };
  }
  if (dimension === 'detailed_review') {
    // Complex policy evaluation
    return { provider: 'anthropic', options: { model: 'sonnet' } };
  }
}
```

### Example 2: Document Processing

```typescript
selectProvider(dimension: string) {
  if (dimension === 'extract_metadata') {
    // Simple extraction
    return { provider: 'openai', options: { model: 'gpt-4o-mini' } };
  }
  if (dimension === 'summarize') {
    // Quality summary
    return { provider: 'anthropic', options: { model: 'sonnet' } };
  }
}
```

### Example 3: Customer Support Routing

```typescript
selectProvider(dimension: string) {
  if (dimension === 'classify_urgency') {
    // Fast categorization
    return { provider: 'anthropic', options: { model: 'haiku' } };
  }
  if (dimension === 'draft_response') {
    // Quality response generation
    return { provider: 'anthropic', options: { model: 'sonnet' } };
  }
}
```

## Customization

### Use Different Models

```typescript
selectProvider(dimension: string) {
  if (dimension === 'quick_task') {
    return {
      provider: 'openai',
      options: { model: 'gpt-4o-mini' }  // Fast OpenAI model
    };
  }
  return {
    provider: 'anthropic',
    options: { model: 'claude-3-opus-20240229' }  // Most powerful Claude
  };
}
```

### Add Temperature Control

```typescript
selectProvider(dimension: string) {
  if (dimension === 'creative_task') {
    return {
      provider: 'anthropic',
      options: {
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.8  // More creative
      }
    };
  }
  return {
    provider: 'anthropic',
    options: {
      model: 'claude-3-5-haiku-20241022',
        temperature: 0.1  // Deterministic
    }
  };
}
```

### Provider-Specific Options

```typescript
selectProvider(dimension: string) {
  if (dimension === 'use_openai') {
    return {
      provider: 'openai',
      options: {
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9
      }
    };
  }
}
```

## Next Steps

**Ready for more?**

1. **Combine with transformations** - Group items before expensive analysis
2. **Add more providers** - Mix Anthropic, OpenAI, and Google
3. **Build your own plugin** - Apply these patterns to your use case

**Want to experiment?**

- Try different model combinations
- Add cost tracking and compare results
- Test with your own data

---

## Troubleshooting

### Provider Not Found

```typescript
// Make sure provider is configured in engine
const engine = new DagEngine({
  plugin: new MultiProviderAnalyzer(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }  // Add if using OpenAI
  }
});
```

### Cost Tracking Shows $0

Add pricing configuration:
```typescript
const engine = new DagEngine({
  plugin: new MultiProviderAnalyzer(),
  providers: { /* ... */ },
  pricing: {
    models: {
      'claude-3-5-haiku-20241022': { inputPer1M: 0.80, outputPer1M: 4.00 },
      'claude-3-5-sonnet-20241022': { inputPer1M: 3.00, outputPer1M: 15.00 }
    }
  }
});
```

### Wrong Model Used

Check that dimension name in `selectProvider()` matches dimension in `this.dimensions`:
```typescript
this.dimensions = ['spam_check'];  // ← Name here

selectProvider(dimension: string) {
  if (dimension === 'spam_check') {  // ← Must match exactly
    return { /* ... */ };
  }
}
```

## Summary

**What you learned:**

✅ `selectProvider()` - Choose model per dimension  
✅ Cost optimization - Match model to task complexity  
✅ Multi-provider support - Mix Anthropic, OpenAI, Google  
✅ Smart strategies - Fast models for simple tasks, powerful for complex  
✅ Combined patterns - Provider selection + skip logic

**Key insight:** You don't need the most powerful model for everything. Use cheap models for simple tasks, save expensive models for complex reasoning.

**Next:** Build your own plugin combining all these patterns!