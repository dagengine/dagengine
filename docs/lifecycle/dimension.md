---
title: Dimension Lifecycle
description: Detailed execution flow for a single dimension
---

# Dimension Lifecycle

Understand exactly what happens when a single dimension executes.

---

## 🎯 Quick Overview

**A dimension** is one analysis task (e.g., "sentiment", "extract_entities", "summary").

**Each dimension goes through:**
1. ⏭️ Check if should skip
2. 🔗 Resolve dependencies
3. 📝 Create prompt
4. 🤖 Select provider
5. 🔄 Execute with retries
6. ✅ Return result

**Time:** 0.5-3 seconds per dimension (depends on provider)

---

## 📊 Visual Flow

### Section Dimension (per-item processing)

```
┌───────────────────────────────────────────────────────────┐
│           SECTION DIMENSION LIFECYCLE                      │
│  (Executes once per section - can run in parallel)        │
└───────────────────────────────────────────────────────────┘

For each section:
│
├─ 1️⃣ SKIP CHECK
│  └─ 🪝 shouldSkipDimension(context)
│     ├─ Returns: true → Skip ⏭️
│     ├─ Returns: false → Continue ✓
│     └─ Returns: {skip: true, result} → Use cached ⚡
│
├─ 2️⃣ PREPARE
│  ├─ Resolve dependencies
│  │  └─ Get results from previous dimensions
│  │
│  ├─ 🪝 transformDependencies(context)
│  │  └─ Optional: Modify dependency data
│  │
│  └─ 🪝 beforeDimensionExecute(context)
│     └─ Optional: Setup, logging
│
├─ 3️⃣ PROMPT CREATION
│  └─ 🔧 createPrompt(context)
│     └─ Required: Build AI prompt
│
├─ 4️⃣ PROVIDER SELECTION
│  └─ 🔧 selectProvider(dimension, section)
│     └─ Required: Choose provider + fallbacks
│
├─ 5️⃣ EXECUTION (see Provider Chain below)
│  │
│  ├─ 🪝 beforeProviderExecute(context)
│  │  └─ Optional: Modify request
│  │
│  ├─ 🔄 Execute with retries & fallbacks
│  │  └─ [Detailed flow below]
│  │
│  └─ 🪝 afterProviderExecute(context)
│     └─ Optional: Modify response
│
├─ 6️⃣ FINALIZE
│  └─ 🪝 afterDimensionExecute(context)
│     └─ Optional: Cleanup, caching, metrics
│
└─ 7️⃣ RETURN RESULT
└─ { data: {...}, metadata: {...} }
```

### Global Dimension (all-at-once processing)

```
┌───────────────────────────────────────────────────────────┐
│            GLOBAL DIMENSION LIFECYCLE                      │
│     (Executes once for ALL sections together)             │
└───────────────────────────────────────────────────────────┘

│
├─ 1️⃣ SKIP CHECK
│  └─ 🪝 shouldSkipGlobalDimension(context)
│     └─ Same as section skip logic
│
├─ 2️⃣ PREPARE
│  ├─ Resolve dependencies
│  │  ├─ Global deps: Direct result
│  │  └─ Section deps: Aggregated as array
│  │
│  ├─ 🪝 transformDependencies(context)
│  └─ 🪝 beforeDimensionExecute(context)
│
├─ 3️⃣ PROMPT CREATION
│  └─ 🔧 createPrompt(context)
│     └─ Context includes ALL sections
│
├─ 4️⃣ PROVIDER SELECTION
│  └─ 🔧 selectProvider(dimension)
│
├─ 5️⃣ EXECUTION
│  ├─ 🪝 beforeProviderExecute(context)
│  ├─ 🔄 Execute with retries & fallbacks
│  └─ 🪝 afterProviderExecute(context)
│
├─ 6️⃣ SECTION TRANSFORMATION (Optional)
│  └─ 🪝 transformSections(context)
│     └─ Can split/merge/filter sections
│     └─ Example: 100 docs → 5 categories
│
├─ 7️⃣ FINALIZE
│  └─ 🪝 afterDimensionExecute(context)
│
└─ 8️⃣ RETURN RESULT
└─ Stored in globalResults
```

