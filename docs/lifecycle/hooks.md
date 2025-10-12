---
title: Hooks System
description: Complete guide to all 19 lifecycle hooks with examples and decision tree
---

# Hooks System

Complete control over your workflow with 19 lifecycle hooks.

---

## 🎯 Quick Overview

**Hooks** are optional methods you implement in your plugin to customize behavior at specific points in the execution lifecycle.

**Key Points:**
- ✅ All hooks are **optional** (except `createPrompt` and `selectProvider`)
- ✅ All hooks support **async** versions
- ✅ Hooks receive rich **context** objects
- ✅ Hooks can **modify data** or **control flow**

**Total Hooks:** 19 (2 required + 17 optional)

---

## 🗺️ Hook Decision Tree

**"I want to..." → Use this hook**

```
┌─────────────────────────────────────────────────────────┐
│                   WHAT DO YOU NEED?                      │
└─────────────────────────────────────────────────────────┘

💰 SAVE MONEY
├─ Skip short/irrelevant content
│  └─ shouldSkipDimension / shouldSkipGlobalDimension
├─ Return cached results
│  └─ shouldSkipDimension (return {skip: true, result})
└─ Choose cheaper models
└─ selectProvider

🛡️ HANDLE ERRORS
├─ Retry with different prompt
│  └─ handleRetry
├─ Switch to backup provider
│  └─ handleProviderFallback
├─ Provide default/fallback value
│  └─ handleDimensionFailure
└─ Recover from total failure
└─ handleProcessFailure

🔄 TRANSFORM DATA
├─ Modify dependencies before use
│  └─ transformDependencies
├─ Split/merge/filter sections
│  └─ transformSections
└─ Post-process all results
└─ finalizeResults

📊 MONITOR & DEBUG
├─ Log dimension start/end
│  └─ beforeDimensionExecute / afterDimensionExecute
├─ Track API calls
│  └─ beforeProviderExecute / afterProviderExecute
├─ Measure performance
│  └─ afterProcessComplete
└─ Custom metrics/alerts
└─ afterDimensionExecute

🎯 ADVANCED CONTROL
├─ Validate input
│  └─ beforeProcessStart
├─ Dynamic dependencies
│  └─ defineDependencies
├─ Modify API requests
│  └─ beforeProviderExecute
└─ Modify API responses
└─ afterProviderExecute
```

---

## 📋 Hook Categories

### **Required Hooks (2)** ✅
Must implement these:
- `createPrompt` - Build AI prompt
- `selectProvider` - Choose AI provider

### **Control Flow (3)** 🎛️
Skip execution conditionally:
- `defineDependencies` - Define dimension dependencies
- `shouldSkipDimension` - Skip section dimensions
- `shouldSkipGlobalDimension` - Skip global dimensions

### **Data Transformation (3)** 🔄
Modify data at key points:
- `transformDependencies` - Modify dependencies before use
- `transformSections` - Restructure sections (global only)
- `finalizeResults` - Post-process all results

### **Lifecycle (7)** 🔄
Called at specific stages:
- `beforeProcessStart` - Initialize workflow
- `afterProcessComplete` - Cleanup/output
- `handleProcessFailure` - Recover from failure
- `beforeDimensionExecute` - Pre-dimension setup
- `afterDimensionExecute` - Post-dimension cleanup
- `beforeProviderExecute` - Modify request
- `afterProviderExecute` - Modify response

### **Error Recovery (3)** 🛡️
Handle failures gracefully:
- `handleRetry` - Control retry behavior
- `handleProviderFallback` - Control provider switching
- `handleDimensionFailure` - Provide fallback result

---

## ⏱️ Hook Execution Timeline

**Visual timeline showing when each hook fires:**

```
┌─────────────────────────────────────────────────────────┐
│                 HOOK EXECUTION ORDER                     │
└─────────────────────────────────────────────────────────┘

process() called
│
├─ 1. beforeProcessStart ──────────┐
│                                   │ Process-level
├─ 2. defineDependencies ──────────┘
│
├─ [For each dimension group]
│  │
│  ├─ [For global dimensions]
│  │  │
│  │  ├─ 3. shouldSkipGlobalDimension
│  │  ├─ 4. transformDependencies
│  │  ├─ 5. beforeDimensionExecute
│  │  ├─ 6. createPrompt ✅ (required)
│  │  ├─ 7. selectProvider ✅ (required)
│  │  ├─ 8. beforeProviderExecute
│  │  │  │
│  │  │  ├─ [Provider attempts]
│  │  │  │  ├─ Attempt 1
│  │  │  │  ├─ 9. handleRetry (if error)
│  │  │  │  ├─ Attempt 2
│  │  │  │  ├─ 9. handleRetry (if error)
│  │  │  │  └─ Attempt 3
│  │  │  │
│  │  │  ├─ 10. handleProviderFallback (if all fail)
│  │  │  └─ [Try next provider...]
│  │  │
│  │  ├─ 11. afterProviderExecute
│  │  ├─ 12. afterDimensionExecute
│  │  ├─ 13. transformSections (global only)
│  │  └─ OR 14. handleDimensionFailure (if all failed)
│  │
│  └─ [For section dimensions]
│     │
│     └─ [For each section - parallel]
│        │
│        ├─ 3. shouldSkipDimension
│        ├─ 4. transformDependencies
│        ├─ 5. beforeDimensionExecute
│        ├─ 6. createPrompt ✅
│        ├─ 7. selectProvider ✅
│        ├─ 8. beforeProviderExecute
│        ├─ [Provider execution with retries...]
│        ├─ 11. afterProviderExecute
│        └─ 12. afterDimensionExecute
│
├─ 15. finalizeResults
├─ 16. afterProcessComplete
└─ OR 17. handleProcessFailure (if process failed)
```

