---
title: 02 - Dependencies
description: Control execution order with automatic parallelization
---

# 02 - Dependencies

Learn how dependencies create automatic parallelization and execution order.

---

## What You'll Learn

- ✅ Multiple dimensions in one plugin
- ✅ Defining dependencies between tasks
- ✅ Automatic parallel execution
- ✅ Accessing dependency results
- ✅ Understanding execution order

**Time:** 5 minutes

---

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 02
```

---

## What You'll See
```
📚 Fundamentals 02: Dependencies

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dependencies defined:
  summary → [sentiment, topics]

dag-ai will automatically:
  1. Run sentiment + topics IN PARALLEL (no dependencies)
  2. Wait for BOTH to complete
  3. Run summary (using sentiment + topics results)

Execution timeline:
  ─┬─ sentiment (section 1) ────┐
   ├─ topics (section 1) ───────┤
   ├─ sentiment (section 2) ────┤  Parallel phase
   └─ topics (section 2) ───────┤
                                │
   ┌─ summary (section 1) ──────┤  Sequential phase
   └─ summary (section 2) ──────┘

Benefit: ~2x faster than sequential execution

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Section 1:
"This product is absolutely amazing! Best purchase I've..."

  📊 Sentiment: positive (0.95)
     └─ Extremely enthusiastic language with superlatives
  🏷️  Topics: product quality, customer service, value
     └─ Main: product quality
  📝 Summary: Customer is highly satisfied with exceptional quality
     └─ Tone: enthusiastic | Words: 28

Section 2:
"Terrible experience. The product broke after one week..."

  📊 Sentiment: negative (0.10)
     └─ Strong negative words and complaint about service
  🏷️  Topics: product quality, support, money
     └─ Main: product quality
  📝 Summary: Customer extremely dissatisfied with broken product
     └─ Tone: frustrated | Words: 24

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Completed in 4.92s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What happened?**
- 2 sections processed with 3 dimensions each
- sentiment + topics ran **in parallel** (~2x faster)
- summary **waited** for both, then used their results
- Total: **6 API calls** (4 parallel + 2 sequential)

## The Complete Code

### Step 1: Define Multiple Dimensions
```typescript
class TextAnalyzer extends Plugin {
  constructor() {
    super('text-analyzer', 'Text Analyzer', 'Analyze text');
    
    // Define THREE tasks
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }
}
```

---

### Step 2: Define Dependencies
```typescript
defineDependencies(): Record<string, string[]> {
  return {
    summary: ['sentiment', 'topics']  // summary needs both
  };
}
```

**This creates the execution DAG:**
```
sentiment ─────┐
               ├──→ summary
topics ────────┘
```

**Key insight:** Dimensions with **no dependencies** run immediately in parallel!

---

### Step 3: Create Prompts for Each Dimension
```typescript
createPrompt(ctx: PromptContext): string {
  const { dimension, sections, dependencies } = ctx;
  const text = sections[0]?.content || '';
  
  if (dimension === 'sentiment') {
    return `Analyze sentiment: "${text}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  if (dimension === 'topics') {
    return `Extract topics: "${text}"
    Return JSON: {"topics": ["topic1", "topic2"], "main_topic": "..."}`;
  }
  
  if (dimension === 'summary') {
    // ✅ Access dependency results
    const sentiment = dependencies.sentiment?.data?.sentiment;
    const topics = dependencies.topics?.data?.topics;
    
    return `Summarize: "${text}"
    
    Use: Sentiment=${sentiment}, Topics=${topics.join(', ')}
    Return JSON: {"summary": "...", "tone": "..."}`;
  }
}
```

**Key point:** Dependent dimensions receive results via `ctx.dependencies`

---

### Step 4: Process and Access Results
```typescript
const result = await engine.process(sections);

result.sections.forEach(section => {
  const sentiment = section.results.sentiment?.data;
  const topics = section.results.topics?.data;
  const summary = section.results.summary?.data;
  
  console.log('Sentiment:', sentiment.sentiment);
  console.log('Topics:', topics.topics.join(', '));
  console.log('Summary:', summary.summary);
});
```

**[📁 View full source on GitHub](https://github.com/ivan629/dag-ai/tree/main/examples/02-dependencies)**

---

## Key Concepts

### 1. Multiple Dimensions

**Run multiple analyses on the same data:**
```typescript
this.dimensions = ['sentiment', 'topics', 'summary'];
```

Each dimension:
- Has its own prompt
- Produces its own result
- Can depend on other dimensions

---

### 2. Defining Dependencies

**Control execution order declaratively:**
```typescript
defineDependencies() {
  return {
    dimensionName: ['dependency1', 'dependency2']
  };
}
```

**Rules:**
- No dependencies = runs immediately (in parallel)
- Has dependencies = waits for them to complete
- Circular dependencies = not allowed

---

### 3. Execution Flow

**dag-ai automatically builds an execution plan:**
```
Input: 2 sections with 3 dimensions each

