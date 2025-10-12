---
title: Plugin API
description: Complete API reference for Plugin base class
---

# Plugin API Reference

The abstract base class for defining custom workflows.

---

## 📋 Overview

**Plugin** is the base class you extend to define your workflow logic.

**Key Responsibilities:**
- ✅ Define dimensions (analysis tasks)
- ✅ Create prompts for each dimension
- ✅ Select AI providers
- ✅ Control execution flow via hooks
- ✅ Transform data at key points

**Import:**
```typescript
import { Plugin } from '@ivan629/dag-ai';
```

---

## 🔧 Constructor

### `constructor(id: string, name: string, description: string, config?: PluginConfig)`

Create a new plugin instance.

**Signature:**
```typescript
constructor(
  id: string,
  name: string,
  description: string,
  config?: PluginConfig
)
```

**Parameters:**

**`id`** ✅ Required
- Type: `string`
- Description: Unique identifier for this plugin
- Format: lowercase, hyphenated (e.g., `'my-plugin'`, `'content-analyzer'`)

**`name`** ✅ Required
- Type: `string`
- Description: Human-readable name
- Format: Title case (e.g., `'My Plugin'`, `'Content Analyzer'`)

**`description`** ✅ Required
- Type: `string`
- Description: Brief description of what the plugin does
- Format: One sentence summary

**`config`** (Optional)
- Type: `PluginConfig` (custom object)
- Description: Any custom configuration for your plugin

**Example:**
```typescript
import { Plugin } from '@ivan629/dag-ai';

class SentimentPlugin extends Plugin {
  constructor() {
    super(
      'sentiment-analyzer',           // id
      'Sentiment Analyzer',            // name
      'Analyzes text sentiment'        // description
    );
    
    this.dimensions = ['sentiment'];
  }
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

**With Custom Config:**
```typescript
interface MyPluginConfig extends PluginConfig {
  threshold: number;
  enableCache: boolean;
  customOption: string;
}

class MyPlugin extends Plugin {
  constructor(config?: MyPluginConfig) {
    super('my-plugin', 'My Plugin', 'Description', config);
    
    // Access config
    this.threshold = config?.threshold || 0.5;
    this.enableCache = config?.enableCache || true;
    
    this.dimensions = ['dimension1'];
  }
  
  // ... methods
}

// Usage
const plugin = new MyPlugin({
  threshold: 0.7,
  enableCache: true,
  customOption: 'value'
});
```

---

## 📊 Properties

### `id` (readonly)

**Type:** `string`

**Description:** Unique plugin identifier

**Example:**
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('my-plugin', 'My Plugin', 'Description');
  }
}

const plugin = new MyPlugin();
console.log(plugin.id);  // 'my-plugin'
```

---

### `name`

**Type:** `string` (mutable)

**Description:** Plugin display name

**Example:**
```typescript
const plugin = new MyPlugin();
console.log(plugin.name);  // 'My Plugin'

plugin.name = 'Updated Name';  // Can be changed
```

---

### `description` (readonly)

**Type:** `string`

**Description:** Plugin description

**Example:**
```typescript
console.log(plugin.description);  // 'Description'
```

---

### `dimensions` ✅ REQUIRED

**Type:** `Dimension[]`

**Description:** Array of dimension definitions

**Must be set in constructor**

**Formats:**

**Simple (string array):**
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('id', 'Name', 'Description');
    
    this.dimensions = [
      'sentiment',
      'topics',
      'summary'
    ];
  }
}
```

**Detailed (object array):**
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('id', 'Name', 'Description');
    
    this.dimensions = [
      // Section dimension (default)
      { name: 'sentiment', scope: 'section' },
      
      // Global dimension
      { name: 'categorize', scope: 'global' },
      
      // Global with transformation
      {
        name: 'split',
        scope: 'global',
        transform: (result, sections) => {
          // Transform sections based on result
          return transformedSections;
        }
      }
    ];
  }
}
```

**Mixed:**
```typescript
this.dimensions = [
  'sentiment',                           // Section (string shorthand)
  { name: 'categorize', scope: 'global' }, // Global (object)
  'topics'                               // Section (string shorthand)
];
```