---

## 📚 Complete Hook Reference

### **Required Hooks**

#### `createPrompt` ✅ REQUIRED

**Purpose:** Build the AI prompt for each dimension

**Signature:**
```typescript
createPrompt(context: PromptContext): string | Promise<string>
```

**Context:**
```typescript
interface PromptContext {
  processId: string;
  timestamp: number;
  dimension: string;
  sections: SectionData[];      // 1 for section, all for global
  dependencies: DimensionDependencies;
  isGlobal: boolean;
  globalResults: Record<string, DimensionResult>;
}
```

**Example:**
```typescript
createPrompt(context: PromptContext): string {
  if (context.dimension === 'sentiment') {
    return `Analyze sentiment of: "${context.sections[0].content}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  if (context.dimension === 'summary') {
    const sentiment = context.dependencies.sentiment?.data;
    return `Create a ${sentiment.sentiment} summary of: "${context.sections[0].content}"`;
  }
  
  if (context.dimension === 'categorize' && context.isGlobal) {
    const allText = context.sections.map((s, i) => `[${i}] ${s.content}`).join('\n\n');
    return `Categorize into tech/news/other: ${allText}`;
  }
  
  return '';
}
```

**Async Version:**
```typescript
async createPrompt(context: PromptContext): Promise<string> {
  // Fetch additional context from database
  const userContext = await db.getUserContext(context.sections[0].metadata.userId);
  
  return `Analyze with context: ${userContext}\nText: "${context.sections[0].content}"`;
}
```

**Tips:**
- Keep prompts concise to save tokens
- Use dependencies to enrich prompts
- Return empty string to skip (though use `shouldSkip` instead)
- Use `context.isGlobal` to handle global vs section

---

#### `selectProvider` ✅ REQUIRED

**Purpose:** Choose which AI provider to use (with optional fallbacks)

**Signature:**
```typescript
selectProvider(dimension: string, section?: SectionData): ProviderSelection | Promise<ProviderSelection>
```

**Return Type:**
```typescript
interface ProviderSelection {
  provider: string;
  options?: Record<string, any>;
  fallbacks?: Array<{
    provider: string;
    options?: Record<string, any>;
    retryAfter?: number;  // ms to wait before trying
  }>;
}
```

**Examples:**

**Basic:**
```typescript
selectProvider(dimension: string): ProviderSelection {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }
  };
}
```

**With Fallbacks:**
```typescript
selectProvider(dimension: string): ProviderSelection {
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
}
```

**Conditional Selection:**
```typescript
selectProvider(dimension: string, section?: SectionData): ProviderSelection {
  // Use cheap model for simple tasks
  if (dimension === 'quick_filter') {
    return {
      provider: 'gemini',
      options: { model: 'gemini-1.5-flash' }  // $0.075/1M
    };
  }
  
  // Use best model for complex tasks
  if (dimension === 'critical_analysis') {
    return {
      provider: 'anthropic',
      options: { model: 'claude-opus-4' }  // $15/1M
    };
  }
  
  // Content-based selection
  if (section && section.content.length > 10000) {
    return {
      provider: 'anthropic',
      options: { 
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 4096 
      }
    };
  }
  
  // Default
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }
  };
}
```

**Async Version:**
```typescript
async selectProvider(dimension: string): Promise<ProviderSelection> {
  // Check provider health
  const health = await this.checkProviderHealth();
  
  if (health.anthropic > 0.9) {
    return { provider: 'anthropic', options: {} };
  }
  
  return { provider: 'openai', options: {} };
}
```

**Tips:**
- Always provide fallbacks for production
- Use `retryAfter` to avoid immediate retry storms
- Choose models based on complexity/cost trade-off
- Use section metadata for routing decisions

---

### **Control Flow Hooks**

#### `defineDependencies`

**Purpose:** Define which dimensions depend on others

**Signature:**
```typescript
defineDependencies(context: ProcessContext): Record<string, string[]> | Promise<Record<string, string[]>>
```

**Context:**
```typescript
interface ProcessContext {
  processId: string;
  timestamp: number;
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: Record<string, any>;
}
```

**Example:**
```typescript
defineDependencies(context: ProcessContext): Record<string, string[]> {
  return {
    sentiment: [],                    // No dependencies
    topics: [],                       // No dependencies
    summary: ['sentiment', 'topics'], // Depends on both
    report: ['summary']               // Depends on summary
  };
}
```

**Dynamic Dependencies:**
```typescript
defineDependencies(context: ProcessContext): Record<string, string[]> {
  const deps: Record<string, string[]> = {
    sentiment: [],
    summary: ['sentiment']
  };
  
  // Add entity extraction only if needed
  const needsEntities = context.sections.some(
    s => s.metadata.extractEntities === true
  );
  
  if (needsEntities) {
    deps.entities = ['summary'];
    deps.report = ['summary', 'entities'];
  } else {
    deps.report = ['summary'];
  }
  
  return deps;
}
```

**Async Version:**
```typescript
async defineDependencies(context: ProcessContext): Promise<Record<string, string[]>> {
  // Fetch configuration from database
  const config = await db.getWorkflowConfig();
  
  return config.dependencies;
}
```

**Tips:**
- Keep dependency chains shallow for better parallelism
- Circular dependencies will throw an error
- Dependencies can be section or global dimensions
- Return `{}` or don't implement if no dependencies

---

#### `shouldSkipDimension`

**Purpose:** Skip section dimensions conditionally (with optional cached result)

**Signature:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean | SkipWithResult | Promise<boolean | SkipWithResult>
```

