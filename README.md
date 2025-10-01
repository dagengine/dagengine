# DagEngine Library - Complete Workflow Guide

## Overview

The DagEngine is an AI-powered document processing library that analyzes content through multiple "dimensions" (like sentiment, topics, verification, etc.). It supports both **section-level** processing (analyzing each document section individually) and **global** processing (analyzing all sections together).

## Key Concepts

### Dimensions
- **Section Dimensions**: Process each document section independently (e.g., sentiment analysis per section)
- **Global Dimensions**: Process all sections together to find patterns, relationships, or restructure content

### Dependencies
Dimensions can depend on other dimensions. The engine ensures dependencies are processed in the correct order.

### Section Transformation
Global dimensions can transform the sections array - merging similar sections, splitting complex ones, or reordering content.

---

## Scenario 1: Traditional Section-Only Processing

### Setup
```javascript
// Plugin with only section-level dimensions
this.dimensions = [
  'sentiment',
  'topics', 
  'summary'
];

// Dependencies
getDimensionDependencyGraph() {
  return {
    sentiment: [],           // No dependencies
    topics: [],              // No dependencies  
    summary: ['sentiment', 'topics']  // Waits for sentiment + topics
  };
}
```

### Execution Flow

```
Input: [Section1, Section2, Section3]

┌─────────────────────────────────────────────────────────────┐
│ GLOBAL PHASE                                                │
│ → No global dimensions, skipped                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SECTION PHASE (Parallel processing of all 3 sections)      │
└─────────────────────────────────────────────────────────────┘

For Section1:                For Section2:                For Section3:
├─ sentiment (parallel)      ├─ sentiment (parallel)      ├─ sentiment (parallel)
├─ topics (parallel)         ├─ topics (parallel)         ├─ topics (parallel)
└─ summary (waits for both)  └─ summary (waits for both)  └─ summary (waits for both)

Final Result:
- Section1: {sentiment: result, topics: result, summary: result}
- Section2: {sentiment: result, topics: result, summary: result}
- Section3: {sentiment: result, topics: result, summary: result}
```

### Timing
- **Concurrent**: All sections process simultaneously
- **Per Section**: sentiment + topics run in parallel, then summary waits for both
- **Total Time**: ~2 AI calls (parallel sentiment/topics, then summary)

---

## Scenario 2: Global + Section Processing (No Transformation)

### Setup
```javascript
this.dimensions = [
  { name: 'global_themes', scope: 'global' },  // Global analysis
  'sentiment',                                  // Section analysis
  'summary'                                     // Section analysis
];

getDimensionDependencyGraph() {
  return {
    global_themes: [],                    // No dependencies
    sentiment: [],                        // No dependencies
    summary: ['sentiment', 'global_themes']  // Waits for both
  };
}
```

### Execution Flow

```
Input: [Section1, Section2, Section3]

┌─────────────────────────────────────────────────────────────┐
│ GLOBAL PHASE (Sequential)                                   │
│ global_themes: Analyzes ALL sections together              │
│ → Identifies themes across Section1, Section2, Section3     │
│ → Stores result for later use                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SECTION PHASE (Parallel processing, using global results)   │
└─────────────────────────────────────────────────────────────┘

For Section1:                For Section2:                For Section3:
├─ sentiment (parallel)      ├─ sentiment (parallel)      ├─ sentiment (parallel)
└─ summary:                  └─ summary:                  └─ summary:
   ├─ waits for sentiment       ├─ waits for sentiment       ├─ waits for sentiment
   └─ uses global_themes        └─ uses global_themes        └─ uses global_themes

Final Result:
- globalResults: {global_themes: cross-document analysis}
- Section1: {sentiment: result, summary: result with global context}
- Section2: {sentiment: result, summary: result with global context}  
- Section3: {sentiment: result, summary: result with global context}
```

### Key Features
- **Global Analysis**: Runs once for all sections
- **Shared Context**: Each section's summary uses the same global themes
- **Efficiency**: Global themes computed once, reused 3 times

---

## Scenario 3: Global Processing with Section Transformation

### Setup
```javascript
this.dimensions = [
  { name: 'global_themes', scope: 'global' },
  { 
    name: 'section_clustering', 
    scope: 'global',
    transform: (result, sections) => {
      // AI suggests merging Section1+2, keeping Section3
      return [
        { content: "Merged content of Section1+2", metadata: {...} },
        sections[2]  // Keep Section3 unchanged
      ];
    }
  },
  'sentiment',
  'summary'
];

getDimensionDependencyGraph() {
  return {
    global_themes: [],
    section_clustering: ['global_themes'],  // Uses themes for clustering
    sentiment: [],
    summary: ['sentiment', 'global_themes']
  };
}
```

### Execution Flow

```
Input: [Section1, Section2, Section3]

┌─────────────────────────────────────────────────────────────┐
│ GLOBAL PHASE (Sequential with transformation)               │
│                                                             │
│ 1. global_themes: Analyzes ALL 3 sections                  │
│    → Identifies common themes                               │
│                                                             │
│ 2. section_clustering: Uses themes to restructure           │
│    → AI determines Section1+2 are similar                  │
│    → Transform function merges them                         │
│    → 3 sections become 2 sections                          │
└─────────────────────────────────────────────────────────────┘

Current sections: [MergedSection1+2, Section3]

┌─────────────────────────────────────────────────────────────┐
│ SECTION PHASE (Now processes the 2 NEW sections)            │
└─────────────────────────────────────────────────────────────┘

For MergedSection1+2:        For Section3:
├─ sentiment (parallel)      ├─ sentiment (parallel)
└─ summary:                  └─ summary:
   ├─ waits for sentiment       ├─ waits for sentiment
   └─ uses global_themes        └─ uses global_themes

Final Result:
- globalResults: {global_themes: ..., section_clustering: ...}
- finalSections: [MergedSection1+2, Section3]  // Transformed structure
- MergedSection1+2: {sentiment: result, summary: result}
- Section3: {sentiment: result, summary: result}
```

