---
title: Workflow Lifecycle
description: Complete execution flow from start to finish
---

# Workflow Lifecycle

Understand exactly what happens when you call `engine.process()`.

---

## 🎯 Quick Overview

```typescript
const result = await engine.process(sections);
```

**What happens:**
1. ✅ Validate input
2. 🔗 Build dependency graph (DAG)
3. 📊 Sort dimensions (topological order)
4. ⚡ Execute in parallel groups
5. 💰 Calculate costs
6. 📦 Return results

**Time:** Typically 1-5 seconds for simple workflows

---

## 📊 Visual Flow

```
┌─────────────────────────────────────────────────────────┐
│              WORKFLOW EXECUTION FLOW                     │
└─────────────────────────────────────────────────────────┘

   START: engine.process(sections)
      │
      ├─ Phase 1: PREPARATION
      │  ├─ 🪝 beforeProcessStart
      │  │   └─ Hook: Modify sections, add metadata
      │  │
      │  ├─ 🪝 defineDependencies
      │  │   └─ Returns: { B: ['A'], C: ['A','B'] }
      │  │
      │  └─ 🔍 Validate & Build DAG
      │      ├─ Check circular dependencies
      │      └─ Topological sort → [A, B, C]
      │
      ├─ Phase 2: GROUPING
      │  └─ Group by dependencies:
      │      ├─ Group 0: [A]      (no dependencies)
      │      ├─ Group 1: [B]      (depends on A)
      │      └─ Group 2: [C]      (depends on A, B)
      │
      ├─ Phase 3: EXECUTION
      │  │
      │  ├─ For each group (sequential):
      │  │  │
      │  │  └─ For each dimension in group (parallel):
      │  │     │
      │  │     ├─ If Global Dimension:
      │  │     │  ├─ Process all sections together
      │  │     │  └─ Optional: Transform sections
      │  │     │
      │  │     └─ If Section Dimension:
      │  │        └─ Process each section (parallel)
      │  │
      │  └─ [See Dimension Lifecycle for details]
      │
      ├─ Phase 4: FINALIZATION
      │  ├─ 🪝 finalizeResults
      │  │   └─ Hook: Post-process all results
      │  │
      │  ├─ 💰 Calculate Costs
      │  │   └─ If pricing configured
      │  │
      │  └─ 🪝 afterProcessComplete
      │      └─ Hook: Cleanup, logging, modify output
      │
      └─ END: Return ProcessResult
```

---

## 🔍 Phase Breakdown

### Phase 1: Preparation (< 10ms)

**Purpose:** Set up the execution plan

```typescript
// 1️⃣ beforeProcessStart
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  // Validate, deduplicate, add metadata
  return {
    sections: modifiedSections,
    metadata: { startTime: Date.now() }
  };
}

// 2️⃣ defineDependencies
defineDependencies(context: ProcessContext): Dependencies {
  return {
    sentiment: [],                    // Independent
    topics: [],                       // Independent
    summary: ['sentiment', 'topics'], // Depends on both
    report: ['summary']               // Depends on summary
  };
}

// 3️⃣ Internal: Build DAG
// Engine validates and sorts:
// Result: [[sentiment, topics], [summary], [report]]
//          ↑ Group 0        ↑ Group 1   ↑ Group 2
```

**Output:**
- ✅ Valid dependency graph
- ✅ Execution groups identified
- ✅ Sections ready for processing

---

### Phase 2: Grouping (< 1ms)

**Purpose:** Maximize parallel execution

```
Dependencies:
  sentiment: []
  topics: []
  summary: ['sentiment', 'topics']
  report: ['summary']

Groups Created:
  Group 0: [sentiment, topics]    ← Can run in parallel
  Group 1: [summary]              ← Must wait for Group 0
  Group 2: [report]               ← Must wait for Group 1
```

**Algorithm:**
1. Find all dimensions with satisfied dependencies
2. Group them together (execute in parallel)
3. Mark as processed
4. Repeat until all dimensions grouped

**Result:** Optimal execution plan

---

### Phase 3: Execution (Most time spent here)

**For each group (sequentially):**

#### Global Dimensions
```typescript
// Process ALL sections at once
const result = await executeDimension({
  dimension: 'categorize',
  sections: [section1, section2, section3, ...],
  isGlobal: true
});

// Optional: Transform sections
if (dimension.transform) {
  sections = await transform(result, sections);
  // Example: [3 sections] → [2 categories]
}
```

#### Section Dimensions
```typescript
// Process each section independently (in parallel)
await Promise.all(
  sections.map(section => 
    executeDimension({
      dimension: 'sentiment',
      sections: [section],  // Single section
      isGlobal: false
    })
  )
);
```

**Concurrency Control:**
- Default: 5 sections at a time
- Configurable: `concurrency: 20`
- Prevents rate limits

**See:** [Dimension Lifecycle](/lifecycle/dimension) for detailed execution

---

### Phase 4: Finalization (< 10ms)

**Purpose:** Package results and calculate metrics

```typescript
// 1️⃣ finalizeResults
finalizeResults(context: FinalizeContext) {
  // Aggregate, post-process, format
  return enhancedResults;
}

// 2️⃣ Calculate Costs (automatic)
const costs = {
  totalCost: 0.75,
  totalTokens: 15000,
  byDimension: { ... },
  byProvider: { ... }
};

// 3️⃣ afterProcessComplete
afterProcessComplete(context: ProcessResultContext) {
  // Log metrics, save to database, send notifications
  return finalResult;
}
```