---

## 🔍 Phase-by-Phase Breakdown

### 1️⃣ Skip Check (< 1ms)

**Purpose:** Avoid unnecessary API calls

**Section Dimensions:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean | SkipWithResult {
  // Context contains:
  // - dimension: "sentiment"
  // - section: { content: "...", metadata: {} }
  // - sectionIndex: 0
  // - dependencies: { summary: { data: {...} } }
  
  // Skip short content
  if (context.section.content.length < 50) {
    return true;  // ⏭️ Skip
  }
  
  // Return cached result
  const cached = this.cache.get(context.section.content);
  if (cached) {
    return {
      skip: true,
      result: { data: cached, metadata: { cached: true } }
    };  // ⚡ Use cache
  }
  
  // Skip based on dependency
  if (context.dependencies.quality?.data?.score < 5) {
    return true;  // ⏭️ Skip low-quality
  }
  
  return false;  // ✓ Execute
}
```

**Global Dimensions:**
```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean | SkipWithResult {
  // Context contains:
  // - dimension: "categorize"
  // - sections: [...all sections...]
  // - dependencies: { ... }
  
  // Skip if too few sections
  if (context.sections.length < 3) {
    return true;
  }
  
  // Skip if all sections empty
  if (context.sections.every(s => !s.content.trim())) {
    return true;
  }
  
  return false;
}
```

**Result:**
- If `true`: Dimension skipped, result = `{ data: { skipped: true, reason: "..." } }`
- If `{skip: true, result}`: Use provided result
- If `false`: Continue to next phase

---

### 2️⃣ Prepare (< 5ms)

**A. Resolve Dependencies**

**For Section Dimensions:**
```typescript
// If dimension = "summary" depends on ["sentiment", "topics"]
const dependencies = {
  sentiment: {
    data: { score: 0.85, label: "positive" },
    metadata: { provider: "anthropic", tokens: {...} }
  },
  topics: {
    data: { topics: ["AI", "technology"] },
    metadata: { provider: "openai", tokens: {...} }
  }
};

// Available in createPrompt as: context.dependencies.sentiment.data
```

**For Global Dimensions:**
```typescript
// Global depends on section dimension "sentiment"
// All section results aggregated:
const dependencies = {
  sentiment: {
    data: {
      sections: [
        { data: { score: 0.85 } },  // Section 0
        { data: { score: 0.60 } },  // Section 1
        { data: { score: 0.92 } }   // Section 2
      ],
      aggregated: true,
      totalSections: 3
    }
  }
};
```

**B. Transform Dependencies (Optional)**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  // Extract specific fields
  if (deps.sentiment?.data) {
    deps.sentimentScore = {
      data: deps.sentiment.data.score
    };
  }
  
  // Combine multiple dependencies
  deps.combined = {
    data: {
      sentiment: deps.sentiment?.data,
      topics: deps.topics?.data
    }
  };
  
  return deps;
}
```

**C. Before Dimension Execute**
```typescript
beforeDimensionExecute(context: DimensionContext): void {
  // Logging
  console.log(`Starting ${context.dimension} for ${context.sections.length} sections`);
  
  // Metrics
  this.metrics.startTimer(context.dimension);
  
  // State management
  this.currentDimension = context.dimension;
}
```

---

### 3️⃣ Prompt Creation (< 1ms)

**Purpose:** Build the AI prompt

