---
title: Dependencies Guide
description: Master dependency management in dag-ai workflows
---

# Dependencies Guide

Learn how to control execution order with DAG-based dependencies.

---

## 🎯 What Are Dependencies?

**Dependencies** define which dimensions must complete before others can start.

**Think of it like cooking:**
```
Can't frost a cake before baking it!
Can't serve dinner before cooking it!
```

**In dag-ai:**
```typescript
defineDependencies() {
  return {
    frost: ['bake'],      // Frost waits for bake
    serve: ['frost']      // Serve waits for frost
  };
}
```

---

## 📊 Simple Example

### Without Dependencies (Parallel)

```typescript
class ParallelPlugin extends Plugin {
  dimensions = ['sentiment', 'topics', 'entities'];
  
  // No defineDependencies() = all run in parallel
}
```

**Execution:**
```
┌───────────┐  ┌───────────┐  ┌───────────┐
│ sentiment │  │   topics  │  │ entities  │  ← All at once
└───────────┘  └───────────┘  └───────────┘
      ↓              ↓              ↓
   Done 2s        Done 3s        Done 2.5s

Total time: 3s (fastest)
```

---

### With Dependencies (Sequential)

```typescript
class SequentialPlugin extends Plugin {
  dimensions = ['sentiment', 'topics', 'summary'];
  
  defineDependencies() {
    return {
      topics: ['sentiment'],     // Wait for sentiment
      summary: ['topics']         // Wait for topics
    };
  }
}
```

**Execution:**
```
┌───────────┐
│ sentiment │  ← First
└─────┬─────┘
      ↓
┌───────────┐
│   topics  │  ← Second (waits)
└─────┬─────┘
      ↓
┌───────────┐
│  summary  │  ← Third (waits)
└───────────┘

Total time: 6s (slowest)
```

---

### With Smart Dependencies (Hybrid)

```typescript
class SmartPlugin extends Plugin {
  dimensions = ['sentiment', 'topics', 'entities', 'summary'];
  
  defineDependencies() {
    return {
      summary: ['sentiment', 'topics', 'entities']  // Only summary waits
    };
  }
}
```

**Execution:**
```
┌───────────┐  ┌───────────┐  ┌───────────┐
│ sentiment │  │   topics  │  │ entities  │  ← Parallel
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      └────────┬─────┴──────────────┘
               ↓
         ┌───────────┐
         │  summary  │  ← Waits for all three
         └───────────┘

Total time: 5s (optimized!)
```

**This is the sweet spot!** Maximum parallelization + correct order.

---

## 🔧 How to Define Dependencies

### Syntax

```typescript
defineDependencies() {
  return {
    dimensionName: ['dependency1', 'dependency2', ...]
  };
}
```

### Rules

1. ✅ **Dimensions not listed** = No dependencies (run immediately)
2. ✅ **Empty array** = No dependencies
3. ❌ **Circular dependencies** = Error (A→B→A)
4. ✅ **Multiple dependencies** = Waits for ALL

---

## 📚 Real-World Examples

### Example 1: Content Analysis Pipeline

**Goal:** Analyze → Categorize → Generate Report

```typescript
class ContentPipeline extends Plugin {
  dimensions = [
    'quick_scan',      // Fast check
    'sentiment',       // Detailed sentiment
    'topics',          // Extract topics
    'entities',        // Extract entities
    'categorize',      // Categorize content
    'summary',         // Create summary
    'report'           // Final report
  ];
  
  defineDependencies() {
    return {
      // Phase 1: Run in parallel (no dependencies)
      quick_scan: [],
      sentiment: [],
      topics: [],
      entities: [],
      
      // Phase 2: Categorize after we have data
      categorize: ['sentiment', 'topics', 'entities'],
      
      // Phase 3: Summary needs categorization
      summary: ['categorize'],
      
      // Phase 4: Report needs everything
      report: ['summary', 'quick_scan']
    };
  }
}
```

**Execution Flow:**
```
         Phase 1 (Parallel)
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│quick_scan│ │sentiment │ │  topics  │ │ entities │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │            └──────┬──────┴──────┘      │
     │                   ↓                     │
     │            ┌────────────┐              │
     │            │ categorize │  Phase 2     │
     │            └──────┬─────┘              │
     │                   ↓                     │
     │            ┌────────────┐              │
     │            │  summary   │  Phase 3     │
     │            └──────┬─────┘              │
     └────────────┬──────┘                    │
                  ↓                            │
           ┌────────────┐                     │
           │   report   │  Phase 4            │
           └────────────┘                     │

Time: ~8 seconds (optimized!)
vs 25 seconds if fully sequential
```