**Context:**
```typescript
interface SectionDimensionContext {
  processId: string;
  timestamp: number;
  dimension: string;
  section: SectionData;
  sectionIndex: number;
  sections: [SectionData];  // Array with 1 item
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  isGlobal: false;
}

interface SkipWithResult {
  skip: true;
  result: DimensionResult;
}
```

**Examples:**

**Simple Skip:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean {
  // Skip empty content
  if (!context.section.content.trim()) {
    return true;
  }
  
  // Skip short content
  if (context.section.content.length < 50) {
    return true;
  }
  
  // Skip based on metadata
  if (context.section.metadata.skipAnalysis === true) {
    return true;
  }
  
  return false;
}
```

**Skip with Dependency Check:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean {
  if (context.dimension === 'deep_analysis') {
    // Skip if quick check failed
    if (context.dependencies.quick_check?.error) {
      return true;
    }
    
    // Skip if quality too low
    const quality = context.dependencies.quick_check?.data?.quality;
    if (quality < 7) {
      return true;
    }
  }
  
  return false;
}
```

**Return Cached Result:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean | SkipWithResult {
  // Check cache
  const cacheKey = `${context.dimension}-${context.section.metadata.id}`;
  const cached = this.cache.get(cacheKey);
  
  if (cached) {
    return {
      skip: true,
      result: {
        data: cached,
        metadata: { cached: true, cachedAt: Date.now() }
      }
    };
  }
  
  return false;
}
```

**Async Cache Lookup:**
```typescript
async shouldSkipDimension(context: SectionDimensionContext): Promise<boolean | SkipWithResult> {
  // Check Redis cache
  const key = this.hash(context.section.content);
  const cached = await redis.get(key);
  
  if (cached) {
    return {
      skip: true,
      result: JSON.parse(cached)
    };
  }
  
  return false;
}
```

**Pattern Matching:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean {
  if (context.dimension === 'extract_code') {
    // Skip if no code blocks
    return !/```|function|class/.test(context.section.content);
  }
  
  if (context.dimension === 'extract_urls') {
    // Skip if no URLs
    return !/https?:\/\//.test(context.section.content);
  }
  
  return false;
}
```

**Tips:**
- Use for cost optimization (skip 70% of content = 70% cost savings)
- Return `{skip: true, result}` for instant cached results
- Keep logic simple and fast (< 1ms)
- Skipped dimensions show `{data: {skipped: true, reason: "..."}}` in results

---

#### `shouldSkipGlobalDimension`

**Purpose:** Skip global dimensions conditionally

**Signature:**
```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean | SkipWithResult | Promise<boolean | SkipWithResult>
```

**Context:**
```typescript
interface DimensionContext {
  processId: string;
  timestamp: number;
  dimension: string;
  sections: SectionData[];     // ALL sections
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  isGlobal: true;
}
```

**Examples:**

**Skip Based on Section Count:**
```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean {
  // Need at least 3 sections to categorize
  if (context.dimension === 'categorize') {
    return context.sections.length < 3;
  }
  
  return false;
}
```

**Skip if All Sections Empty:**
```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean {
  const allEmpty = context.sections.every(s => !s.content.trim());
  
  if (allEmpty) {
    return true;
  }
  
  return false;
}
```

**Skip Based on Metadata:**
```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean {
  // Skip if any section has flag
  const hasSkipFlag = context.sections.some(
    s => s.metadata.skipGlobal === true
  );
  
  return hasSkipFlag;
}
```

**Cached Global Result:**
```typescript
async shouldSkipGlobalDimension(context: DimensionContext): Promise<boolean | SkipWithResult> {
  // Hash all sections
  const key = this.hashSections(context.sections);
  const cached = await this.cache.get(key);
  
  if (cached) {
    return {
      skip: true,
      result: {
        data: cached,
        metadata: { cached: true }
      }
    };
  }
  
  return false;
}
```

**Tips:**
- Similar to `shouldSkipDimension` but for global scope
- Check aggregate conditions (total length, count, etc.)
- Can return cached result same way

---

### **Data Transformation Hooks**

#### `transformDependencies`

**Purpose:** Modify dependency data before it's used in prompt creation

**Signature:**
```typescript
transformDependencies(context: DimensionContext | SectionDimensionContext): DimensionDependencies | Promise<DimensionDependencies>
```

**Example:**

**Extract Specific Fields:**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  // Extract just the sentiment score
  if (deps.sentiment?.data) {
    deps.sentimentScore = {
      data: deps.sentiment.data.score
    };
  }
  
  // Extract just topic names
  if (deps.topics?.data) {
    deps.topicNames = {
      data: deps.topics.data.topics
    };
  }
  
  return deps;
}
```