```typescript
createPrompt(context: PromptContext): string {
  // Context contains:
  // - dimension: string
  // - sections: SectionData[] (1 for section dims, all for global)
  // - dependencies: DimensionDependencies
  // - isGlobal: boolean
  
  if (context.dimension === 'sentiment') {
    return `Analyze sentiment: "${context.sections[0].content}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  if (context.dimension === 'summary') {
    const sentiment = context.dependencies.sentiment?.data;
    const topics = context.dependencies.topics?.data;
    
    return `Create a ${sentiment.label} summary focusing on these topics: ${topics.topics.join(', ')}
    
    Text: "${context.sections[0].content}"`;
  }
  
  if (context.dimension === 'categorize' && context.isGlobal) {
    const allContent = context.sections.map((s, i) => 
      `[${i}] ${s.content}`
    ).join('\n\n');
    
    return `Categorize these documents into "tech", "news", "other":
    Return JSON: {"tech": [indices], "news": [indices], "other": [indices]}
    
    ${allContent}`;
  }
  
  return '';
}
```

**Output:** String prompt ready for AI provider

---

### 4️⃣ Provider Selection (< 1ms)

**Purpose:** Choose which AI provider to use

```typescript
selectProvider(dimension: string, section?: SectionData): ProviderSelection {
  // Basic
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }
  };
  
  // With fallbacks
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },
    fallbacks: [
      { 
        provider: 'openai', 
        options: { model: 'gpt-4o' },
        retryAfter: 1000  // Wait 1s before trying
      },
      { 
        provider: 'gemini', 
        options: { model: 'gemini-1.5-pro' }
      }
    ]
  };
  
  // Conditional selection
  if (section && section.content.length > 10000) {
    // Long content → cheaper model
    return {
      provider: 'gemini',
      options: { model: 'gemini-1.5-flash' }
    };
  }
  
  if (dimension === 'critical_analysis') {
    // Important → best model
    return {
      provider: 'anthropic',
      options: { model: 'claude-opus-4' }
    };
  }
  
  return { provider: 'anthropic', options: {} };
}
```

**Output:** Provider configuration with optional fallback chain

---

### 5️⃣ Execution (1-3 seconds)

**This is where the magic happens!**

#### Provider Execution Chain

```
┌──────────────────────────────────────────────────────────┐
│               PROVIDER EXECUTION CHAIN                    │
└──────────────────────────────────────────────────────────┘

For each provider (primary + fallbacks):
   │
   ├─ Validate provider exists
   │  └─ If not found → Skip to next
   │
   ├─ Wait for retryAfter delay (if fallback)
   │
   ├─ Build Request
   │  └─ { input: prompt, options: {...}, metadata: {...} }
   │
   ├─ 🪝 beforeProviderExecute(context)
   │  └─ Modify request (optional)
   │
   ├─ RETRY LOOP (max 3 attempts by default)
   │  │
   │  ├─ Attempt 1:
   │  │  ├─ Call provider.execute(request)
   │  │  ├─ Success? → Continue to afterProviderExecute ✓
   │  │  └─ Error? → Continue to retry logic
   │  │
   │  ├─ 🪝 handleRetry(context)
   │  │  ├─ Returns: { shouldRetry: false } → Stop retrying
   │  │  ├─ Returns: { shouldRetry: true, delayMs: 2000 }
   │  │  ├─ Returns: { modifiedRequest: {...} } → Try with new request
   │  │  └─ Returns: {} → Use default behavior
   │  │
   │  ├─ Wait (exponential backoff: 1s, 2s, 4s)
   │  │
   │  ├─ Attempt 2: [same as above]
   │  ├─ Attempt 3: [same as above]
   │  │
   │  └─ All attempts failed:
   │     ├─ If fallback available:
   │     │  │
   │     │  ├─ 🪝 handleProviderFallback(context)
   │     │  │  ├─ Returns: { shouldFallback: false } → Give up
   │     │  │  ├─ Returns: { shouldFallback: true, delayMs: 1000 }
   │     │  │  └─ Returns: { modifiedRequest: {...} }
   │     │  │
   │     │  └─ Try next provider in chain
   │     │
   │     └─ No more fallbacks:
   │        │
   │        ├─ 🪝 handleDimensionFailure(context)
   │        │  ├─ Returns: DimensionResult → Use as result
   │        │  └─ Returns: void → Throw error
   │        │
   │        └─ Throw error or return fallback
   │
   └─ Success from provider:
      │
      ├─ 🪝 afterProviderExecute(context)
      │  └─ Modify response (optional)
      │
      └─ Return DimensionResult