**Type Definition:**
```typescript
type Dimension = string | DimensionConfig;

interface DimensionConfig {
  name: string;
  scope: 'section' | 'global';
  transform?: (
    result: DimensionResult,
    sections: SectionData[]
  ) => SectionData[] | Promise<SectionData[]>;
}
```

---

### `config` (protected)

**Type:** `PluginConfig`

**Description:** Custom configuration object

**Example:**
```typescript
class MyPlugin extends Plugin {
  private threshold: number;
  
  constructor(config?: MyPluginConfig) {
    super('id', 'Name', 'Description', config);
    
    // Access via this.config
    this.threshold = this.config?.threshold || 0.5;
  }
  
  shouldSkipDimension(context) {
    return context.section.content.length < this.threshold;
  }
}
```

---

## 📚 Required Methods

### `createPrompt()` ✅ REQUIRED

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
  sections: SectionData[];
  dependencies: DimensionDependencies;
  isGlobal: boolean;
  globalResults: Record<string, DimensionResult>;
}
```

**Examples:**

**Basic:**
```typescript
createPrompt(context: PromptContext): string {
  return `Analyze ${context.dimension}: "${context.sections[0].content}"`;
}
```

**With Dependencies:**
```typescript
createPrompt(context: PromptContext): string {
  if (context.dimension === 'sentiment') {
    return `Analyze sentiment: "${context.sections[0].content}"
    Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  if (context.dimension === 'summary') {
    const sentiment = context.dependencies.sentiment?.data;
    
    return `Create a ${sentiment.sentiment} summary of: "${context.sections[0].content}"
    Focus on ${sentiment.score > 0.7 ? 'positive aspects' : 'areas for improvement'}`;
  }
  
  return '';
}
```

**Global Dimension:**
```typescript
createPrompt(context: PromptContext): string {
  if (context.dimension === 'categorize' && context.isGlobal) {
    // All sections available
    const allContent = context.sections.map((s, i) => 
      `[${i}] ${s.content}`
    ).join('\n\n');
    
    return `Categorize these ${context.sections.length} documents into groups:
    Return JSON: {"group1": [indices], "group2": [indices], ...}
    
    Documents:
    ${allContent}`;
  }
  
  return '';
}
```

**Async Version:**
```typescript
async createPrompt(context: PromptContext): Promise<string> {
  // Fetch additional context from database
  const userId = context.sections[0].metadata.userId;
  const userProfile = await db.getUserProfile(userId);
  
  return `Analyze for user: ${userProfile.name}
  Preferences: ${userProfile.preferences.join(', ')}
  Text: "${context.sections[0].content}"`;
}
```

**Tips:**
- Keep prompts concise to save tokens
- Use dependencies to enrich context
- Use `context.isGlobal` to differentiate scope
- Return empty string to skip (though use `shouldSkip` hooks instead)

**Must Return:** Valid prompt string (non-empty for execution)

---

### `selectProvider()` ✅ REQUIRED

**Purpose:** Choose which AI provider to use for each dimension

**Signature:**
```typescript
selectProvider(
  dimension: string,
  section?: SectionData
): ProviderSelection | Promise<ProviderSelection>
```

**Return Type:**
```typescript
interface ProviderSelection {
  provider: string;
  options?: Record<string, any>;
  fallbacks?: Array<{
    provider: string;
    options?: Record<string, any>;
    retryAfter?: number;  // ms
  }>;
}
```

**Examples:**

**Basic:**
```typescript
selectProvider(dimension: string): ProviderSelection {
  return {
    provider: 'anthropic',
    options: {
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.1
    }
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

**Dimension-Based:**
```typescript
selectProvider(dimension: string): ProviderSelection {
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
  
  // Default
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }
  };
}
```

**Content-Based:**
```typescript
selectProvider(dimension: string, section?: SectionData): ProviderSelection {
  // Use cheaper model for short content
  if (section && section.content.length < 1000) {
    return {
      provider: 'gemini',
      options: { model: 'gemini-1.5-flash' }
    };
  }
  
  // Use best model for long/complex content
  if (section && section.content.length > 10000) {
    return {
      provider: 'anthropic',
      options: { 
        model: 'claude-opus-4',
        maxTokens: 8192
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

**Metadata-Based:**
```typescript
selectProvider(dimension: string, section?: SectionData): ProviderSelection {
  // Route based on metadata
  if (section?.metadata.language === 'chinese') {
    return {
      provider: 'openai',  // Better for Chinese
      options: { model: 'gpt-4o' }
    };
  }
  
  if (section?.metadata.priority === 'high') {
    return {
      provider: 'anthropic',
      options: { model: 'claude-opus-4' }  // Best quality
    };
  }
  
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
  
  if (health.openai > 0.9) {
    return { provider: 'openai', options: {} };
  }
  
  // Fallback to most reliable
  return { provider: 'gemini', options: {} };
}
```

**Provider Options:**

**Anthropic:**
```typescript
options: {
  model: 'claude-sonnet-4-5-20250929' | 'claude-opus-4' | 'claude-4',
  maxTokens: number,     // Default: 4096
  temperature: number    // 0.0 - 1.0
}
```

**OpenAI:**
```typescript
options: {
  model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo',
  maxTokens: number,     // Default: 4096
  temperature: number    // Default: 0.1
}
```

**Gemini:**
```typescript
options: {
  model: 'gemini-1.5-pro' | 'gemini-1.5-flash',
  maxTokens: number,     // Default: 4096
  temperature: number,   // Default: 0.1
  topP: number,
  topK: number
}
```

**Tips:**
- Always provide fallbacks for production
- Use `retryAfter` to avoid retry storms
- Choose models based on task complexity
- Consider cost vs quality trade-offs

**Must Return:** Valid provider configuration

---

## 🎛️ Optional Methods (Control Flow)

### `defineDependencies()`

**Purpose:** Define which dimensions depend on others

**Signature:**
```typescript
defineDependencies(
  context: ProcessContext
): Record<string, string[]> | Promise<Record<string, string[]>>
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

**Default:** `{}` (no dependencies)

**Examples:**

**Simple:**
```typescript
defineDependencies(): Record<string, string[]> {
  return {
    sentiment: [],                    // No dependencies
    topics: [],                       // No dependencies
    summary: ['sentiment', 'topics'], // Depends on both
    report: ['summary']               // Depends on summary
  };
}
```

**Dynamic:**
```typescript
defineDependencies(context: ProcessContext): Record<string, string[]> {
  const deps: Record<string, string[]> = {
    sentiment: [],
    summary: ['sentiment']
  };
  
  // Add entity extraction conditionally
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

**Async:**
```typescript
async defineDependencies(context: ProcessContext): Promise<Record<string, string[]>> {
  // Fetch configuration
  const config = await db.getWorkflowConfig(context.options.userId);
  
  return config.dependencies;
}
```

**Result:**
```typescript
// Execution groups:
defineDependencies() {
  return {
    B: ['A'],
    C: ['A'],
    D: ['B', 'C']
  };
}

// Execution:
// Group 0: A
// Group 1: B, C (parallel)
// Group 2: D
```

**See:** [Dependencies Guide](/guide/dependencies)

---

### `shouldSkipDimension()`

**Purpose:** Skip section dimensions conditionally

**Signature:**
```typescript
shouldSkipDimension(
  context: SectionDimensionContext
): boolean | SkipWithResult | Promise<boolean | SkipWithResult>
```

**Context:**
```typescript
interface SectionDimensionContext {
  processId: string;
  timestamp: number;
  dimension: string;
  section: SectionData;
  sectionIndex: number;
  sections: [SectionData];
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  isGlobal: false;
}

interface SkipWithResult {
  skip: true;
  result: DimensionResult;
}
```

**Default:** `false` (never skip)

**Return:**
- `true` → Skip execution
- `false` → Execute normally
- `{skip: true, result}` → Skip with cached result

**Examples:**

**Skip Short Content:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean {
  return context.section.content.length < 50;
}
```

**Skip Based on Metadata:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean {
  if (context.section.metadata.skipAnalysis === true) {
    return true;
  }
  
  if (context.section.metadata.language !== 'english') {
    return true;
  }
  
  return false;
}
```

**Skip Based on Dependencies:**
```typescript
shouldSkipDimension(context: SectionDimensionContext): boolean {
  if (context.dimension === 'deep_analysis') {
    // Skip if previous check failed
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
        metadata: { cached: true }
      }
    };
  }
  
  return false;
}
```

**Async Cache:**
```typescript
async shouldSkipDimension(
  context: SectionDimensionContext
): Promise<boolean | SkipWithResult> {
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

**See:** [Cost Optimization Guide](/guide/cost-optimization)

---

### `shouldSkipGlobalDimension()`

**Purpose:** Skip global dimensions conditionally

**Signature:**
```typescript
shouldSkipGlobalDimension(
  context: DimensionContext
): boolean | SkipWithResult | Promise<boolean | SkipWithResult>
```

**Context:**
```typescript
interface DimensionContext {
  processId: string;
  timestamp: number;
  dimension: string;
  sections: SectionData[];  // ALL sections
  dependencies: DimensionDependencies;
  globalResults: Record<string, DimensionResult>;
  isGlobal: true;
}
```

**Default:** `false` (never skip)

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

**Skip if All Empty:**
```typescript
shouldSkipGlobalDimension(context: DimensionContext): boolean {
  const allEmpty = context.sections.every(s => !s.content.trim());
  return allEmpty;
}
```

**Cached Global Result:**
```typescript
async shouldSkipGlobalDimension(
  context: DimensionContext
): Promise<boolean | SkipWithResult> {
  const key = this.hashSections(context.sections);
  const cached = await this.cache.get(key);
  
  if (cached) {
    return {
      skip: true,
      result: { data: cached, metadata: { cached: true } }
    };
  }
  
  return false;
}
```

---

## 🔄 Optional Methods (Data Transformation)

### `transformDependencies()`

**Purpose:** Modify dependencies before they're used

**Signature:**
```typescript
transformDependencies(
  context: DimensionContext | SectionDimensionContext
): DimensionDependencies | Promise<DimensionDependencies>
```

**Default:** Returns dependencies unchanged

**Examples:**

**Extract Fields:**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  // Extract just the score
  if (deps.sentiment?.data) {
    deps.sentimentScore = {
      data: deps.sentiment.data.score
    };
  }
  
  return deps;
}
```

**Combine Dependencies:**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  const deps = { ...context.dependencies };
  
  // Combine multiple dependencies
  deps.analysis = {
    data: {
      sentiment: deps.sentiment?.data,
      topics: deps.topics?.data,
      entities: deps.entities?.data
    }
  };
  
  return deps;
}
```

**Aggregate for Global:**
```typescript
transformDependencies(context: DimensionContext): DimensionDependencies {
  if (!context.isGlobal) {
    return context.dependencies;
  }
  
  const deps = { ...context.dependencies };
  
  // Aggregate section results
  if (deps.sentiment?.data?.sections) {
    const scores = deps.sentiment.data.sections.map(s => s.data?.score || 0);
    
    deps.sentimentStats = {
      data: {
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
        min: Math.min(...scores),
        max: Math.max(...scores)
      }
    };
  }
  
  return deps;
}
```

**See:** [Hooks Guide](/guide/hooks#transformdependencies)

---

### `transformSections()`

**Purpose:** Restructure sections after a global dimension executes

**Signature:**
```typescript
transformSections(
  context: TransformSectionsContext
): SectionData[] | Promise<SectionData[]>
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

**Default:** Returns sections unchanged

**Only for Global Dimensions**

**Examples:**

**Split by Category:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'categorize') {
    return context.currentSections;
  }
  
  // AI returned: {"tech": [0, 2], "news": [1, 3]}
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

**Merge Similar:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'find_duplicates') {
    return context.currentSections;
  }
  
  // AI returned groups of similar sections
  const groups = context.result.data.groups as number[][];
  
  return groups.map(group => ({
    content: group.map(i => context.currentSections[i].content).join('\n\n'),
    metadata: {
      merged: true,
      count: group.length,
      originalIndices: group
    }
  }));
}
```

**Filter:**
```typescript
transformSections(context: TransformSectionsContext): SectionData[] {
  if (context.dimension !== 'relevance_check') {
    return context.currentSections;
  }
  
  // AI returned relevance scores
  const scores = context.result.data.scores as number[];
  
  // Keep only relevant (score > 0.7)
  return context.currentSections.filter((section, i) => scores[i] > 0.7);
}
```

**Reorder:**
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

**See:** [Section Transformations Guide](/advanced/section-transforms)

---

### `finalizeResults()`

**Purpose:** Post-process all results before returning

**Signature:**
```typescript
finalizeResults(
  context: FinalizeContext
): Record<string, DimensionResult> | Promise<Record<string, DimensionResult>>
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

**Default:** Returns results unchanged

**Examples:**

**Add Aggregations:**
```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  // Aggregate sentiment
  const sentimentResults = Object.entries(results)
    .filter(([key]) => key.startsWith('sentiment_section_'))
    .map(([, result]) => result.data);
  
  if (sentimentResults.length > 0) {
    const avgScore = sentimentResults.reduce((sum, s) => sum + s.score, 0) / sentimentResults.length;
    
    results.sentiment_aggregate = {
      data: {
        averageScore: avgScore,
        totalSections: sentimentResults.length,
        distribution: this.calculateDistribution(sentimentResults)
      }
    };
  }
  
  return results;
}
```

**Add Summary:**
```typescript
finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
  const results = { ...context.results };
  
  // Add processing summary
  results._summary = {
    data: {
      totalDimensions: Object.keys(results).length,
      successCount: Object.values(results).filter(r => !r.error).length,
      errorCount: Object.values(results).filter(r => r.error).length,
      processingTime: context.duration,
      sectionsProcessed: context.sections.length
    }
  };
  
  return results;
}
```

---

## 🔄 Optional Methods (Lifecycle)

### `beforeProcessStart()`

**Purpose:** Initialize workflow, validate input

**Signature:**
```typescript
beforeProcessStart(
  context: ProcessContext
): ProcessStartResult | Promise<ProcessStartResult>
```

**Return Type:**
```typescript
interface ProcessStartResult {
  sections?: SectionData[];
  metadata?: Record<string, any>;
}
```

**Default:** Returns context unchanged

**Examples:**

**Validate:**
```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  if (context.sections.length === 0) {
    throw new Error('No sections provided');
  }
  
  if (context.sections.length > 1000) {
    throw new Error('Too many sections (max: 1000)');
  }
  
  return { sections: context.sections };
}
```

**Deduplicate:**
```typescript
beforeProcessStart(context: ProcessContext): ProcessStartResult {
  const seen = new Set<string>();
  const unique = context.sections.filter(s => {
    const key = s.content.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
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

**See:** [Hooks Guide](/guide/hooks#beforeprocessstart)

---

### `afterProcessComplete()`

**Purpose:** Cleanup, logging, modify output

**Signature:**
```typescript
afterProcessComplete(
  context: ProcessResultContext
): ProcessResult | Promise<ProcessResult>
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

**Default:** Returns result unchanged

**Examples:**

**Log Metrics:**
```typescript
async afterProcessComplete(
  context: ProcessResultContext
): Promise<ProcessResult> {
  await this.logger.info({
    processId: context.processId,
    duration: context.duration,
    successRate: context.successfulDimensions / context.totalDimensions,
    totalCost: context.result.costs?.totalCost
  });
  
  return context.result;
}
```

**Add Metadata:**
```typescript
afterProcessComplete(context: ProcessResultContext): ProcessResult {
  return {
    ...context.result,
    metadata: {
      ...context.result.metadata,
      completedAt: Date.now(),
      version: '1.0.0'
    }
  };
}
```

**See:** [Hooks Guide](/guide/hooks#afterprocesscomplete)

---

### `handleProcessFailure()`

**Purpose:** Recover from complete process failure

**Signature:**
```typescript
handleProcessFailure(
  context: ProcessFailureContext
): ProcessResult | void | Promise<ProcessResult | void>
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

**Default:** Re-throws error

**Examples:**

**Return Partial Results:**
```typescript
handleProcessFailure(context: ProcessFailureContext): ProcessResult {
  console.error(`Process failed:`, context.error.message);
  
  return {
    sections: context.partialResults.sections || [],
    globalResults: context.partialResults.globalResults || {},
    transformedSections: context.partialResults.transformedSections || context.sections,
    metadata: {
      failed: true,
      error: context.error.message
    }
  };
}
```

**Log and Re-throw:**
```typescript
async handleProcessFailure(context: ProcessFailureContext): Promise<void> {
  await this.errorTracker.log({
    processId: context.processId,
    error: context.error,
    duration: context.duration
  });
  
  throw context.error;
}
```

**See:** [Hooks Guide](/guide/hooks#handleprocessfailure)

---

### `beforeDimensionExecute()`

**Purpose:** Setup before dimension starts

**Signature:**
```typescript
beforeDimensionExecute(
  context: DimensionContext | SectionDimensionContext
): void | Promise<void>
```

**Default:** Does nothing

**Example:**
```typescript
beforeDimensionExecute(context: DimensionContext): void {
  console.log(`Starting: ${context.dimension}`);
  this.timers.set(context.dimension, Date.now());
}
```

**See:** [Hooks Guide](/guide/hooks#beforedimensionexecute)

---

### `afterDimensionExecute()`

**Purpose:** Cleanup after dimension completes

**Signature:**
```typescript
afterDimensionExecute(
  context: DimensionResultContext
): void | Promise<void>
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

**Default:** Does nothing

**Example:**
```typescript
async afterDimensionExecute(context: DimensionResultContext): Promise<void> {
  // Record metrics
  this.metrics.record({
    dimension: context.dimension,
    duration: context.duration,
    tokens: context.tokensUsed?.totalTokens || 0,
    success: !context.result.error
  });
  
  // Cache result
  if (!context.result.error && !context.isGlobal) {
    const key = this.hash(context.sections[0].content);
    await this.cache.set(key, context.result);
  }
}
```

**See:** [Hooks Guide](/guide/hooks#afterdimensionexecute)

---

### `beforeProviderExecute()`

**Purpose:** Modify request before sending to provider

**Signature:**
```typescript
beforeProviderExecute(
  context: ProviderContext
): ProviderRequest | Promise<ProviderRequest>
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

**Default:** Returns request unchanged

**Example:**
```typescript
beforeProviderExecute(context: ProviderContext): ProviderRequest {
  const request = { ...context.request };
  
  // Add system message for Claude
  if (context.provider === 'anthropic') {
    request.input = `System: You are a helpful assistant.\n\n${request.input}`;
  }
  
  // Adjust temperature for creative tasks
  if (context.dimension === 'creative_writing') {
    request.options = {
      ...request.options,
      temperature: 0.9
    };
  }
  
  return request;
}
```

**See:** [Hooks Guide](/guide/hooks#beforeproviderexecute)

---

### `afterProviderExecute()`

**Purpose:** Modify response after receiving from provider

**Signature:**
```typescript
afterProviderExecute(
  context: ProviderResultContext
): ProviderResponse | Promise<ProviderResponse>
```

**Context:**
```typescript
interface ProviderResultContext extends ProviderContext {
  result: ProviderResponse;
  duration: number;
  tokensUsed?: TokenUsage;
}
```

**Default:** Returns response unchanged

**Example:**
```typescript
afterProviderExecute(context: ProviderResultContext): ProviderResponse {
  const response = { ...context.result };
  
  // Ensure required fields
  if (context.dimension === 'sentiment' && response.data) {
    if (!response.data.score) {
      response.data.score = 0.5;  // Default
    }
  }
  
  // Add metadata
  response.metadata = {
    ...response.metadata,
    dimension: context.dimension,
    processedAt: Date.now()
  };
  
  return response;
}
```

**See:** [Hooks Guide](/guide/hooks#afterproviderexecute)

---

## 🛡️ Optional Methods (Error Recovery)

### `handleRetry()`

**Purpose:** Control retry behavior when provider fails

**Signature:**
```typescript
handleRetry(
  context: RetryContext
): RetryResponse | Promise<RetryResponse>
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

**Default:** Uses exponential backoff

**Example:**
```typescript
handleRetry(context: RetryContext): RetryResponse {
  // Rate limit → wait longer
  if (context.error.message.includes('rate_limit')) {
    return {
      shouldRetry: true,
      delayMs: 60000  // 1 minute
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
  
  // Auth error → don't retry
  if (context.error.message.includes('invalid_api_key')) {
    return { shouldRetry: false };
  }
  
  return {};  // Default behavior
}
```

**See:** [Hooks Guide](/guide/hooks#handleretry)

---

### `handleProviderFallback()`

**Purpose:** Control switching to fallback provider

**Signature:**
```typescript
handleProviderFallback(
  context: FallbackContext
): FallbackResponse | Promise<FallbackResponse>
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

**Default:** Proceeds to fallback

**Example:**
```typescript
handleProviderFallback(context: FallbackContext): FallbackResponse {
  console.log(`Fallback: ${context.failedProvider} → ${context.fallbackProvider}`);
  
  // Adjust for Gemini
  if (context.fallbackProvider === 'gemini') {
    return {
      shouldFallback: true,
      delayMs: 2000,
      modifiedRequest: {
        ...context.request,
        input: context.request.input + '\n\nReturn valid JSON only.',
        options: { ...context.request.options, temperature: 0 }
      }
    };
  }
  
  return {};
}
```

**See:** [Hooks Guide](/guide/hooks#handleproviderfallback)

---

### `handleDimensionFailure()`

**Purpose:** Provide fallback result when all providers fail

**Signature:**
```typescript
handleDimensionFailure(
  context: FailureContext
): DimensionResult | void | Promise<DimensionResult | void>
```

**Context:**
```typescript
interface FailureContext extends RetryContext {
  totalAttempts: number;
  providers: string[];
}
```

**Default:** Throws error

**Example:**
```typescript
handleDimensionFailure(context: FailureContext): DimensionResult {
  console.error(`All providers failed for ${context.dimension}`);
  
  // Return safe defaults
  if (context.dimension === 'sentiment') {
    return {
      data: { sentiment: 'neutral', score: 0.5 },
      metadata: { fallback: true }
    };
  }
  
  // Let critical dimensions fail
  if (context.dimension === 'fraud_check') {
    throw new Error('Fraud check failed');
  }
  
  return {
    error: `Failed after ${context.totalAttempts} attempts`,
    metadata: { providers: context.providers }
  };
}
```

**See:** [Hooks Guide](/guide/hooks#handledimensionfailure)

---

## 📊 Helper Methods

### `getDimensionNames()`

**Purpose:** Get all dimension names

**Signature:**
```typescript
getDimensionNames(): string[]
```

**Returns:** Array of dimension names

**Example:**
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('id', 'Name', 'Description');
    this.dimensions = ['sentiment', 'topics', { name: 'summary', scope: 'global' }];
  }
}

const plugin = new MyPlugin();
console.log(plugin.getDimensionNames());
// ['sentiment', 'topics', 'summary']
```

---

### `isGlobalDimension()`

**Purpose:** Check if a dimension is global

**Signature:**
```typescript
isGlobalDimension(name: string): boolean
```

**Returns:** `true` if global, `false` if section

**Example:**
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super('id', 'Name', 'Description');
    this.dimensions = [
      'sentiment',                           // Section
      { name: 'categorize', scope: 'global' } // Global
    ];
  }
}

const plugin = new MyPlugin();
console.log(plugin.isGlobalDimension('sentiment'));    // false
console.log(plugin.isGlobalDimension('categorize'));   // true
```

---

### `getDimensionConfig()`

**Purpose:** Get full configuration for a dimension

**Signature:**
```typescript
getDimensionConfig(name: string): DimensionConfig
```

**Returns:** Dimension configuration object

**Throws:** If dimension not found

**Example:**
```typescript
const plugin = new MyPlugin();
const config = plugin.getDimensionConfig('categorize');

console.log(config);
// {
//   name: 'categorize',
//   scope: 'global',
//   transform: [Function]
// }
```

---

## 🎯 Complete Example

```typescript
import { Plugin, PromptContext, ProviderSelection, ProcessContext, SectionDimensionContext, DimensionResultContext } from '@ivan629/dag-ai';

class ContentAnalysisPlugin extends Plugin {
  private cache = new Map();
  private metrics: any;

  constructor() {
    super(
      'content-analysis',
      'Content Analysis',
      'Comprehensive content analysis with sentiment, topics, and summary'
    );
    
    this.dimensions = [
      'sentiment',
      'topics',
      'entities',
      { name: 'categorize', scope: 'global' },
      'summary'
    ];
  }

  // Define dependencies
  defineDependencies(context: ProcessContext): Record<string, string[]> {
    return {
      summary: ['sentiment', 'topics', 'entities'],
      categorize: []  // Global, no dependencies
    };
  }

  // Skip logic
  shouldSkipDimension(context: SectionDimensionContext): boolean {
    // Skip short content
    if (context.section.content.length < 50) {
      return true;
    }
    
    // Skip if previous check failed
    if (context.dimension === 'summary') {
      if (context.dependencies.sentiment?.error) {
        return true;
      }
    }
    
    return false;
  }

  // Create prompts
  createPrompt(context: PromptContext): string {
    if (context.dimension === 'sentiment') {
      return `Analyze sentiment: "${context.sections[0].content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
    }
    
    if (context.dimension === 'topics') {
      return `Extract topics: "${context.sections[0].content}"
      Return JSON: {"topics": ["topic1", "topic2", ...]}`;
    }
    
    if (context.dimension === 'entities') {
      return `Extract entities: "${context.sections[0].content}"
      Return JSON: {"people": [...], "places": [...], "organizations": [...]}`;
    }
    
    if (context.dimension === 'categorize' && context.isGlobal) {
      const allContent = context.sections.map((s, i) => 
        `[${i}] ${s.content}`
      ).join('\n\n');
      
      return `Categorize into tech/news/other: ${allContent}
      Return JSON: {"tech": [indices], "news": [indices], "other": [indices]}`;
    }
    
    if (context.dimension === 'summary') {
      const sentiment = context.dependencies.sentiment?.data;
      const topics = context.dependencies.topics?.data;
      const entities = context.dependencies.entities?.data;
      
      return `Create ${sentiment.sentiment} summary focusing on:
      Topics: ${topics.topics.join(', ')}
      Key entities: ${entities.people.join(', ')}
      
      Text: "${context.sections[0].content}"`;
    }
    
    return '';
  }

  // Provider selection
  selectProvider(dimension: string): ProviderSelection {
    // Use cheaper model for simple tasks
    if (dimension === 'sentiment' || dimension === 'topics') {
      return {
        provider: 'gemini',
        options: { model: 'gemini-1.5-flash' },
        fallbacks: [
          { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } }
        ]
      };
    }
    
    // Use best model for complex tasks
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' },
      fallbacks: [
        { provider: 'openai', options: { model: 'gpt-4o' } }
      ]
    };
  }

  // Transform sections based on categorization
  transformSections(context: any): any[] {
    if (context.dimension !== 'categorize') {
      return context.currentSections;
    }
    
    const categories = context.result.data as Record<string, number[]>;
    const newSections: any[] = [];
    
    for (const [category, indices] of Object.entries(categories)) {
      const items = indices.map(i => context.currentSections[i]);
      newSections.push({
        content: items.map(s => s.content).join('\n---\n'),
        metadata: { category, count: items.length }
      });
    }
    
    return newSections;
  }

  // Cache results
  async afterDimensionExecute(context: DimensionResultContext): Promise<void> {
    if (!context.result.error && !context.isGlobal) {
      const key = `${context.dimension}-${context.sections[0].metadata.id}`;
      this.cache.set(key, context.result);
    }
    
    // Record metrics
    this.metrics?.record({
      dimension: context.dimension,
      duration: context.duration,
      success: !context.result.error
    });
  }

  // Handle retries
  handleRetry(context: any): any {
    if (context.error.message.includes('rate_limit')) {
      return { shouldRetry: true, delayMs: 60000 };
    }
    return {};
  }

  // Graceful degradation
  handleDimensionFailure(context: any): any {
    if (context.dimension === 'sentiment') {
      return {
        data: { sentiment: 'neutral', score: 0.5 },
        metadata: { fallback: true }
      };
    }
    
    return {
      error: `Failed after ${context.totalAttempts} attempts`,
      metadata: { providers: context.providers }
    };
  }
}

// Usage
const plugin = new ContentAnalysisPlugin();
const engine = new DagEngine({
  plugin,
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
    gemini: { apiKey: process.env.GEMINI_API_KEY }
  }
});

const result = await engine.process(sections);
```

---

## 📚 Related Documentation

- [DagEngine API](/api/dag-engine) - Engine class reference
- [Providers API](/api/providers) - Provider system
- [Types Reference](/api/types) - All TypeScript types
- [Hooks Guide](/guide/hooks) - Complete hook documentation
- [Lifecycle Guides](/lifecycle/workflow) - Execution flow

---