**Combine Dependencies:**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  // Combine sentiment + topics into one object
  deps.analysis = {
    data: {
      sentiment: deps.sentiment?.data,
      topics: deps.topics?.data,
      combined: true
    }
  };
  
  return deps;
}
```

**Aggregate Section Results (for global dimensions):**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  if (!context.isGlobal) {
    return context.dependencies;
  }
  
  const deps = { ...context.dependencies };
  
  // Section dependency aggregation
  if (deps.sentiment?.data?.sections) {
    const scores = deps.sentiment.data.sections.map(s => s.data?.score || 0);
    
    deps.sentimentStats = {
      data: {
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
        min: Math.min(...scores),
        max: Math.max(...scores),
        count: scores.length
      }
    };
  }
  
  return deps;
}
```

**Async Enrichment:**
```typescript
async transformDependencies(context: DimensionContext): Promise<DimensionDependencies> {
  const deps = { ...context.dependencies };
  
  // Enrich with external data
  if (deps.entities?.data) {
    const enriched = await this.enrichEntities(deps.entities.data);
    deps.entitiesEnriched = { data: enriched };
  }
  
  return deps;
}
```

**Tips:**
- Called after dependencies resolved, before `createPrompt`
- Use to simplify access in prompts
- Can add computed fields
- Don't mutate original dependencies

---

#### `transformSections`

**Purpose:** Restructure sections after a global dimension executes

**Signature:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] | Promise<SectionData[]>
```

**Context:**
```typescript
interface TransformSectionsContext {
  processId: string;
  timestamp: number;
  dimension: string;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  isGlobal: true;
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, any>;
  result: DimensionResult;
  duration: number;
  tokensUsed?: TokenUsage;
  currentSections: SectionData[];
}
```

**Examples:**

**Split by Category:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'categorize') {
    return context.currentSections;
  }
  
  // AI returned: {"tech": [0, 2], "news": [1, 3], "other": [4]}
  const categories = context.result.data as Record<string, number[]>;
  const newSections: SectionData[] = [];
  
  for (const [category, indices] of Object.entries(categories)) {
    const items = indices.map(i => context.currentSections[i]);
    
    newSections.push({
      content: items.map(s => s.content).join('\n---\n'),
      metadata: {
        category,
        count: items.length,
        originalIndices: indices
      }
    });
  }
  
  return newSections;
}
```

**Merge Related Sections:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'find_duplicates') {
    return context.currentSections;
  }
  
  // AI returned groups of similar indices
  const groups = context.result.data.groups as number[][];
  
  return groups.map(group => ({
    content: group.map(i => context.currentSections[i].content).join('\n\n'),
    metadata: {
      merged: true,
      originalIndices: group,
      count: group.length
    }
  }));
}
```

**Filter Sections:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'relevance_check') {
    return context.currentSections;
  }
  
  // AI returned relevance scores
  const scores = context.result.data.scores as number[];
  
  // Keep only relevant sections (score > 0.7)
  return context.currentSections.filter((section, i) => scores[i] > 0.7);
}
```