---

### Example 2: Two-Tier Processing

**Goal:** Quick filter → Deep analysis only for good content

```typescript
class TwoTierPipeline extends Plugin {
  dimensions = [
    'quick_check',      // Fast quality check
    'deep_analysis'     // Expensive analysis
  ];
  
  defineDependencies() {
    return {
      deep_analysis: ['quick_check']  // Wait for filter
    };
  }
  
  shouldSkipDimension(context) {
    if (context.dimension === 'deep_analysis') {
      const quality = context.dependencies.quick_check?.data?.quality;
      
      // Skip expensive analysis for low-quality content
      if (quality < 7) {
        return true;  // Save money!
      }
    }
    
    return false;
  }
  
  selectProvider(dimension) {
    return {
      quick_check: {
        provider: 'anthropic',
        options: { model: 'claude-haiku-3-5' }  // Cheap & fast
      },
      deep_analysis: {
        provider: 'anthropic',
        options: { model: 'claude-sonnet-4-5-20250929' }  // Expensive & good
      }
    }[dimension];
  }
}
```

**Cost Savings:**
```
Without filtering:
- 1000 documents × $0.03 = $30

With filtering (60% skipped):
- Quick check: 1000 × $0.001 = $1
- Deep analysis: 400 × $0.03 = $12
- Total: $13 (57% savings!)
```

---

### Example 3: Multi-Language Processing

**Goal:** Detect language → Translate if needed → Analyze

```typescript
class MultiLangPipeline extends Plugin {
  dimensions = [
    'detect_language',
    'translate',
    'sentiment'
  ];
  
  defineDependencies() {
    return {
      translate: ['detect_language'],
      sentiment: ['translate']  // Analyze translated text
    };
  }
  
  shouldSkipDimension(context) {
    if (context.dimension === 'translate') {
      const lang = context.dependencies.detect_language?.data?.language;
      
      // Skip translation if already English
      if (lang === 'en') {
        return {
          skip: true,
          result: {
            data: { text: context.section.content }  // Pass through
          }
        };
      }
    }
    
    return false;
  }
  
  createPrompt(context) {
    if (context.dimension === 'detect_language') {
      return `Detect language: "${context.sections[0].content}"
        Return JSON: {"language": "en|es|fr|de|..."}`;
    }
    
    if (context.dimension === 'translate') {
      return `Translate to English: "${context.sections[0].content}"`;
    }
    
    if (context.dimension === 'sentiment') {
      const text = context.dependencies.translate?.data?.text || context.section.content;
      return `Analyze sentiment: "${text}"`;
    }
  }
}
```

---

### Example 4: Branching Workflow

**Goal:** Different paths based on content type

```typescript
class BranchingPipeline extends Plugin {
  dimensions = [
    'classify_type',     // Classify: code vs text vs data
    'analyze_code',      // Only for code
    'analyze_text',      // Only for text
    'analyze_data',      // Only for data
    'final_report'       // Combine results
  ];
  
  defineDependencies() {
    return {
      analyze_code: ['classify_type'],
      analyze_text: ['classify_type'],
      analyze_data: ['classify_type'],
      final_report: ['analyze_code', 'analyze_text', 'analyze_data']
    };
  }
  
  shouldSkipDimension(context) {
    const type = context.dependencies.classify_type?.data?.type;
    
    // Skip branches that don't apply
    if (context.dimension === 'analyze_code' && type !== 'code') return true;
    if (context.dimension === 'analyze_text' && type !== 'text') return true;
    if (context.dimension === 'analyze_data' && type !== 'data') return true;
    
    return false;
  }
}
```

**Execution:**
```
         ┌──────────────┐
         │classify_type │
         └──────┬───────┘
                ↓
        ┌───────┴────────┐
        │  type = "code" │
        └───────┬────────┘
                ↓
    ┌───────────┼───────────┐
    ↓           ↓           ↓
┌────────┐ ┌────────┐ ┌────────┐
│analyze │ │analyze │ │analyze │
│  code  │ │  text  │ │  data  │
│   ✅   │ │  SKIP  │ │  SKIP  │
└───┬────┘ └────────┘ └────────┘
    └──────────┬──────────────┘
               ↓
        ┌──────────────┐
        │ final_report │
        └──────────────┘
```

