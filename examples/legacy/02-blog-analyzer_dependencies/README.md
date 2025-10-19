# Blog Analyzer [Dependencies]

Shows dependencies, section vs global dimensions, and parallel execution.

## Run
```bash
cd examples
npm run blog
```

## What It Shows

**3 dimensions with dependencies:**
```
Parallel (section-level):
├─ topics
└─ sentiment
     ↓
Sequential (global):
└─ summary (depends on both)
```

**Key Learning:** `summary` waits for `topics` and `sentiment` to complete, then uses their results.

## Code
```typescript
// Define dependencies
defineDependencies() {
  return {
    summary: ["topics", "sentiment"],  // summary needs both
  };
}

// Use dependency results
createPrompt(ctx) {
  if (ctx.dimension === "summary") {
    const topics = ctx.dependencies.topics?.data;
    const sentiment = ctx.dependencies.sentiment?.data;
    return `Summarize based on: ${topics}, ${sentiment}`;
  }
}
```

## Output
```
📊 Section Results:
Topics: { topics: ['AI', 'development', 'workflows'] }
Sentiment: { sentiment: 'neutral', score: 0.6 }

🌍 Global Result:
Summary: { summary: '...', tone: '...' }
```

## Next

[Company Research [multi-provider] →](../03-company-research%20%5Bmulti-provider%5D)