**Reorder Sections:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'prioritize') {
    return context.currentSections;
  }
  
  // AI returned priority order
  const order = context.result.data.order as number[];
  
  return order.map(i => context.currentSections[i]);
}
```

**Tips:**
- **Only works for global dimensions**
- Called after dimension completes successfully
- Subsequent dimensions process the NEW sections
- Original sections preserved in `result.sections`
- Use for categorization, deduplication, filtering

---

#### `finalizeResults`

**Purpose:** Post-process all results before returning

**Signature:**
```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> | Promise<Record<string, DimensionResult>>
```

**Context:**
```typescript
interface FinalizeContext {
  processId: string;
  timestamp: number;
  results: Record<string, DimensionResult>;
  sections: SectionData[];
  globalResults: Record<string, DimensionResult>;
  transformedSections: SectionData[];
  duration: number;
}
```

**Examples:**

**Add Aggregations:**
```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  // Aggregate sentiment across all sections
  const sentimentResults = Object.entries(results)
    .filter(([key]) => key.startsWith('sentiment_section_'))
    .map(([, result]) => result.data);
  
  if (sentimentResults.length > 0) {
    const avgScore = sentimentResults.reduce((sum, s) => sum + s.score, 0) / sentimentResults.length;
    
    results.sentiment_aggregate = {
      data: {
        averageScore: avgScore,
        distribution: this.calculateDistribution(sentimentResults),
        totalSections: sentimentResults.length
      }
    };
  }
  
  return results;
}
```

**Cross-Reference Results:**
```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  // Find correlations
  const sentiment = context.results.sentiment?.data;
  const topics = context.results.topics?.data;
  
  if (sentiment && topics) {
    results.insights = {
      data: {
        sentiment: sentiment.sentiment,
        mainTopic: topics.topics[0],
        correlation: this.calculateCorrelation(sentiment, topics)
      }
    };
  }
  
  return results;
}
```

**Format Output:**
```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  // Add summary
  results._summary = {
    data: {
      totalDimensions: Object.keys(results).length,
      successfulDimensions: Object.values(results).filter(r => !r.error).length,
      failedDimensions: Object.values(results).filter(r => r.error).length,
      processingTime: context.duration
    }
  };
  
  return results;
}
```

**Tips:**
- Called after all dimensions complete
- Can add computed fields
- Don't remove existing results
- Good place for analytics/reporting

---

### **Lifecycle Hooks**

#### `beforeProcessStart`

**Purpose:** Initialize workflow, validate input, modify sections

**Signature:**
```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult | Promise<ProcessStartResult>
```

**Return Type:**
```typescript
interface ProcessStartResult {
  sections?: SectionData[];
  metadata?: Record<string, any>;
}
```

**Examples:**

**Validate Input:**
```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  // Validate
  if (context.sections.length === 0) {
    throw new Error('No sections provided');
  }
  
  if (context.sections.length > 1000) {
    throw new Error('Too many sections (max: 1000)');
  }
  
  return { sections: context.sections };
}
```

**Deduplicate Sections:**
```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  const seen = new Set<string>();
  const unique = context.sections.filter(s => {
    const key = s.content.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  console.log(`Deduplicated: ${context.sections.length} → ${unique.length}`);
  
  return {
    sections: unique,
    metadata: {
      originalCount: context.sections.length,
      uniqueCount: unique.length
    }
  };
}
```

**Add Metadata:**
```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  const enhanced = context.sections.map((section, i) => ({
    ...section,
    metadata: {
      ...section.metadata,
      index: i,
      processId: context.processId,
      timestamp: Date.now()
    }
  }));
  
  return { sections: enhanced };
}
```

**Async Enrichment:**
```typescript
async beforeProcessStart(context: ProcessContext): Promise<ProcessStartResult> {
  // Fetch user data
  const userIds = new Set(context.sections.map(s => s.metadata.userId).filter(Boolean));
  const users = await db.getUsers([...userIds]);
  
  const enhanced = context.sections.map(section => ({
    ...section,
    metadata: {
      ...section.metadata,
      user: users.find(u => u.id === section.metadata.userId)
    }
  }));
  
  return { sections: enhanced };
}
```

**Tips:**
- First hook to fire
- Good for validation, deduplication, enrichment
- Return modified sections to use throughout process
- Metadata available to all hooks

---

#### `afterProcessComplete`

**Purpose:** Cleanup, logging, modify final output

**Signature:**
```typescript
afterProcessComplete(context: ProcessResultContext): ProcessResult | Promise<ProcessResult>
```

**Context:**
```typescript
interface ProcessResultContext {
  processId: string;
  timestamp: number;
  sections: SectionData[];
  options: ProcessOptions;
  metadata?: Record<string, any>;
  result: ProcessResult;
  duration: number;
  totalDimensions: number;
  successfulDimensions: number;
  failedDimensions: number;
}
```

**Examples:**

**Log Metrics:**
```typescript
async afterProcessComplete(context: ProcessResultContext): Promise<ProcessResult> {
  await this.logger.info({
    processId: context.processId,
    duration: context.duration,
    totalDimensions: context.totalDimensions,
    successRate: context.successfulDimensions / context.totalDimensions,
    totalCost: context.result.costs?.totalCost,
    sectionsProcessed: context.sections.length
  });
  
  return context.result;
}
```

**Add Custom Metadata:**
```typescript
afterProcessComplete(context: ProcessResultContext): ProcessResult {
  return {
    ...context.result,
    metadata: {
      ...context.result.metadata,
      completedAt: Date.now(),
      version: '1.0.0',
      environment: process.env.NODE_ENV
    }
  };
}
```

**Send Notifications:**
```typescript
async afterProcessComplete(context: ProcessResultContext): Promise<ProcessResult> {
  // Send webhook
  await fetch('https://api.example.com/webhook', {
    method: 'POST',
    body: JSON.stringify({
      processId: context.processId,
      duration: context.duration,
      cost: context.result.costs?.totalCost
    })
  });
  
  return context.result;
}
```

**Tips:**
- Last hook to fire (on success)
- Can modify final result
- Good for logging, notifications, cleanup
- Don't throw errors here (use `handleProcessFailure` instead)

---

#### `handleProcessFailure`

**Purpose:** Recover from complete process failure

**Signature:**
```typescript
handleProcessFailure(context: ProcessFailureContext): ProcessResult | void | Promise<ProcessResult | void>
```

**Context:**
```typescript
interface ProcessFailureContext {
  processId: string;
  timestamp: number;
  sections: SectionData[];
  options: ProcessOptions;
  error: Error;
  partialResults: Partial<ProcessResult>;
  duration: number;
}
```

**Examples:**

**Return Partial Results:**
```typescript
handleProcessFailure(context: ProcessFailureContext): ProcessResult {
  console.error(`Process ${context.processId} failed:`, context.error.message);
  
  return {
    sections: context.partialResults.sections || [],
    globalResults: context.partialResults.globalResults || {},
    transformedSections: context.partialResults.transformedSections || context.sections,
    metadata: {
      failed: true,
      error: context.error.message,
      duration: context.duration
    }
  };
}
```

**Log and Re-throw:**
```typescript
async handleProcessFailure(context: ProcessFailureContext): Promise<void> {
  // Log to external service
  await this.errorTracker.logError({
    processId: context.processId,
    error: context.error,
    sections: context.sections.length,
    duration: context.duration
  });
  
  // Re-throw to let caller handle
  throw context.error;
}
```

**Tips:**
- Only fires if entire process fails
- Return `ProcessResult` to recover gracefully
- Return `void` or throw to propagate error
- Use for logging critical failures

---

#### `beforeDimensionExecute`

**Purpose:** Setup before dimension starts

**Signature:**
```typescript
beforeDimensionExecute(context: DimensionContext | SectionDimensionContext): void | Promise<void>
```

**Examples:**

**Logging:**
```typescript
beforeDimensionExecute(context: DimensionContext): void {
  console.log(`[${context.processId}] Starting: ${context.dimension}`);
  
  if (context.isGlobal) {
    console.log(`  Processing ${context.sections.length} sections globally`);
  }
}
```

**Start Timer:**
```typescript
beforeDimensionExecute(context: DimensionContext): void {
  this.timers.set(context.dimension, Date.now());
}
```

**State Management:**
```typescript
beforeDimensionExecute(context: DimensionContext): void {
  this.currentDimension = context.dimension;
  this.dimensionStartTime = Date.now();
}
```

**Tips:**
- Called before each dimension
- Good for logging, metrics, state management
- Don't return anything (void)
- Keep fast (< 1ms)

---

#### `afterDimensionExecute`

**Purpose:** Cleanup after dimension completes

**Signature:**
```typescript
afterDimensionExecute(context: DimensionResultContext): void | Promise<void>
```

**Context:**
```typescript
interface DimensionResultContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, any>;
  result: DimensionResult;
  duration: number;
  tokensUsed?: TokenUsage;
}
```

**Examples:**

**Record Metrics:**
```typescript
afterDimensionExecute(context: DimensionResultContext): void {
  this.metrics.record({
    dimension: context.dimension,
    duration: context.duration,
    provider: context.provider,
    tokens: context.tokensUsed?.totalTokens || 0,
    success: !context.result.error
  });
}
```

**Cache Result:**
```typescript
async afterDimensionExecute(context: DimensionResultContext): Promise<void> {
  if (!context.result.error && !context.isGlobal) {
    const key = this.hash(context.sections[0].content);
    await this.cache.set(key, context.result, 3600);
  }
}
```

**Send Alert:**
```typescript
async afterDimensionExecute(context: DimensionResultContext): Promise<void> {
  if (context.dimension === 'fraud_check' && context.result.data?.isFraud) {
    await this.sendAlert({
      type: 'fraud_detected',
      section: context.sections[0],
      result: context.result
    });
  }
}
```

**Tips:**
- Called after each dimension (success or error)
- Access full result and metadata
- Good for caching, metrics, alerts
- Don't return anything (void)

---

#### `beforeProviderExecute`

**Purpose:** Modify request before sending to provider

**Signature:**
```typescript
beforeProviderExecute(context: ProviderContext): ProviderRequest | Promise<ProviderRequest>
```

**Context:**
```typescript
interface ProviderContext {
  processId: string;
  timestamp: number;
  dimension: string;
  isGlobal: boolean;
  sections: SectionData[];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  request: ProviderRequest;
  provider: string;
  providerOptions: Record<string, any>;
}
```

**Examples:**

**Add System Message:**
```typescript
beforeProviderExecute(context: ProviderContext): ProviderRequest {
  const request = { ...context.request };
  
  if (context.provider === 'anthropic') {
    request.input = `System: You are a helpful AI assistant.

${request.input}`;
  }
  
  return request;
}
```

**Adjust Parameters:**
```typescript
beforeProviderExecute(context: ProviderContext): ProviderRequest {
  const request = { ...context.request };
  
  // Increase temperature for creative tasks
  if (context.dimension === 'creative_writing') {
    request.options = {
      ...request.options,
      temperature: 0.9
    };
  }
  
  // Force JSON mode for Gemini
  if (context.provider === 'gemini') {
    request.input += '\n\nReturn valid JSON only.';
    request.options = {
      ...request.options,
      temperature: 0
    };
  }
  
  return request;
}
```

**Add Metadata:**
```typescript
beforeProviderExecute(context: ProviderContext): ProviderRequest {
  return {
    ...context.request,
    metadata: {
      ...context.request.metadata,
      processId: context.processId,
      dimension: context.dimension,
      timestamp: Date.now()
    }
  };
}
```

**Tips:**
- Called right before API call
- Return modified request
- Good for provider-specific adjustments
- Don't mutate original request

---

#### `afterProviderExecute`

**Purpose:** Modify response after receiving from provider

**Signature:**
```typescript
afterProviderExecute(context: ProviderResultContext): ProviderResponse | Promise<ProviderResponse>
```

**Context:**
```typescript
interface ProviderResultContext extends ProviderContext {
  result: ProviderResponse;
  duration: number;
  tokensUsed?: TokenUsage;
}
```

**Examples:**

**Validate Response:**
```typescript
afterProviderExecute(context: ProviderResultContext): ProviderResponse {
  const response = { ...context.result };
  
  // Ensure required fields
  if (context.dimension === 'sentiment' && response.data) {
    if (!response.data.score) {
      response.data.score = 0.5;  // Default
    }
    if (!response.data.sentiment) {
      response.data.sentiment = 'neutral';
    }
  }
  
  return response;
}
```

**Add Metadata:**
```typescript
afterProviderExecute(context: ProviderResultContext): ProviderResponse {
  return {
    ...context.result,
    metadata: {
      ...context.result.metadata,
      dimension: context.dimension,
      duration: context.duration,
      processedAt: Date.now()
    }
  };
}
```

**Transform Data:**
```typescript
afterProviderExecute(context: ProviderResultContext): ProviderResponse {
  const response = { ...context.result };
  
  // Normalize data format
  if (response.data && typeof response.data === 'string') {
    try {
      response.data = JSON.parse(response.data);
    } catch (e) {
      // Keep as string
    }
  }
  
  return response;
}
```

**Tips:**
- Called after successful provider response
- Return modified response
- Good for validation, normalization
- Don't throw errors (use `handleDimensionFailure` for that)

---

### **Error Recovery Hooks**

#### `handleRetry`

**Purpose:** Control retry behavior when provider fails

**Signature:**
```typescript
handleRetry(context: RetryContext): RetryResponse | Promise<RetryResponse>
```

**Context:**
```typescript
interface RetryContext extends ProviderContext {
  error: Error;
  attempt: number;
  maxAttempts: number;
  previousAttempts: Array<{
    attempt: number;
    error: Error;
    provider: string;
    timestamp: number;
  }>;
}
```

**Return Type:**
```typescript
interface RetryResponse {
  shouldRetry?: boolean;
  delayMs?: number;
  modifiedRequest?: ProviderRequest;
  modifiedProvider?: string;
}
```

**Examples:**

**Custom Delay for Rate Limits:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  if (context.error.message.includes('rate_limit')) {
    return {
      shouldRetry: true,
      delayMs: 60000  // Wait 1 minute
    };
  }
  
  // Default exponential backoff
  return {};
}
```