```

#### Code Example

```typescript
// beforeProviderExecute
beforeProviderExecute(context: ProviderContext): ProviderRequest {
  const request = { ...context.request };
  
  // Add system message for Claude
  if (context.provider === 'anthropic') {
    request.input = `System: You are a helpful assistant.\n\n${request.input}`;
  }
  
  // Adjust temperature
  if (context.dimension === 'creative_writing') {
    request.options = { ...request.options, temperature: 0.9 };
  }
  
  return request;
}

// handleRetry
handleRetry(context: RetryContext): RetryResponse {
  // Rate limit → wait longer
  if (context.error.message.includes('rate_limit')) {
    return {
      shouldRetry: true,
      delayMs: 60000  // Wait 1 minute
    };
  }
  
  // Context too long → truncate
  if (context.error.message.includes('context_length')) {
    return {
      shouldRetry: true,
      modifiedRequest: {
        ...context.request,
        input: context.request.input.substring(0, 5000)
      }
    };
  }
  
  // Invalid API key → don't retry
  if (context.error.message.includes('invalid_api_key')) {
    return { shouldRetry: false };
  }
  
  // Default: retry with exponential backoff
  return {};
}

// handleProviderFallback
handleProviderFallback(context: FallbackContext): FallbackResponse {
  console.log(`Falling back: ${context.failedProvider} → ${context.fallbackProvider}`);
  
  // Gemini needs more explicit JSON instructions
  if (context.fallbackProvider === 'gemini') {
    return {
      shouldFallback: true,
      delayMs: 2000,
      modifiedRequest: {
        ...context.request,
        input: context.request.input + '\n\nIMPORTANT: Return valid JSON only.',
        options: { ...context.request.options, temperature: 0 }
      }
    };
  }
  
  return {};  // Default behavior
}

// handleDimensionFailure
handleDimensionFailure(context: FailureContext): DimensionResult {
  console.error(`All providers failed for ${context.dimension}`);
  
  // Return safe default
  if (context.dimension === 'sentiment') {
    return {
      data: { sentiment: 'neutral', score: 0.5 },
      metadata: { fallback: true, reason: 'All providers failed' }
    };
  }
  
  // Let it fail for critical dimensions
  return {
    error: `Failed after ${context.totalAttempts} attempts`,
    metadata: { providers: context.providers }
  };
}

// afterProviderExecute
afterProviderExecute(context: ProviderResultContext): ProviderResponse {
  const response = { ...context.result };
  
  // Ensure required fields
  if (context.dimension === 'sentiment' && response.data) {
    if (!response.data.score) {
      response.data.score = 0.5;  // Default
    }
  }
  
  // Add custom metadata
  response.metadata = {
    ...response.metadata,
    dimension: context.dimension,
    duration: context.duration,
    processedAt: Date.now()
  };
  
  return response;
}
```

**Timeline Example:**
```
00:00.000 - Start provider: anthropic
00:00.100 - beforeProviderExecute
00:00.101 - Attempt 1
00:01.500 - Error: rate_limit
00:01.501 - handleRetry → wait 60s
00:61.501 - Attempt 2
00:62.200 - Error: rate_limit
00:62.201 - handleRetry → wait 60s
00:122.201 - Attempt 3
00:123.000 - Error: rate_limit
00:123.001 - All retries exhausted
00:123.002 - handleProviderFallback → try openai
00:124.002 - Start provider: openai
00:124.102 - Attempt 1
00:125.500 - Success ✓
00:125.501 - afterProviderExecute
00:125.502 - Return result

