---
title: 04 - Transformations
description: Reshape data mid-workflow for massive efficiency gains
---

# 04 - Transformations

Learn how to dynamically reshape your data between dimensions for dramatic cost savings.

---

## What You'll Learn

- ✅ The `transformSections()` hook
- ✅ Reshaping data between dimensions
- ✅ The classic pattern: many items → few groups
- ✅ When and why to use transformations
- ✅ Reducing API calls by 70%+

**Time:** 8 minutes

---

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 04
```

---

## What You'll See
```
📚 Fundamentals 04: Transformations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE PATTERN: Many Items → Few Groups
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WITHOUT transformation:
  10 reviews → classify (10 calls)
            → analyze each (10 calls)
  Total: 20 calls

WITH transformation:
  10 reviews → classify (10 calls)
            → group into 3 categories (1 call)
            → analyze 3 groups (3 calls) ← 70% fewer!
  Total: 14 calls (30% savings)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: CLASSIFY (section, parallel)
  Classify 10 reviews into categories

Phase 2: GROUP (global, sequential)
  Group 10 reviews into 3 categories

Phase 3: TRANSFORMATION 🔄
  transformSections() called
  Input: 10 review sections
  Output: 3 category group sections

Phase 4: ANALYZE (section, parallel)
  Analyze 3 category groups
  ✅ Processing 3 groups instead of 10!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Processing...

🔄 TRANSFORMATION: 10 reviews → 3 groups

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORY ANALYSES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PRICING (4 reviews)
   Summary: Mixed feedback on pricing with equal split...
   Key Issues:
     • Price-to-value ratio too high
     • Not competitive with alternatives
     • Inconsistent value perception
   💡 Recommendation: Conduct competitive pricing analysis

🎧 SUPPORT (3 reviews)
   Summary: Mixed feedback with response time issues...
   Key Issues:
     • Unresponsive support team
     • Slow response times
     • Inconsistent service quality
   💡 Recommendation: Implement 24h response SLA

✨ FEATURES (3 reviews)
   Summary: Mostly positive with some missing functionality...
   Key Issues:
     • Unspecified missing features
     • Lack of detail on valued features
     • No context on included vs missing
   💡 Recommendation: Survey users to identify gaps

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Completed in 9.83s
💰 Cost: $0.0136
📊 Savings: ~30% (vs analyzing individually)
🎫 Tokens: 2,453
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What happened?**
- 10 reviews classified into 3 categories
- **Transformation** reduced 10 sections to 3 groups
- Analyzed 3 groups instead of 10 reviews
- **70% fewer API calls** for analysis phase!

---

## The Complete Code

### Step 1: Define Dimensions with Dependencies
```typescript
class ReviewGroupAnalyzer extends Plugin {
  constructor() {
    super('review-group-analyzer', 'Review Group Analyzer', 'Demo');
    
    this.dimensions = [
      'classify',                              // Section
      { name: 'group_by_category', scope: 'global' },  // Global
      'analyze_category'                       // Section (on transformed data!)
    ];
  }
  
  defineDependencies() {
    return {
      group_by_category: ['classify'],
      analyze_category: ['group_by_category']  // Will receive transformed sections
    };
  }
}
```

---

### Step 2: Implement transformSections Hook
```typescript
transformSections(ctx: TransformSectionsContext): SectionData[] {
  // Only transform after grouping dimension
  if (ctx.dimension !== 'group_by_category') {
    return ctx.currentSections;  // No transformation
  }
  
  // Get grouping result
  const result = ctx.result as DimensionResult<GroupingResult>;
  const groups = result.data?.groups || [];
  
  console.log(`🔄 TRANSFORMATION: ${ctx.currentSections.length} → ${groups.length}`);
  
  // Create NEW sections (one per group)
  return groups.map(group => ({
    content: group.reviews.join('\n\n---\n\n'),
    metadata: {
      category: group.category,
      count: group.count
    }
  }));
}
```

**Key points:**
- Called after **every** dimension completes
- Return `ctx.currentSections` for no change
- Return new array to reshape data
- Next dimension receives transformed sections

---

### Step 3: Create Prompts for Each Dimension
```typescript
createPrompt(ctx: PromptContext): string {
  const { dimension, sections, dependencies } = ctx;
  
  if (dimension === 'classify') {
    // BEFORE transformation: one review per section
    const review = sections[0]?.content;
    return `Classify: "${review}"
    Categories: pricing, support, features
    Return JSON: {"category": "...", "reasoning": "..."}`;
  }
  
  if (dimension === 'group_by_category') {
    // Global: get all classifications
    const classifications = dependencies.classify.data.sections;
    return `Group these reviews by category:
    ${JSON.stringify(classifications)}`;
  }
  
  if (dimension === 'analyze_category') {
    // AFTER transformation: one group per section
    const category = sections[0]?.metadata?.category;
    const reviews = sections[0]?.content;
    return `Analyze "${category}" reviews:
    ${reviews}
    Return JSON: {"summary": "...", "key_issues": [...]}`;
  }
}
```

---