**Truncate on Context Length Error:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  if (context.error.message.includes('context_length')) {
    const truncated = context.request.input.substring(0, 5000);
    
    return {
      shouldRetry: true,
      modifiedRequest: {
        ...context.request,
        input: truncated + '\n\n[Content truncated]'
      }
    };
  }
  
  return {};
}
```

**Stop Retrying on Auth Errors:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  const authErrors = ['invalid_api_key', 'unauthorized', 'forbidden'];
  
  if (authErrors.some(err => context.error.message.includes(err))) {
    return { shouldRetry: false };  // Don't retry
  }
  
  return {};
}
```

**Switch Provider on Retry:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  // On last attempt, try different provider
  if (context.attempt === context.maxAttempts) {
    return {
      shouldRetry: true,
      modifiedProvider: 'openai',  // Switch from anthropic
      delayMs: 2000
    };
  }
  
  return {};
}
```

**Tips:**
- Called after each failed attempt (before next retry)
- Return `{}` for default behavior
- Return `{shouldRetry: false}` to stop
- Can modify request or switch provider

---

#### `handleProviderFallback`

**Purpose:** Control switching to fallback provider

**Signature:**
```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse | Promise<FallbackResponse>
```

**Context:**
```typescript
interface FallbackContext extends RetryContext {
  failedProvider: string;
  fallbackProvider: string;
  fallbackOptions: Record<string, any>;
}
```

**Return Type:**
```typescript
interface FallbackResponse {
  shouldFallback?: boolean;
  delayMs?: number;
  modifiedRequest?: ProviderRequest;
}
```

**Examples:**

**Log Fallback:**
```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse {
  console.log(`Fallback: ${context.failedProvider} → ${context.fallbackProvider}`);
  
  return { shouldFallback: true };
}
```

**Modify Request for Different Provider:**
```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse {
  // Gemini needs more explicit instructions
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
  
  return {};
}
```

**Skip Fallback After Too Many Attempts:**
```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse {
  if (context.previousAttempts.length > 10) {
    console.error('Too many attempts, giving up');
    return { shouldFallback: false };
  }
  
  return {};
}
```

**Tips:**
- Called after all retries exhausted for a provider
- Return `{}` for default behavior
- Return `{shouldFallback: false}` to stop
- Can modify request for new provider

---

#### `handleDimensionFailure`

**Purpose:** Provide fallback result when all providers fail

**Signature:**
```typescript
handleDimensionFailure(context: FailureContext): DimensionResult | void | Promise<DimensionResult | void>
```

**Context:**
```typescript
interface FailureContext extends RetryContext {
  totalAttempts: number;
  providers: string[];
}
```

**Examples:**

**Return Safe Default:**
```typescript
handleDimensionFailure(context: FailureContext): DimensionResult {
  console.error(`All providers failed for ${context.dimension}`);
  
  if (context.dimension === 'sentiment') {
    return {
      data: {
        sentiment: 'neutral',
        score: 0.5,
        confidence: 0
      },
      metadata: {
        fallback: true,
        reason: 'All providers failed',
        totalAttempts: context.totalAttempts
      }
    };
  }
  
  if (context.dimension === 'summary') {
    return {
      data: {
        text: context.sections[0].content.substring(0, 200) + '...',
        truncated: true
      },
      metadata: { fallback: true }
    };
  }
  
  // Default: return error
  return {
    error: `Failed after ${context.totalAttempts} attempts`,
    metadata: { providers: context.providers }
  };
}
```

**Let Critical Dimensions Fail:**
```typescript
handleDimensionFailure(context: FailureContext): DimensionResult | void {
  // Return defaults for non-critical
  if (context.dimension === 'sentiment') {
    return {
      data: { sentiment: 'neutral', score: 0.5 },
      metadata: { fallback: true }
    };
  }
  
  // Let critical dimensions fail (throw)
  if (context.dimension === 'fraud_check') {
    throw new Error('Fraud check failed - cannot proceed');
  }
  
  // Default error
  return {
    error: 'Analysis failed',
    metadata: { providers: context.providers }
  };
}
```

**Tips:**
- Called after all providers and retries exhausted
- Return `DimensionResult` to use as fallback
- Return `void` or throw to propagate error
- Good for graceful degradation

---

## 🎯 Common Patterns

### Pattern 1: Cost Optimization

```typescript
class CostOptimizedPlugin extends Plugin {
  private cache = new Map();