---

## 🔍 Accessing Dependency Results

### In createPrompt

```typescript
createPrompt(context) {
  if (context.dimension === 'summary') {
    // Access dependency results
    const sentiment = context.dependencies.sentiment?.data?.sentiment;
    const topics = context.dependencies.topics?.data?.topics;
    
    return `Create a ${sentiment} summary about ${topics.join(', ')}`;
  }
}
```

### In shouldSkipDimension

```typescript
shouldSkipDimension(context) {
  if (context.dimension === 'deep_analysis') {
    const quality = context.dependencies.quick_check?.data?.quality;
    return quality < 7;
  }
}
```

### In transformDependencies

```typescript
transformDependencies(context) {
  // Modify dependency data before use
  const sentiment = context.dependencies.sentiment?.data;
  
  return {
    ...context.dependencies,
    sentiment: {
      ...sentiment,
      data: {
        ...sentiment.data,
        normalized: sentiment.data.score * 100  // Convert to percentage
      }
    }
  };
}
```

---

## ⚠️ Common Mistakes

### ❌ Mistake 1: Circular Dependencies

```typescript
defineDependencies() {
  return {
    A: ['B'],
    B: ['C'],
    C: ['A']  // ← ERROR: Circular!
  };
}
```

**Error:**
```
DagError: Circular dependency detected: A → B → C → A
```

**Fix:** Remove the loop
```typescript
defineDependencies() {
  return {
    B: ['A'],
    C: ['B']  // ✅ Linear: A → B → C
  };
}
```

---

### ❌ Mistake 2: Missing Dependency in shouldSkip

```typescript
defineDependencies() {
  return {
    summary: ['sentiment']  // ✅ Defined
  };
}

shouldSkipDimension(context) {
  if (context.dimension === 'summary') {
    // ❌ Trying to access 'topics' but it's not a dependency!
    const topics = context.dependencies.topics?.data;
    return topics.length === 0;
  }
}
```

**Fix:** Add the dependency
```typescript
defineDependencies() {
  return {
    summary: ['sentiment', 'topics']  // ✅ Now topics is available
  };
}
```

---

### ❌ Mistake 3: Over-Sequencing

```typescript
// ❌ BAD - unnecessarily sequential
defineDependencies() {
  return {
    B: ['A'],
    C: ['B'],  // C doesn't actually need B
    D: ['C']   // D doesn't actually need C
  };
}
```

**Result:** Slow (A → B → C → D = 10 seconds)

**Fix:** Only declare real dependencies
```typescript
// ✅ GOOD - parallel where possible
defineDependencies() {
  return {
    B: ['A'],
    C: [],     // C runs in parallel with A and B
    D: []      // D runs in parallel too
  };
}
```

**Result:** Fast (all parallel = 3 seconds)

---

## 🎯 Best Practices

### 1. **Minimize Dependencies**

Only add dependencies when truly needed.

```typescript
// ❌ BAD
defineDependencies() {
  return {
    summary: ['sentiment', 'topics', 'entities', 'quick_check']
  };
}

// ✅ GOOD (summary only needs sentiment and topics)
defineDependencies() {
  return {
    summary: ['sentiment', 'topics']
  };
}
```

### 2. **Batch Independent Work**

Run as much in parallel as possible.

```typescript
defineDependencies() {
  return {
    // Phase 1: All parallel
    sentiment: [],
    topics: [],
    entities: [],
    language: [],
    
    // Phase 2: Only final step waits
    report: ['sentiment', 'topics', 'entities', 'language']
  };
}
```

### 3. **Use shouldSkip for Conditional Logic**

Don't use dependencies for conditional execution.

```typescript
// ❌ BAD - can't conditionally skip with dependencies
defineDependencies() {
  return {
    translate: ['detect_language'],
    analyze: ['translate']
  };
}

// ✅ GOOD - use shouldSkip
shouldSkipDimension(context) {
  if (context.dimension === 'translate') {
    const lang = context.dependencies.detect_language?.data?.language;
    return lang === 'en';  // Skip if already English
  }
}
```