Parallel Phase:
  Section 1 → sentiment ─┐
  Section 1 → topics ────┤
  Section 2 → sentiment ─┤  } 4 calls in parallel
  Section 2 → topics ────┘

Sequential Phase:
  Section 1 → summary ───┐  } 2 calls (waits for parallel phase)
  Section 2 → summary ───┘

Result: 3 seconds (vs 6 seconds sequential)
```

---

### 4. Accessing Dependency Results

**Dependent dimensions receive results via `ctx.dependencies`:**
```typescript
createPrompt(ctx) {
  if (ctx.dimension === 'summary') {
    // Access completed dependency results
    const sentimentData = ctx.dependencies.sentiment?.data;
    const topicsData = ctx.dependencies.topics?.data;
    
    // Use them in your prompt
    return `Summarize with sentiment: ${sentimentData.sentiment}...`;
  }
}
```

---

## Execution Patterns

### Pattern 1: Parallel (This Example)
```typescript
defineDependencies() {
  return {
    summary: ['sentiment', 'topics']
  };
}
```

Execution: `sentiment, topics` (parallel) → `summary`

---

### Pattern 2: Sequential Chain
```typescript
defineDependencies() {
  return {
    step2: ['step1'],
    step3: ['step2']
  };
}
```

Execution: `step1` → `step2` → `step3` (sequential)

---

### Pattern 3: Multiple Dependencies
```typescript
defineDependencies() {
  return {
    final: ['task1', 'task2', 'task3']
  };
}
```

Execution: `task1, task2, task3` (all parallel) → `final`

---

## Customization

### Add More Dimensions
```typescript
this.dimensions = ['sentiment', 'topics', 'language', 'summary'];

defineDependencies() {
  return {
    summary: ['sentiment', 'topics', 'language']  // Now waits for 3
  };
}
```

---

### Change Dependency Structure

Make sequential instead of parallel:
```typescript
defineDependencies() {
  return {
    topics: ['sentiment'],    // topics waits for sentiment
    summary: ['topics']        // summary waits for topics
  };
}
```

Now: `sentiment` → `topics` → `summary` (all sequential)

---

## Next Steps

**Ready for more?**

1. **[03 - Section vs Global](/examples/03-section-vs-global)** - Two types of dimensions
2. **[04 - Transformations](/examples/04-transformations)** - Dynamic section changes
3. **[Production Quickstart](/examples/00-quickstart)** - All features together

**Want to experiment?**

- Add a `language` dimension to detect text language
- Add a `keywords` dimension to extract key phrases
- Make `summary` depend only on `sentiment` to see different results

---

## Troubleshooting

### Circular Dependency Error
```
Error: Circular dependency detected: A → B → A
```

**Fix:** Remove the circular dependency. DAGs must be acyclic.

---

### Dependency Result is Undefined
```typescript
const sentiment = ctx.dependencies.sentiment?.data;  // undefined
```

**Cause:** Dimension name mismatch

**Fix:**
```typescript
this.dimensions = ['sentiment'];           // ← Name here
defineDependencies() {
  return { summary: ['sentiment'] };       // ← Must match exactly
}
```

---

### Not Running in Parallel

**Check:** Do your dimensions have dependencies?
```typescript
// ❌ Sequential (dependency chain)
defineDependencies() {
  return {
    topics: ['sentiment'],
    summary: ['topics']
  };
}

// ✅ Parallel
defineDependencies() {
  return {
    summary: ['sentiment', 'topics']  // Both independent
  };
}
```

---

## Summary

**What you learned:**

✅ Multiple dimensions - Run multiple tasks on same data  
✅ Dependencies - Control execution order declaratively  
✅ Automatic parallelization - dag-ai handles concurrency  
✅ Access results - Use `ctx.dependencies` in prompts

**Key insight:**

Dependencies are **declarative** - you say "what depends on what", dag-ai figures out the optimal execution automatically.

**Next:** [03 - Section vs Global →](/examples/03-section-vs-global)

Learn the difference between per-item analysis and cross-item synthesis!