  // Skip short content
  shouldSkipDimension(context) {
    if (context.section.content.length < 50) {
      return true;
    }
    return false;
  }

  // Use cached results
  async shouldSkipDimension(context) {
    const key = this.hash(context.section.content);
    const cached = await this.cache.get(key);
    
    if (cached) {
      return { skip: true, result: cached };
    }
    
    return false;
  }

  // Cache successful results
  async afterDimensionExecute(context) {
    if (!context.result.error) {
      const key = this.hash(context.sections[0].content);
      await this.cache.set(key, context.result);
    }
  }

  // Use cheaper models
  selectProvider(dimension) {
    if (dimension === 'quick_filter') {
      return {
        provider: 'gemini',
        options: { model: 'gemini-1.5-flash' }
      };
    }
    
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' }
    };
  }
}
```

### Pattern 2: Robust Error Handling

```typescript
class RobustPlugin extends Plugin {
  // Multiple fallbacks
  selectProvider() {
    return {
      provider: 'anthropic',
      fallbacks: [
        { provider: 'openai', retryAfter: 1000 },
        { provider: 'gemini', retryAfter: 2000 }
      ]
    };
  }

  // Smart retry
  handleRetry(context) {
    if (context.error.message.includes('rate_limit')) {
      return { shouldRetry: true, delayMs: 60000 };
    }
    
    if (context.error.message.includes('context_length')) {
      return {
        shouldRetry: true,
        modifiedRequest: {
          ...context.request,
          input: context.request.input.substring(0, 5000)
        }
      };
    }
    
    return {};
  }