### Transformation Impact
- **Input**: 3 sections → **Output**: 2 sections
- **Content Restructuring**: Related sections merged intelligently
- **Downstream Processing**: All subsequent dimensions work on the new structure

---

## Scenario 4: Complex Dependencies with Multiple Global Dimensions

### Setup
```javascript
this.dimensions = [
  { name: 'global_themes', scope: 'global' },
  { name: 'cross_references', scope: 'global' },
  { name: 'section_clustering', scope: 'global', transform: mergeSections },
  'sentiment',
  'fact_check',
  'summary'
];

getDimensionDependencyGraph() {
  return {
    global_themes: [],
    cross_references: ['global_themes'],           // Needs themes first
    section_clustering: ['global_themes', 'cross_references'],  // Needs both
    sentiment: [],
    fact_check: ['cross_references'],              // Uses global cross-refs
    summary: ['sentiment', 'fact_check', 'global_themes']
  };
}
```

### Execution Flow

```
Input: [Section1, Section2, Section3, Section4]

┌─────────────────────────────────────────────────────────────┐
│ GLOBAL PHASE (Topologically sorted)                         │
│                                                             │
│ 1. global_themes: Analyzes all 4 sections                  │
│    → Identifies document-wide themes                        │
│                                                             │
│ 2. cross_references: Uses themes to find connections        │
│    → Maps relationships between sections                    │
│                                                             │
│ 3. section_clustering: Uses themes + cross-refs            │
│    → Merges Section1+3 (related content)                   │
│    → Keeps Section2, Section4 separate                     │
│    → 4 sections → 3 sections                               │
└─────────────────────────────────────────────────────────────┘

Current sections: [MergedSection1+3, Section2, Section4]

┌─────────────────────────────────────────────────────────────┐
│ SECTION PHASE (Processes 3 transformed sections)            │
└─────────────────────────────────────────────────────────────┘

For each of the 3 sections (parallel):
├─ sentiment (no dependencies)
├─ fact_check (waits for cross_references global result)
└─ summary (waits for sentiment + fact_check + global_themes)

Final Result:
- globalResults: {global_themes, cross_references, section_clustering}
- finalSections: [MergedSection1+3, Section2, Section4]
- Each section: {sentiment, fact_check, summary}
```

### Complex Dependencies
- **Global Dependencies**: cross_references → global_themes → section_clustering
- **Mixed Dependencies**: summary uses both section results (sentiment, fact_check) and global results (global_themes)
- **Transformation Chain**: Multiple global dimensions can each transform sections

---

## Error Handling Scenarios

### Missing Dependencies
```
If global dimension fails:
├─ Error stored in globalResults
├─ Dependent dimensions receive error object
└─ Processing continues with error context
```

### Transform Function Failures
```
If transform returns invalid result:
├─ Warning logged
├─ Original sections preserved
└─ Processing continues normally
```

### Circular Dependencies
```
If circular dependency detected:
├─ Error thrown immediately
├─ Processing stops
└─ Clear error message provided
```

---

## Performance Characteristics

### Concurrency Levels

1. **Global Dimensions**: Sequential (respecting dependencies)
2. **Sections**: Parallel batches (configurable concurrency)
3. **Per-Section Dimensions**: Parallel (when no dependencies)

### Memory Usage

- **Global Results**: Cached and reused across all sections
- **Section Processing**: Independent memory per section batch
- **Dependency Resolution**: Efficient caching prevents recomputation

### Scaling Behavior

```
10 sections, 5 dimensions:
- Without global: ~50 AI calls (10 × 5)
- With 2 global: ~32 AI calls (2 global + 10 × 3 section)

100 sections, 5 dimensions:  
- Without global: ~500 AI calls
- With 2 global: ~302 AI calls (2 global + 100 × 3 section)
```

---

## Configuration Examples

### Simple Processing
```javascript
const engine = new DagEngine({
  ai: { anthropic: { apiKey: "..." } },
  plugin: new SimplePlugin(),
  concurrency: 3
});
```

### Advanced Processing
```javascript
const engine = new DagEngine({
  ai: { 
    anthropic: { apiKey: "..." },
    openai: { apiKey: "..." }
  },
  plugin: new AdvancedPlugin(),
  concurrency: 10,
  maxRetries: 5
});
```

### Usage
```javascript
const result = await engine.process(sections, {
  onDimensionStart: (dim) => console.log(`Starting ${dim}`),
  onSectionComplete: (idx, result) => console.log(`Section ${idx} done`),
  onError: (id, error) => console.error(`Error in ${id}:`, error)
});

// Access results
console.log('Global analysis:', result.globalResults);
console.log('Final sections:', result.finalSections);  
console.log('Section analysis:', result.sections);
```

This architecture provides maximum flexibility while maintaining clear execution order and efficient resource usage.