Total: 125.502 seconds (due to rate limits)
```

---

### 6️⃣ Section Transformation (Global only)

**Purpose:** Restructure sections based on analysis

**Only for global dimensions. Happens AFTER execution.**

```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'categorize') {
    return context.currentSections;  // No change
  }
  
  // AI returned: {"tech": [0, 2], "news": [1, 3], "other": [4]}
  const categories = context.result.data;
  const newSections: SectionData[] = [];
  
  // Create one section per category
  for (const [category, indices] of Object.entries(categories)) {
    const items = indices.map(i => context.currentSections[i]);
    newSections.push({
      content: items.map(s => s.content).join('\n---\n'),
      metadata: { 
        category,
        originalCount: items.length,
        originalIndices: indices
      }
    });
  }
  
  return newSections;  // [5 sections] → [3 categories]
}
```

**Effect:**
```
Before: [section0, section1, section2, section3, section4]
After:  [tech_section, news_section, other_section]

Subsequent dimensions process NEW sections!
```

**See:** [Section Transformations Guide](/advanced/section-transforms)

---

### 7️⃣ Finalize (< 1ms)

**Purpose:** Cleanup, caching, metrics

```typescript
afterDimensionExecute(context: DimensionResultContext): void {
  // Record metrics
  this.metrics.recordDimension({
    name: context.dimension,
    duration: context.duration,
    provider: context.provider,
    tokens: context.tokensUsed,
    success: !context.result.error
  });
  
  // Cache result
  if (!context.result.error && !context.isGlobal) {
    const key = this.hash(context.sections[0].content);
    this.cache.set(key, context.result, 3600);  // Cache for 1 hour
  }
  
  // Trigger webhook
  if (context.dimension === 'critical_check' && context.result.data.isCritical) {
    this.sendAlert(context.result);
  }
  
  // Cleanup
  this.currentDimension = null;
}
```

---

### 8️⃣ Return Result

**Structure:**

```typescript
// Success
{
  data: {
    sentiment: "positive",
    score: 0.85
  },
  metadata: {
    model: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    tokens: {
      inputTokens: 150,
      outputTokens: 50,
      totalTokens: 200
    },
    duration: 1234,  // ms
    cached: false
  }
}

// Error
{
  error: "All providers failed: rate_limit, timeout, invalid_response",
  metadata: {
    providers: ["anthropic", "openai", "gemini"],
    totalAttempts: 9,
    lastError: "timeout"
  }
}

// Skipped
{
  data: {
    skipped: true,
    reason: "Content too short"
  },
  metadata: {
    skippedAt: "shouldSkipDimension"
  }
}
```

---

## 🔄 Section vs Global Differences

| Aspect | Section Dimension | Global Dimension |
|--------|------------------|------------------|
| **Execution** | Once per section | Once for all sections |
| **Parallelism** | Processes sections in parallel | Single execution |
| **Context.sections** | Array with 1 item | Array with all items |
| **Skip hook** | `shouldSkipDimension` | `shouldSkipGlobalDimension` |
| **Transformation** | ❌ Not available | ✅ `transformSections` |
| **Dependencies** | Section results | Aggregated section results |
| **Use case** | Per-item analysis | Cross-document analysis |

**Example:**

```typescript
// Section dimension: sentiment
// Executes 100 times (once per section)
context.sections = [{ content: "Review 1", metadata: {} }];

// Global dimension: categorize
// Executes 1 time (all sections at once)
context.sections = [
  { content: "Review 1", metadata: {} },
  { content: "Review 2", metadata: {} },
  // ... 98 more
];
```

---

## ⚡ Performance Tips

### 1. Optimize Skip Logic
```typescript
// ❌ Slow: Complex computation
shouldSkipDimension(context) {
  return expensiveCalculation(context.section.content);  // 100ms
}