**Output:**
```typescript
{
  sections: [
    { section: {...}, results: { sentiment: {...}, topics: {...} } }
  ],
  globalResults: { categorize: {...} },
  transformedSections: [...],
  costs: { totalCost: 0.75, ... },
  metadata: { ... }
}
```

---

## ⚡ Parallel Execution Example

**Scenario:** 100 sections, 3 dimensions

```typescript
dimensions = ['sentiment', 'topics', 'summary'];
defineDependencies() {
  return { summary: ['sentiment', 'topics'] };
}
```

**Execution Timeline:**

```
Group 0: sentiment + topics (parallel)
├─ sentiment: 100 sections (5 at a time) = 20 batches
└─ topics:    100 sections (5 at a time) = 20 batches
   Both running simultaneously ⚡

Group 1: summary (sequential, waits for Group 0)
└─ summary: 100 sections (5 at a time) = 20 batches

Total Time:
- Without parallelization: 60 batches × 2s = 120s
- With parallelization:    40 batches × 2s = 80s
- Savings: 40s (33% faster) ⚡
```

---

## 🔄 State Management

**Process State:**
```typescript
{
  processId: "uuid-here",
  startTime: 1704067200000,
  currentPhase: "execution",
  completedDimensions: ['sentiment', 'topics'],
  pendingDimensions: ['summary'],
  errors: [],
  metadata: { ... }
}
```

**Available to hooks via `context.processId`**

---

## 🛡️ Error Handling

**Behavior:**

```typescript
// continueOnError: true (default)
// ✅ Process continues
// ❌ Failed dimensions have .error property

// continueOnError: false
// ❌ Stop on first error
// 🚫 Throw immediately
```

**Example:**
```typescript
const result = await engine.process(sections);

// Check for errors
result.sections[0].results.sentiment.error;  // "API failed"
result.sections[0].results.topics.data;      // { topics: [...] } ✓
```

**See:** [Error Handling Guide](/guide/error-handling)

---

## 📊 Performance Characteristics

**Factors affecting speed:**

| Factor | Impact | Solution |
|--------|--------|----------|
| Dependency depth | High | Flatten dependencies |
| Sequential dimensions | High | Add parallel dimensions |
| Large sections | Medium | Optimize prompts |
| API latency | High | Use faster providers |
| Concurrency limit | Medium | Increase `concurrency` |

**Optimization:**
```typescript
// Before: Deep chain
{ B: ['A'], C: ['B'], D: ['C'] }  // 4 sequential steps

// After: Parallel
{ B: ['A'], C: ['A'], D: ['A'] }  // 1 step, then 3 parallel
```

---

## 🎯 Real-World Example

**Content Analysis Pipeline:**

```typescript
class ContentPipeline extends Plugin {
  dimensions = [
    { name: 'classify', scope: 'global' },  // Group 0
    'sentiment',                             // Group 1
    'extract_entities',                      // Group 1 (parallel)
    'summary'                                // Group 2
  ];

  defineDependencies() {
    return {
      sentiment: ['classify'],
      extract_entities: ['classify'],
      summary: ['sentiment', 'extract_entities']
    };
  }
}
```

**Execution:**
```
1. Classify all 100 documents (global)
   ↓ Transform: 100 docs → 2 categories
   
2. Process 2 categories (parallel):
   ├─ Sentiment: 2 sections
   └─ Entities: 2 sections
   
3. Summary: 2 sections

Result: 100 docs processed in ~5 seconds
```

---

## 🔍 Debugging Workflow

**Use callbacks to track execution:**

```typescript
const result = await engine.process(sections, {
  onDimensionStart: (dim) => {
    console.log(`⏱️ Starting: ${dim}`);
  },
  
  onDimensionComplete: (dim, result) => {
    if (result.error) {
      console.error(`❌ ${dim} failed: ${result.error}`);
    } else {
      console.log(`✅ ${dim} completed`);
    }
  },
  
  onError: (context, error) => {
    console.error(`🚨 Error in ${context}:`, error);
  }
});
```

**Output:**
```
⏱️ Starting: classify
✅ classify completed
⏱️ Starting: sentiment
⏱️ Starting: extract_entities
✅ sentiment completed
✅ extract_entities completed
⏱️ Starting: summary
✅ summary completed
```

---

## 📚 Related Guides

- [Dimension Lifecycle](/lifecycle/dimension) - What happens inside each dimension
- [Dependencies Guide](/guide/dependencies) - Deep dive into DAG
- [Error Handling](/guide/error-handling) - Recovery strategies
- [Hooks Reference](/guide/hooks) - All 19 hooks explained
- [Performance Optimization](/guide/production#performance) - Speed up execution

---

## ❓ FAQ

**Q: Can I see the execution plan before running?**
```typescript
const analytics = await engine.getGraphAnalytics();
console.log(analytics.criticalPath);  // Longest execution path
console.log(analytics.parallelGroups); // Parallel dimensions
```

**Q: How do I measure actual execution time?**
```typescript
const start = Date.now();
const result = await engine.process(sections);
console.log(`Took: ${Date.now() - start}ms`);
```

**Q: Can I pause/resume execution?**
No, but you can process in batches:
```typescript
const batch1 = sections.slice(0, 100);
const batch2 = sections.slice(100, 200);

const result1 = await engine.process(batch1);
// ... save checkpoint ...
const result2 = await engine.process(batch2);
```

**Q: What if a dimension takes too long?**
```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: adapter,
  timeout: 60000,  // Global: 60s
  dimensionTimeouts: {
    'slow_dimension': 120000  // This one gets 120s
  }
});
```
