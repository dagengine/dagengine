---
title: 02 - Dependencies
description: Control execution order with automatic parallelization
---

# 02 - Dependencies

Dependencies create automatic parallelization and execution order in your data processing pipeline.

## What You'll Learn

- ✅ Define multiple dimensions in one plugin
- ✅ Create dependencies between tasks
- ✅ Trigger automatic parallel execution
- ✅ Access dependency results in prompts
- ✅ Understand DAG execution flow

**Time:** 5 minutes

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 02
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/02-dependencies)**

## What You'll See
```
📚 Fundamentals 02: Dependencies

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dependencies defined:
  summary → [sentiment, topics]

dag-engine will automatically:
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

Benefit: Independent tasks run in parallel

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
💰 Cost: $0.0032
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What happened?**

- 2 sections processed with 3 dimensions each (sentiment, topics, summary)
- sentiment and topics ran in parallel for both sections (4 simultaneous API calls)
- summary waited for both dependencies, then executed for each section (2 sequential calls)
- Total execution time: 4.92 seconds with $0.0032 cost across 6 API calls

## Code Walkthrough

### Step 1: Define Multiple Dimensions
```typescript
class TextAnalyzer extends Plugin {
  constructor() {
    super('text-analyzer', 'Text Analyzer', 'Analyze text');
    
    // Define three separate analysis tasks
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }
}
```

**Key point:** Each dimension represents a distinct analysis task that produces its own result.

### Step 2: Define Dependencies
```typescript
defineDependencies(): Record<string, string[]> {
  return {
    summary: ['sentiment', 'topics']  // summary needs both
  };
}
```

This creates the execution DAG:
```
sentiment ─────┐
               ├──→ summary
topics ────────┘
```

**Key point:** Dimensions with no dependencies run immediately in parallel. Dependencies enforce execution order.

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
    // Access dependency results
    const sentiment = dependencies.sentiment?.data?.sentiment;
    const topics = dependencies.topics?.data?.topics;
    
    return `Summarize: "${text}"
    
    Use: Sentiment=${sentiment}, Topics=${topics.join(', ')}
    Return JSON: {"summary": "...", "tone": "..."}`;
  }
}
```

**Key point:** Dependent dimensions receive completed results via `ctx.dependencies`.

### Step 4: Process and Access Results
```typescript
const result = await engine.process(sections);

result.sections.forEach(sectionResult => {
  const sentiment = sectionResult.results.sentiment?.data;
  const topics = sectionResult.results.topics?.data;
  const summary = sectionResult.results.summary?.data;
  
  console.log('Sentiment:', sentiment.sentiment);
  console.log('Topics:', topics.topics.join(', '));
  console.log('Summary:', summary.summary);
});
```
## Key Concepts

### 1. Multiple Dimensions

Run multiple analyses on the same data:
```typescript
this.dimensions = ['sentiment', 'topics', 'summary'];
```

**Characteristics:**
- Each dimension has its own prompt
- Each dimension produces its own result
- Dimensions can depend on other dimensions
- All dimensions process the same input sections

### 2. Defining Dependencies

Control execution order declaratively:
```typescript
defineDependencies() {
  return {
    dimensionName: ['dependency1', 'dependency2']
  };
}
```

**Characteristics:**
- No dependencies = runs immediately in parallel
- Has dependencies = waits for all dependencies to complete
- Circular dependencies throw an error
- Dependencies must reference valid dimension names

### 3. Execution Flow

dag-engine automatically builds an execution plan:
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

Result: Independent tasks execute in parallel, reducing total time
```

**Characteristics:**
- Engine analyzes dependency graph before execution
- Tasks with no blockers start immediately
- Tasks wait only for their declared dependencies
- Parallel execution happens automatically

### 4. Accessing Dependency Results

Dependent dimensions receive results via `ctx.dependencies`:
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

**Characteristics:**
- Dependencies are guaranteed to be complete before execution
- Results include both data and metadata
- Use optional chaining for safety
- Results match the structure returned by parseResponse

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

Use when multiple independent analyses feed into a final task.

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

Use when each task requires the previous task's output.

### Pattern 3: Multiple Dependencies
```typescript
defineDependencies() {
  return {
    final: ['task1', 'task2', 'task3']
  };
}
```

Execution: `task1, task2, task3` (all parallel) → `final`

Use when a final task needs to synthesize multiple independent analyses.

## Summary

**What you learned:**

✅ **Multiple dimensions** - Run separate analysis tasks on the same data  
✅ **Dependencies** - Control execution order with declarative syntax  
✅ **Automatic parallelization** - Engine runs independent tasks simultaneously  
✅ **Access results** - Use `ctx.dependencies` to read completed dependency data

**Key insight:**

Dependencies are declarative, not imperative. You define what depends on what, and dag-engine calculates the optimal execution plan automatically. Tasks with no dependencies run in parallel immediately, while dependent tasks wait only for their specific requirements. This creates efficient pipelines without manual concurrency management.

## Troubleshooting

### Circular Dependency Error
```
Error: Circular dependency detected: A → B → A
```

**Cause:** Two or more dimensions depend on each other, creating an impossible execution order.

**Fix:**
```typescript
// Remove the circular reference
defineDependencies() {
  return {
    taskB: ['taskA'],
    // taskA: ['taskB']  // Remove this line
  };
}
```

### Dependency Result is Undefined
```typescript
const sentiment = ctx.dependencies.sentiment?.data;  // undefined
```

**Cause:** Dimension name in dependency list doesn't match actual dimension name.

**Fix:**
```typescript
this.dimensions = ['sentiment'];           // Name here
defineDependencies() {
  return { summary: ['sentiment'] };       // Must match exactly
}
```

### Tasks Not Running in Parallel

**Cause:** Dimensions have dependencies that create a sequential chain.

**Fix:**
```typescript
// ❌ Sequential (creates chain)
defineDependencies() {
  return {
    topics: ['sentiment'],
    summary: ['topics']
  };
}

// ✅ Parallel (both independent)
defineDependencies() {
  return {
    summary: ['sentiment', 'topics']
  };
}
```