// ✅ Fast: Simple checks
shouldSkipDimension(context) {
  return context.section.content.length < 50;  // < 1ms
}
```

### 2. Cache Aggressively
```typescript
shouldSkipDimension(context) {
  const key = this.hash(context.section.content + context.dimension);
  const cached = this.cache.get(key);
  
  if (cached) {
    return { skip: true, result: cached };  // Instant!
  }
  
  return false;
}
```

### 3. Use Cheaper Models
```typescript
selectProvider(dimension, section) {
  // Simple tasks → cheap model
  if (dimension === 'quick_filter') {
    return {
      provider: 'gemini',
      options: { model: 'gemini-1.5-flash' }  // $0.075/1M
    };
  }
  
  // Complex tasks → best model
  return {
    provider: 'anthropic',
    options: { model: 'claude-opus-4' }  // $15/1M
  };
}
```

### 4. Minimize Prompt Length
```typescript
createPrompt(context) {
  // ❌ Bad: Include everything
  return `Analyze this 10,000 word document...`;  // Expensive
  
  // ✅ Good: Extract relevant parts
  const summary = context.dependencies.summary.data.text;
  return `Analyze this summary: ${summary}`;  // Cheap
}
```

---

## 🛡️ Error Handling Patterns

### Pattern 1: Graceful Degradation
```typescript
handleDimensionFailure(context) {
  return {
    data: this.getDefaultValue(context.dimension),
    metadata: { fallback: true }
  };
}
```

### Pattern 2: Partial Success
```typescript
// If some sections fail, others succeed
result.sections[0].results.sentiment.data;   // ✓ Success
result.sections[1].results.sentiment.error;  // ❌ Failed
result.sections[2].results.sentiment.data;   // ✓ Success
```

### Pattern 3: Retry with Modification
```typescript
handleRetry(context) {
  if (context.attempt === 3) {
    // Last attempt → simplify request
    return {
      shouldRetry: true,
      modifiedRequest: {
        ...context.request,
        input: simplifyPrompt(context.request.input),
        options: { ...context.request.options, maxTokens: 1000 }
      }
    };
  }
  return {};
}
```

---

## 🔍 Debugging Dimension Execution

### Use Callbacks
```typescript
const result = await engine.process(sections, {
  onDimensionStart: (dim) => {
    console.time(dim);
    console.log(`⏱️ Starting: ${dim}`);
  },
  
  onDimensionComplete: (dim, result) => {
    console.timeEnd(dim);
    
    if (result.error) {
      console.error(`❌ ${dim}:`, result.error);
    } else {
      console.log(`✅ ${dim}:`, {
        tokens: result.metadata?.tokens?.totalTokens,
        model: result.metadata?.model
      });
    }
  }
});
```

### Inspect Context in Hooks
```typescript
createPrompt(context) {
  console.log('Dimension:', context.dimension);
  console.log('Is Global:', context.isGlobal);
  console.log('Sections:', context.sections.length);
  console.log('Dependencies:', Object.keys(context.dependencies));
  
  return 'Your prompt';
}
```

### Log Provider Chain
```typescript
beforeProviderExecute(context) {
  console.log(`Trying provider: ${context.provider}`);
  return context.request;
}

handleProviderFallback(context) {
  console.log(`Fallback: ${context.failedProvider} → ${context.fallbackProvider}`);
  return {};
}
```

---

## 📚 Related Guides

- [Workflow Lifecycle](/lifecycle/workflow) - Complete process flow
- [Hooks Reference](/guide/hooks) - All 19 hooks detailed
- [Provider System](/guide/providers) - Provider configuration
- [Error Handling](/guide/error-handling) - Recovery strategies
- [Cost Optimization](/guide/cost-optimization) - Save money

---

## ❓ FAQ

**Q: What's the typical duration of a dimension?**

Depends on provider:
- Anthropic Claude: 1-2 seconds
- OpenAI GPT: 1-3 seconds
- Google Gemini: 2-4 seconds
- Tavily Search: 0.5-1 second

**Q: Can a dimension timeout?**

Yes, configure timeouts:
```typescript
const engine = new DagEngine({
  timeout: 60000,  // Global: 60s
  dimensionTimeouts: {
    'slow_dimension': 120000  // This one: 120s
  }
});
```

**Q: How many retries per provider?**

Default: 3 attempts per provider
- Attempt 1: Immediate
- Attempt 2: Wait 1s
- Attempt 3: Wait 2s

Configurable:
```typescript
new DagEngine({
  maxRetries: 5,      // Try 5 times
  retryDelay: 2000    // Base delay: 2s
});
```

**Q: What if I want different providers for different sections?**

```typescript
selectProvider(dimension, section) {
  // Use metadata to decide
  if (section.metadata.language === 'chinese') {
    return { provider: 'openai', options: { model: 'gpt-4o' } };
  }
  
  return { provider: 'anthropic', options: {} };
}
```

**Q: Can I see the raw provider response?**

```typescript
afterProviderExecute(context) {
  console.log('Raw response:', context.result);
  return context.result;
}
```

**Q: How do I know which hook fired?**

All hooks receive `context` with:
- `processId` - Unique process identifier
- `timestamp` - When hook fired
- `dimension` - Current dimension
- Hook-specific data

**Q: Can dimensions execute in different orders each time?**

No. Dependencies are deterministic:
```typescript
defineDependencies() {
  return { B: ['A'], C: ['A'] };
}
// Always: A → (B, C in parallel)
// Never changes
```

---

## 🎯 Real-World Example

**Content Analysis with Error Handling:**

```typescript
class RobustContentAnalysis extends Plugin {
  dimensions = ['sentiment', 'entities', 'summary'];
  