### 4. **Document Complex Dependencies**

```typescript
defineDependencies() {
  return {
    // Phase 1: Data gathering (parallel)
    sentiment: [],
    topics: [],
    entities: [],
    
    // Phase 2: Classification (needs all data)
    categorize: ['sentiment', 'topics', 'entities'],
    
    // Phase 3: Summary (needs categorization)
    summary: ['categorize'],
    
    // Phase 4: Report (needs summary)
    report: ['summary']
  };
}
```

---

## 🔍 Debugging Dependencies

### Visualize Execution Order

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: adapter
});

// Get execution plan
const graph = engine.getGraph();

console.log('Execution order:', graph.executionOrder);
console.log('Parallel groups:', graph.parallelGroups);
console.log('Critical path:', graph.criticalPath);
```

**Output:**
```json
{
  "executionOrder": ["sentiment", "topics", "entities", "categorize", "summary", "report"],
  "parallelGroups": [
    ["sentiment", "topics", "entities"],
    ["categorize"],
    ["summary"],
    ["report"]
  ],
  "criticalPath": ["sentiment", "categorize", "summary", "report"],
  "maxDepth": 4
}
```

### Export Visualization

```typescript
// Export as Graphviz DOT
const dot = await engine.exportGraphDOT();
console.log(dot);

// Export as D3.js JSON
const json = await engine.exportGraphJSON();
console.log(json);
```

---

## 📊 Performance Comparison

### Scenario: 5 dimensions, 3 seconds each

| Strategy | Total Time | Efficiency |
|----------|-----------|------------|
| **All Parallel** | 3s | ⭐⭐⭐⭐⭐ Best (if possible) |
| **Smart Dependencies** | 6s | ⭐⭐⭐⭐ Good |
| **Over-Sequenced** | 15s | ⭐⭐ Poor |
| **All Sequential** | 15s | ⭐ Worst |

**Key Insight:** Smart dependencies can give you 2.5x speedup!

---

## 🚀 Advanced Patterns

### Pattern 1: Fan-Out / Fan-In

```typescript
defineDependencies() {
  return {
    // Fan-out: One dimension splits into many
    analyze_intro: ['load'],
    analyze_body: ['load'],
    analyze_conclusion: ['load'],
    
    // Fan-in: Many dimensions combine into one
    final_report: ['analyze_intro', 'analyze_body', 'analyze_conclusion']
  };
}
```

### Pattern 2: Pipeline Stages

```typescript
defineDependencies() {
  return {
    // Stage 1: Extract
    extract_text: [],
    extract_images: [],
    
    // Stage 2: Transform
    transform_text: ['extract_text'],
    transform_images: ['extract_images'],
    
    // Stage 3: Load
    load_database: ['transform_text', 'transform_images']
  };
}
```

### Pattern 3: Conditional Branching

```typescript
defineDependencies() {
  return {
    classify: [],
    
    // Different branches
    process_code: ['classify'],
    process_text: ['classify'],
    process_data: ['classify'],
    
    // Merge
    final: ['process_code', 'process_text', 'process_data']
  };
}

shouldSkipDimension(context) {
  const type = context.dependencies.classify?.data?.type;
  
  if (context.dimension === 'process_code') return type !== 'code';
  if (context.dimension === 'process_text') return type !== 'text';
  if (context.dimension === 'process_data') return type !== 'data';
}
```

---

## 🎓 Summary

**Key Takeaways:**

1. ✅ **Dependencies control execution order**
2. ✅ **No dependencies = runs immediately in parallel**
3. ✅ **Multiple dependencies = waits for ALL**
4. ✅ **Minimize dependencies for speed**
5. ✅ **Use shouldSkip for conditional logic**
6. ❌ **Circular dependencies = error**

**Next Steps:**

- [Hooks System](/lifecycle/hooks) - Fine-tune execution
- [Cost Optimization](/guide/cost-optimization) - Save money with smart dependencies
- [Examples](/guide/examples) - See dependencies in action

---

## 🆘 Need Help?

- 💬 [Ask on GitHub Discussions](https://github.com/ivan629/dag-ai/discussions)
- 🐛 [Report Issues](https://github.com/ivan629/dag-ai/issues)
- 📚 [API Reference](/api/plugin#definedependencies)
```