  // Graceful degradation
  handleDimensionFailure(context) {
    return {
      data: this.getDefaultValue(context.dimension),
      metadata: { fallback: true }
    };
  }
}
```

### Pattern 3: Comprehensive Monitoring

```typescript
class MonitoredPlugin extends Plugin {
  beforeProcessStart(context) {
    console.log(`Starting process: ${context.processId}`);
    return { sections: context.sections };
  }

  beforeDimensionExecute(context) {
    console.time(context.dimension);
  }

  afterDimensionExecute(context) {
    console.timeEnd(context.dimension);
    
    this.metrics.record({
      dimension: context.dimension,
      duration: context.duration,
      tokens: context.tokensUsed?.totalTokens || 0,
      success: !context.result.error
    });
  }

  afterProcessComplete(context) {
    console.log(`Completed in ${context.duration}ms`);
    console.log(`Cost: $${context.result.costs?.totalCost}`);
    
    return context.result;
  }
}
```

---

## 📚 Related Guides

- [Workflow Lifecycle](/lifecycle/workflow) - Overall process flow
- [Dimension Lifecycle](/lifecycle/dimension) - Dimension execution
- [Error Handling](/guide/error-handling) - Recovery strategies
- [Cost Optimization](/guide/cost-optimization) - Save money
- [Production Best Practices](/guide/production) - Enterprise patterns

---

## ❓ FAQ

**Q: Which hooks are required?**

Only 2:
- `createPrompt`
- `selectProvider`

All others are optional.

**Q: Can hooks be async?**

Yes! All hooks support async:
```typescript
async shouldSkipDimension(context): Promise<boolean> {
  const cached = await redis.get(key);
  return !!cached;
}
```

**Q: What if my hook throws an error?**

Non-critical hooks (like logging) log warnings and continue.
Critical hooks (like `createPrompt`) throw and fail the dimension.

**Q: Can I access state across hooks?**

Yes, use class properties:
```typescript
class MyPlugin extends Plugin {
  private state = new Map();

  beforeDimensionExecute(context) {
    this.state.set(context.dimension, Date.now());
  }

  afterDimensionExecute(context) {
    const startTime = this.state.get(context.dimension);
    console.log(`Duration: ${Date.now() - startTime}ms`);
  }
}
```

**Q: How do I debug hook execution?**

Add logging:
```typescript
createPrompt(context) {
  console.log('createPrompt called:', {
    dimension: context.dimension,
    sectionCount: context.sections.length,
    hasDependencies: Object.keys(context.dependencies).length > 0
  });
  return 'Your prompt';
}
```

**Q: Can I skip a hook conditionally?**

Yes, return early:
```typescript
beforeDimensionExecute(context) {
  if (context.dimension !== 'important_one') {
    return;  // Do nothing
  }
  
  // Only log for important dimension
  console.log('Important dimension starting');
}
```

**Q: What's the order of error hooks?**

1. `handleRetry` (each failed attempt)
2. `handleProviderFallback` (switching providers)
3. `handleDimensionFailure` (all providers failed)
4. `handleProcessFailure` (entire process failed)

---

## 🎯 Quick Reference

| Hook | When | Purpose |
|------|------|---------|
| `createPrompt` ✅ | Before provider call | Build AI prompt |
| `selectProvider` ✅ | Before provider call | Choose provider |
| `defineDependencies` | Process start | Define DAG |
| `shouldSkipDimension` | Before section dim | Skip with cache |
| `shouldSkipGlobalDimension` | Before global dim | Skip with cache |
| `transformDependencies` | After deps resolved | Modify deps |
| `transformSections` | After global dim | Restructure sections |
| `finalizeResults` | After all dims | Post-process |
| `beforeProcessStart` | Process start | Initialize |
| `afterProcessComplete` | Process end | Cleanup |
| `handleProcessFailure` | Process failed | Recover |
| `beforeDimensionExecute` | Before dim | Setup |
| `afterDimensionExecute` | After dim | Cleanup |
| `beforeProviderExecute` | Before API call | Modify request |
| `afterProviderExecute` | After API call | Modify response |
| `handleRetry` | Failed attempt | Control retry |
| `handleProviderFallback` | Switch provider | Control fallback |
| `handleDimensionFailure` | All failed | Provide default |