  defineDependencies() {
    return {
      summary: ['sentiment', 'entities']
    };
  }
  
  shouldSkipDimension(context) {
    // Skip empty
    if (!context.section.content.trim()) {
      return true;
    }
    
    // Skip based on previous failure
    if (context.dependencies.sentiment?.error) {
      return true;  // Don't process if sentiment failed
    }
    
    return false;
  }
  
  createPrompt(context) {
    if (context.dimension === 'sentiment') {
      return `Analyze: "${context.section.content}"`;
    }
    
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment.data;
      const entities = context.dependencies.entities.data;
      
      return `Create ${sentiment.label} summary focusing on: ${entities.join(', ')}
      Text: "${context.section.content}"`;
    }
    
    return '';
  }
  
  selectProvider() {
    return {
      provider: 'anthropic',
      fallbacks: [
        { provider: 'openai', retryAfter: 1000 },
        { provider: 'gemini', retryAfter: 2000 }
      ]
    };
  }
  
  handleRetry(context) {
    // Rate limit → wait longer
    if (context.error.message.includes('rate_limit')) {
      return { shouldRetry: true, delayMs: 60000 };
    }
    return {};
  }
  
  handleDimensionFailure(context) {
    // Return defaults
    if (context.dimension === 'sentiment') {
      return {
        data: { sentiment: 'neutral', score: 0.5 },
        metadata: { fallback: true }
      };
    }
    
    return {
      error: 'Analysis failed',
      metadata: { providers: context.providers }
    };
  }
  
  afterDimensionExecute(context) {
    // Cache successful results
    if (!context.result.error) {
      this.cache.set(
        this.hash(context.sections[0].content),
        context.result
      );
    }
  }
}
```

**Execution for 1 section:**
```
1. sentiment
   ├─ shouldSkip → false ✓
   ├─ createPrompt → "Analyze: ..."
   ├─ selectProvider → anthropic
   ├─ Execute → Success ✓
   └─ afterDimensionExecute → Cache result

2. entities (parallel with sentiment in this case? No, it's sequential by default)
   ├─ shouldSkip → false ✓
   ├─ createPrompt → "Extract entities: ..."
   ├─ selectProvider → anthropic
   ├─ Execute → Fail (rate limit)
   ├─ handleRetry → Wait 1s
   ├─ Retry → Fail (rate limit)
   ├─ handleRetry → Wait 2s
   ├─ Retry → Fail (rate limit)
   ├─ handleProviderFallback → Try openai
   ├─ Execute → Success ✓
   └─ afterDimensionExecute → Cache result

3. summary
   ├─ shouldSkip → Check dependencies → false ✓
   ├─ createPrompt → Uses sentiment + entities
   ├─ selectProvider → anthropic
   ├─ Execute → Success ✓
   └─ afterDimensionExecute → Cache result

Total: ~8 seconds (with retries)
```
