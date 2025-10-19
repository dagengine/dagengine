# Quick Reference Guide

> One-page cheat sheet for dag-ai fundamentals

**Need help?** Check the [full examples](./01-hello-world.ts) for detailed explanations.

---

## 📑 Table of Contents

- [Plugin Template](#plugin-template)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Data Structures](#data-structures)
- [Context Objects](#context-objects)
- [Dimension Types](#dimension-types)
- [Common Patterns](#common-patterns)
- [Engine Configuration](#engine-configuration)
- [Error Handling](#error-handling)
- [Examples Index](#examples-index)

---

## 🏗️ Plugin Template

**Copy-paste starting point:**
```typescript
import { Plugin, DagEngine } from "@dagengine/core";

class MyPlugin extends Plugin {
  constructor() {
    super("my-plugin", "My Plugin", "Description");
    
    // Define dimensions (tasks)
    this.dimensions = [
      "dimension_a",                          // Section dimension
      "dimension_b",                          // Section dimension
      { name: "dimension_c", scope: "global" } // Global dimension
    ];
  }

  // ✅ REQUIRED: Define dependencies (execution order)
  defineDependencies(): Record<string, string[]> {
    return {
      dimension_c: ["dimension_a", "dimension_b"]
    };
  }

  // ✅ REQUIRED: Create prompts for each dimension
  createPrompt(ctx: PromptContext): string {
    const { dimension, sections, dependencies } = ctx;
    
    if (dimension === "dimension_a") {
      return `Your prompt for ${sections[0]?.content}`;
    }
    
    return "";
  }

  // ✅ REQUIRED: Select AI provider per dimension
  selectProvider(dimension: string): ProviderSelection {
    return {
      provider: "anthropic",
      options: { model: "claude-3-5-haiku-20241022" }
    };
  }
}

// Usage
const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

const result = await engine.process([
  { content: "your data", metadata: {} }
]);
```

---

## 🔄 Lifecycle Hooks

**All available hooks (all optional except createPrompt/selectProvider):**
```typescript
class MyPlugin extends Plugin {
  
  // ============================================================================
  // SETUP & TEARDOWN
  // ============================================================================
  
  async beforeProcess(sections: SectionData[]): Promise<void> {
    // Called once before processing starts
    // Use for: Setup, load config, initialize connections
  }

  async afterProcess(sections: SectionData[], results: any): Promise<void> {
    // Called once after all processing completes
    // Use for: Cleanup, send notifications, final logging
  }

  // ============================================================================
  // PER-DIMENSION HOOKS
  // ============================================================================

  async beforeDimensionExecute(ctx: SectionDimensionContext): Promise<void> {
    // Called before each dimension execution
    // Use for: Pre-checks, fetch context, rate limit checks
  }

  async afterDimensionExecute(ctx: SectionDimensionContext): Promise<void> {
    // Called after each dimension executes successfully
    // Use for: Save results, update cache, send webhooks
  }

  // ============================================================================
  // CONTROL FLOW
  // ============================================================================

  async shouldSkipDimension(ctx: SectionDimensionContext): Promise<boolean | { skip: boolean; result?: any }> {
    // Called before dimension execution to decide if should skip
    // Return: true (skip), false (proceed), or { skip: true, result: cached }
    // Use for: Cache checks, quality filters, conditional logic
  }

  // ============================================================================
  // TRANSFORMATIONS
  // ============================================================================

  async transformSections(ctx: TransformSectionsContext): Promise<SectionData[]> {
    // Called after dimension completes to reshape sections
    // Return: New sections array (or unchanged)
    // Use for: Group items, filter items, reshape data
  }

  async transformDependencies(ctx: DimensionContext): Promise<Record<string, any>> {
    // Called before createPrompt to modify dependency data
    // Return: Modified dependencies
    // Use for: Enrich data, normalize formats, extract fields
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  onDimensionError(ctx: DimensionErrorContext): ErrorAction {
    // Called when dimension execution fails
    // Return: { action: "retry" | "skip" | "fail" | "fallback", ... }
    // Use for: Retry logic, fallback providers, error recovery
  }
}
```

**When to use each hook:**

| Hook | Use Case | Example |
|------|----------|---------|
| `beforeProcess` | Setup before processing | Load config from DB, init connections |
| `beforeDimensionExecute` | Pre-execution checks | Fetch additional context, check rate limits |
| `shouldSkipDimension` | Conditional execution | Cache check, quality filter |
| `transformDependencies` | Modify input data | Enrich with API, normalize format |
| `afterDimensionExecute` | Post-execution tasks | Save to DB, update cache, webhooks |
| `transformSections` | Reshape data mid-flow | Group 100 → 5, filter items |
| `afterProcess` | Cleanup/finalization | Send completion notification, close connections |
| `onDimensionError` | Error recovery | Retry with backoff, fallback provider |

---

## 📦 Data Structures

### **SectionData** (Input)
```typescript
interface SectionData {
  content: string;           // The text/data to process
  metadata?: {               // Optional metadata (preserved throughout)
    id?: number;
    [key: string]: any;
  };
}

// Example
const sections: SectionData[] = [
  { content: "Review text here", metadata: { id: 1, source: "web" } }
];
```

### **ProcessResult** (Output)
```typescript
interface ProcessResult {
  sections: Array<{
    section: SectionData;           // Original section
    results: {                      // Results per dimension
      dimension_name: DimensionResult<T>;
    };
  }>;
  
  globalResults: {                  // Global dimension results
    dimension_name: DimensionResult<T>;
  };
  
  costs?: {                         // Cost tracking
    totalCost: number;
    byDimension: Record<string, number>;
  };
  
  metadata: {                       // Execution metadata
    duration: number;
    startTime: Date;
    endTime: Date;
  };
}

// Accessing results
const sentiment = result.sections[0].results.sentiment?.data;
const summary = result.globalResults.summary?.data;
```

### **DimensionResult** (Per-dimension result)
```typescript
interface DimensionResult<T> {
  data: T;                   // Your parsed JSON result
  raw?: string;              // Raw AI response (optional)
  error?: string;            // Error message if failed
  metadata: {
    model: string;           // Model used
    provider: string;        // Provider used
    duration: number;        // Execution time (ms)
    cost: number;            // Cost estimate
    usage?: {                // Token usage
      inputTokens: number;
      outputTokens: number;
    };
  };
}

// Check for errors
if (result.sections[0].results.sentiment?.error) {
  console.error("Sentiment analysis failed");
}
```

---

## 🎯 Context Objects

### **PromptContext** (createPrompt)
```typescript
interface PromptContext {
  dimension: string;                    // Current dimension name
  sections: SectionData[];              // Section(s) being processed
  dependencies: Record<string, DimensionResult>; // Results from dependent dimensions
  metadata?: any;                       // Custom metadata
}

// Usage
createPrompt(ctx: PromptContext): string {
  const content = ctx.sections[0]?.content;
  const priorResult = ctx.dependencies.sentiment?.data;
  return `Analyze: ${content}, Sentiment was: ${priorResult}`;
}
```

### **SectionDimensionContext** (most hooks)
```typescript
interface SectionDimensionContext {
  dimension: string;                    // Current dimension
  section: SectionData;                 // Current section
  dependencies: Record<string, DimensionResult>; // Dependency results
  result?: DimensionResult;             // Result (after execution)
  error?: Error;                        // Error (if failed)
}

// Usage in shouldSkipDimension
shouldSkipDimension(ctx: SectionDimensionContext) {
  const quality = ctx.dependencies.quality_check?.data?.score;
  return quality < 0.6;  // Skip if low quality
}
```

### **TransformSectionsContext** (transformSections)
```typescript
interface TransformSectionsContext {
  dimension: string;                    // Dimension that just completed
  currentSections: SectionData[];       // Current sections
  result: DimensionResult;              // Result from dimension
}

// Usage
transformSections(ctx: TransformSectionsContext): SectionData[] {
  if (ctx.dimension === "group") {
    // Transform 100 items → 5 groups
    return groups.map(g => ({ content: g.items.join('\n') }));
  }
  return ctx.currentSections;  // No transformation
}
```

---

## 🎨 Dimension Types
```typescript
// Section dimension (default - runs per-item, parallel)
"dimension_name"

// Global dimension (runs once across all items, sequential)
{
  name: "dimension_name",
  scope: "global"
}

// With metadata (advanced, rarely used)
{
  name: "dimension_name",
  scope: "section",
  metadata: {
    cost_tier: "expensive",
    timeout: 60000,
    custom_field: "value"
  }
}
```

**Section vs Global:**

| Aspect | Section Dimension | Global Dimension |
|--------|-------------------|------------------|
| Scope | Per-item | Across all items |
| Execution | Parallel | Sequential |
| Use for | Independent analysis | Cross-item synthesis |
| Example | Sentiment per review | Summary of all reviews |

---

## 🔧 Common Patterns

### **Pattern 1: Filter → Analyze**

**Use when:** Mixed quality data, expensive analysis
```typescript
class FilterAnalyzePlugin extends Plugin {
  dimensions = ["quality_check", "deep_analysis"];
  
  defineDependencies() {
    return { deep_analysis: ["quality_check"] };
  }
  
  shouldSkipDimension(ctx) {
    if (ctx.dimension === "deep_analysis") {
      const quality = ctx.dependencies.quality_check?.data?.score;
      return quality < 0.6;  // Skip low quality
    }
  }
}
// Savings: 40-60% cost reduction
```

### **Pattern 2: Classify → Group → Analyze**

**Use when:** Many similar items that can be grouped
```typescript
class ClassifyGroupPlugin extends Plugin {
  dimensions = [
    "classify",
    { name: "group", scope: "global" },
    "analyze_group"
  ];
  
  defineDependencies() {
    return {
      group: ["classify"],
      analyze_group: ["group"]
    };
  }
  
  transformSections(ctx) {
    if (ctx.dimension === "group") {
      // Transform 100 items → 5 groups
      return groups.map(g => ({ content: g.items.join('\n') }));
    }
    return ctx.currentSections;
  }
}
// Savings: 70-90% cost reduction
```

### **Pattern 3: Parallel → Synthesis**

**Use when:** Multiple independent analyses needed
```typescript
class ParallelSynthesisPlugin extends Plugin {
  dimensions = [
    "task_a",                           // Independent
    "task_b",                           // Independent
    "task_c",                           // Independent
    { name: "synthesis", scope: "global" }  // Depends on all
  ];
  
  defineDependencies() {
    return {
      synthesis: ["task_a", "task_b", "task_c"]
    };
  }
}
// Benefit: 2-3x faster execution
```

### **Pattern 4: Multi-Tier Processing**

**Use when:** Progressive complexity in analysis
```typescript
class MultiTierPlugin extends Plugin {
  selectProvider(dimension: string) {
    if (dimension === "quick_filter") {
      return { provider: "anthropic", options: { model: "claude-3-5-haiku" } };
    }
    if (dimension === "deep_analysis") {
      return { provider: "anthropic", options: { model: "claude-3-5-sonnet" } };
    }
  }
}
// Savings: 50-70% cost while maintaining quality
```

---

## ⚙️ Engine Configuration
```typescript
const engine = new DagEngine({
  // ✅ REQUIRED
  plugin: new MyPlugin(),
  
  // ✅ REQUIRED
  providers: {
    anthropic: { apiKey: string },
    openai: { apiKey: string },
    google: { apiKey: string }
  },
  
  // Optional: Execution control
  execution: {
    concurrency: 10,         // Max parallel sections (default: 10)
    continueOnError: true,   // Don't stop on error (default: false)
    timeout: 30000           // Request timeout ms (default: 30000)
  },
  
  // Optional: Cost tracking
  pricing: {
    models: {
      "claude-3-5-haiku-20241022": {
        inputPer1M: 0.80,
        outputPer1M: 4.00
      },
      "claude-3-5-sonnet-20241022": {
        inputPer1M: 3.00,
        outputPer1M: 15.00
      }
    }
  },
  
  // Optional: Progress display
  progressDisplay: {
    display: 'bar' | 'dots' | 'none',  // Visual style
    showDimensions: true,               // Show dimension names
    showCosts: true,                    // Show cost estimates
    showTimings: true                   // Show timing info
  },
  
  // Optional: Custom progress callback
  onProgress: (progress: ProgressUpdate) => {
    console.log(`${progress.completed}/${progress.total}`);
    // Update dashboard, send webhook, etc.
  }
});
```

---

## 🚨 Error Handling

### **Error Actions**
```typescript
onDimensionError(ctx: DimensionErrorContext): ErrorAction {
  const errorType = detectErrorType(ctx.error);
  
  // 1. RETRY (transient errors)
  if (errorType === "rate_limit" || errorType === "timeout") {
    return {
      action: "retry",
      delay: Math.pow(2, attempts) * 1000  // Exponential backoff
    };
  }
  
  // 2. FALLBACK (provider issues)
  if (errorType === "provider_error") {
    return {
      action: "fallback",
      provider: "openai",  // Switch provider
      options: { model: "gpt-4o-mini" }
    };
  }
  
  // 3. RETRY WITH MODIFICATION
  if (errorType === "invalid_request") {
    return {
      action: "retry",
      modifyRequest: (ctx) => ({
        ...ctx,
        promptOverride: simplifiedPrompt
      })
    };
  }
  
  // 4. SKIP (non-critical)
  if (errorType === "content_policy") {
    return { action: "skip" };
  }
  
  // 5. FAIL (critical)
  return { action: "fail" };
}
```

### **Error Classification**

| Error Type | Strategy | Example |
|------------|----------|---------|
| `rate_limit` | Retry with backoff | 429 errors |
| `timeout` | Retry with backoff | Network timeout |
| `provider_error` | Fallback provider | 503 errors |
| `invalid_request` | Modify and retry | 400 errors |
| `invalid_response` | Modify and retry | Malformed JSON |
| `content_policy` | Skip section | Content blocked |
| `context_length` | Skip section | Input too long |
| `auth_error` | Fail immediately | Invalid API key |

---

## 📚 Examples Index

**Where to find each concept:**

| Concept | Example | Time |
|---------|---------|------|
| Plugin basics | [01-hello-world](./01-hello-world.ts) | 5 min |
| Dependencies & parallelization | [02-dependencies](./02-dependencies.ts) | 10 min |
| Section vs Global (killer feature) | [03-section-vs-global](./03-section-vs-global.ts) | 15 min |
| Data transformations | [04-transformations](./04-transformations.ts) | 15 min |
| Skip logic & cost optimization | [05-skip-logic](./05-skip-logic.ts) | 15 min |
| Multi-provider strategies | [06-providers](./06-providers.ts) | 10 min |
| Async hooks & integrations | [07-async-hooks](./07-async-hooks.ts) | 20 min |
| Error handling & retries | [08-error-handling](./08-error-handling.ts) | 20 min |
| Progress monitoring | [09-progress-monitoring](./09-progress-monitoring.ts) | 15 min |

**Total learning time:** ~2 hours

---

## 🎯 Quick Tips

### **Performance Optimization**
```typescript
// 1. Use cheap models for simple tasks
selectProvider(dimension) {
  return dimension === "filter" 
    ? { provider: "anthropic", options: { model: "haiku" } }
    : { provider: "anthropic", options: { model: "sonnet" } };
}

// 2. Skip low-value operations
shouldSkipDimension(ctx) {
  return ctx.dependencies.check?.data?.score < threshold;
}

// 3. Transform to reduce items
transformSections(ctx) {
  return groupByCategory(ctx.currentSections);  // 100 → 5
}

// 4. Cache aggressively
async shouldSkipDimension(ctx) {
  const cached = await redis.get(key);
  return cached ? { skip: true, result: cached } : false;
}
```

### **Common Mistakes**

❌ **Don't:** Put all logic in one dimension  
✅ **Do:** Split into focused dimensions with dependencies

❌ **Don't:** Use global scope for independent analysis  
✅ **Do:** Use section scope (parallel) for per-item tasks

❌ **Don't:** Ignore error handling  
✅ **Do:** Implement onDimensionError for production

❌ **Don't:** Use expensive models for everything  
✅ **Do:** Match model capability to task complexity

---

## 🚀 Next Steps

- **Patterns:** Copy-paste workflow templates → [patterns/](../patterns/)
- **Production:** Deploy with confidence → [production/](../production/)
- **Use Cases:** Real-world examples → [use-cases/](../use-cases/)

---

**Questions?** Check the detailed examples or open an issue.