### Step 4: Process and See Transformation
```typescript
const result = await engine.process(reviews);

// After transformation, sections represent groups, not individual reviews
result.sections.forEach(section => {
  const analysis = section.results.analyze_category?.data;
  console.log(`${analysis.category}: ${analysis.review_count} reviews`);
  console.log(`Summary: ${analysis.summary}`);
});
```

**[📁 View full source on GitHub](https://github.com/ivan629/dag-ai/tree/main/examples/04-transformations)**

---

## Key Concepts

### 1. The transformSections Hook

**Signature:**
```typescript
transformSections(ctx: TransformSectionsContext): SectionData[]
```

**Context includes:**
- `dimension` - Which dimension just completed
- `currentSections` - Current sections array
- `result` - Result from the dimension that just ran

**Returns:**
- Same sections (no change)
- New sections array (transformation)

---

### 2. When Transformation Happens
```
Dimension executes → transformSections() called → Next dimension uses result

Example flow:
1. classify runs (10 sections)
2. transformSections checks dimension name
3. Returns same 10 sections (no transform)
4. group_by_category runs (10 sections)
5. transformSections sees 'group_by_category'
6. Creates 3 new sections
7. analyze_category runs (3 sections!) ← Transformed!
```

---

### 3. The Classic Pattern: Many → Few

**Problem:** Analyzing 100 reviews individually is expensive

**Solution:** Group first, then analyze groups
```
WITHOUT transformation:
  100 reviews → 100 classify calls → 100 analyze calls
  Total: 200 calls

WITH transformation:
  100 reviews → 100 classify calls → 1 group call → 5 analyze calls
  Total: 106 calls (47% savings!)
```

**The bigger the dataset, the bigger the savings.**

---

### 4. Transformation Types

#### Grouping (Many → Few)
```typescript
// 100 items → 5 groups
return groups.map(g => ({
  content: g.items.join('\n'),
  metadata: { group: g.name, count: g.items.length }
}));
```

#### Filtering (Many → Fewer)
```typescript
// Keep only items matching criteria
return ctx.currentSections.filter(s => 
  s.metadata?.score > 0.8
);
```

#### Splitting (Few → Many)
```typescript
// Split large documents into chunks
return ctx.currentSections.flatMap(s => 
  chunkText(s.content, 1000).map(chunk => ({
    content: chunk,
    metadata: { ...s.metadata, chunk: true }
  }))
);
```

#### Enriching (Same → Enhanced)
```typescript
// Add data without changing count
return ctx.currentSections.map(s => ({
  ...s,
  metadata: { 
    ...s.metadata, 
    enriched: someData 
  }
}));
```

---

## Real-World Examples

### Example 1: Customer Feedback Analysis
```typescript
this.dimensions = [
  'extract_sentiment',        // Section: 1000 reviews
  { name: 'cluster', scope: 'global' },  // Global: Find 5 themes
  'deep_analysis'             // Section: 5 themes (transformed!)
];

transformSections(ctx) {
  if (ctx.dimension === 'cluster') {
    // 1000 reviews → 5 theme clusters
    return ctx.result.data.clusters.map(cluster => ({
      content: cluster.reviews.join('\n'),
      metadata: { theme: cluster.theme, size: cluster.reviews.length }
    }));
  }
  return ctx.currentSections;
}

// Result: Analyze 5 themes instead of 1000 reviews (99.5% fewer calls!)
```

---

### Example 2: Document Processing
```typescript
this.dimensions = [
  'extract_entities',         // Section: 50 documents
  { name: 'group_by_topic', scope: 'global' },  // Global: 8 topics
  'topic_summary'             // Section: 8 topics
];

transformSections(ctx) {
  if (ctx.dimension === 'group_by_topic') {
    // 50 documents → 8 topic groups
    return ctx.result.data.topics.map(topic => ({
      content: topic.documents.join('\n\n===\n\n'),
      metadata: { 
        topic: topic.name, 
        doc_count: topic.documents.length,
        keywords: topic.keywords
      }
    }));
  }
  return ctx.currentSections;
}
```

---

### Example 3: Large Document Chunking
```typescript
this.dimensions = [
  'chunk_document',           // Transform: 1 doc → 20 chunks
  'analyze_chunk',            // Section: 20 chunks
  { name: 'synthesize', scope: 'global' }  // Global: 1 summary
];

transformSections(ctx) {
  if (ctx.dimension === 'chunk_document') {
    // 1 large document → 20 manageable chunks
    const doc = ctx.currentSections[0];
    return chunkText(doc.content, 2000).map((chunk, i) => ({
      content: chunk,
      metadata: { 
        ...doc.metadata, 
        chunk_index: i, 
        total_chunks: 20 
      }
    }));
  }
  return ctx.currentSections;
}
```

---

## Performance Impact

### Scaling Example: 1000 Reviews
```
WITHOUT transformation:
  classify: 1000 calls × $0.0001 = $0.10
  analyze:  1000 calls × $0.0020 = $2.00
  Total: $2.10, ~30 minutes

WITH transformation (10 groups):
  classify: 1000 calls × $0.0001 = $0.10
  group:       1 call  × $0.0020 = $0.002
  analyze:    10 calls × $0.0020 = $0.02
  Total: $0.122, ~3 minutes
  
Savings: 94% cost, 90% time!
```

---

## Decision Framework

### ✅ Use Transformations When:

**Grouping/Clustering**
- Analyze 1000 reviews as 10 sentiment groups
- Process 500 documents as 20 topic clusters

**Filtering**
- Keep only high-confidence items
- Remove duplicates or irrelevant data

**Chunking**
- Split large documents into processable pieces
- Break long conversations into turns

**Aggregating**
- Combine related items before expensive analysis
- Merge duplicates or similar content

---

### ❌ Don't Use Transformations When:

**Independent Analysis**
- Each item truly needs separate processing
- No relationship between items

**Simple Workflows**
- Just 2-3 dimensions, no grouping needed
- Data shape doesn't need to change

**Already Optimal**
- Sections are already in the right format
- No cost/performance gain from reshaping

---

## Customization

### Change Grouping Logic
```typescript
// Current: Group by category
if (ctx.dimension === 'group_by_category') {
  return groups.map(g => ({ ... }));
}

// Alternative: Group by sentiment
if (ctx.dimension === 'group_by_sentiment') {
  const positive = reviews.filter(r => r.sentiment === 'positive');
  const negative = reviews.filter(r => r.sentiment === 'negative');
  return [
    { content: positive.join('\n'), metadata: { sentiment: 'positive' } },
    { content: negative.join('\n'), metadata: { sentiment: 'negative' } }
  ];
}
```

---

### Multiple Transformations
```typescript
transformSections(ctx) {
  // First transformation: Split large docs
  if (ctx.dimension === 'split_documents') {
    return ctx.currentSections.flatMap(splitIntoChunks);
  }
  
  // Second transformation: Group by topic
  if (ctx.dimension === 'group_by_topic') {
    return ctx.result.data.groups.map(createGroupSection);
  }
  
  // No transformation for other dimensions
  return ctx.currentSections;
}
```

---

### Conditional Transformation
```typescript
transformSections(ctx) {
  if (ctx.dimension !== 'group') {
    return ctx.currentSections;
  }
  
  const groups = ctx.result.data.groups;
  
  // Only transform if grouping is effective
  if (groups.length < ctx.currentSections.length * 0.5) {
    console.log('✅ Grouping effective, transforming');
    return groups.map(createSection);
  }
  
  console.log('⚠️ Grouping ineffective, skipping transformation');
  return ctx.currentSections;
}
```

---

## Next Steps

**Ready for more?**

1. **[05 - Skip Logic](/examples/05-skip-logic)** - Conditional execution
2. **[06 - Error Handling](/examples/06-error-handling)** - Robust workflows
3. **[Production Quickstart](/examples/00-quickstart)** - All features together

**Want to experiment?**

- Group by sentiment instead of category
- Add a filtering step (keep only negative reviews)
- Try with 50+ reviews to see scaling benefits

---

## Troubleshooting

### Transformation Not Applied
```typescript
// ❌ Wrong: Transformation ignored
transformSections(ctx) {
  if (ctx.dimension === 'group') {
    const newSections = createGroups();
    // Forgot to return!
  }
}

// ✅ Correct: Always return sections
transformSections(ctx) {
  if (ctx.dimension === 'group') {
    return createGroups();
  }
  return ctx.currentSections;  // Important!
}
```

---

### Next Dimension Gets Wrong Data
```typescript
// Problem: analyze_category runs before transformation
defineDependencies() {
  return {
    analyze_category: ['classify']  // ❌ Wrong dependency
  };
}

// Solution: Depend on the dimension that triggers transformation
defineDependencies() {
  return {
    group_by_category: ['classify'],
    analyze_category: ['group_by_category']  // ✅ Correct
  };
}
```

---

### Lost Metadata
```typescript
// ❌ Loses original metadata
transformSections(ctx) {
  return groups.map(g => ({
    content: g.reviews.join('\n')
    // metadata missing!
  }));
}

// ✅ Preserves + enhances metadata
transformSections(ctx) {
  return groups.map(g => ({
    content: g.reviews.join('\n'),
    metadata: {
      category: g.category,
      count: g.reviews.length,
      original_ids: g.reviews.map(r => r.id)  // Preserve traceability
    }
  }));
}
```

---

## Summary

**What you learned:**

✅ `transformSections()` hook - Reshape data between dimensions  
✅ Many → Few pattern - Dramatic cost savings  
✅ When to transform - Clear decision criteria  
✅ Multiple transformation types - Group, filter, split, enrich  
✅ Real-world scaling - 90%+ cost reduction possible

**Key insight:**

Transformations are **force multipliers**. Process 1000 items as 10 groups = 100x fewer expensive analysis calls. The larger your dataset, the more you save.

**Power move:** Combine transformations with section/global scopes for elegant, efficient workflows that scale to millions of items.

**Next:** [05 - Skip Logic →](/examples/05-skip-logic)

Learn how to conditionally skip dimensions for even more efficiency!