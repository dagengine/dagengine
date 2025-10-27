---
title: 04 - Transformations
description: Reshape data mid-workflow for cost optimization
---

# 04 - Transformations

The `transformSections()` hook reshapes data between dimensions to optimize processing.

## What You'll Learn

- ✅ Use the `transformSections()` hook
- ✅ Reshape data between dimensions
- ✅ Apply the many-to-few pattern for cost savings
- ✅ Understand when transformations add value
- ✅ Implement multiple transformation types

**Time:** 8 minutes

## Quick Run

```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 04
```

**[📁 View example on GitHub](https://github.com/ivan629/dag-ai/tree/main/examples/02-fundamentals/04-transformations)**

## What You'll See

```
📚 Fundamentals 04: Transformations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE PATTERN: Many Items → Few Groups
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Transformation reduces processing:
  Classify individual items → Group items → Analyze groups
  Result: Fewer expensive analysis calls

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: CLASSIFY (section, parallel)
  Classify reviews into categories

Phase 2: GROUP (global, sequential)
  Group reviews into categories

Phase 3: TRANSFORMATION 🔄
  transformSections() called
  Input: Individual review sections
  Output: Category group sections

Phase 4: ANALYZE (section, parallel)
  Analyze category groups
  ✅ Processing groups instead of individual reviews!

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
🎫 Tokens: 2,453
📊 Processed: 10 reviews → 3 groups
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What happened?**

- 10 individual reviews classified into categories in parallel (10 API calls)
- Global dimension grouped classifications into 3 categories (1 API call)
- Transformation created 3 new sections, one per category group
- 3 category groups analyzed instead of 10 individual reviews (3 API calls instead of 10)

## Code Walkthrough

### Step 1: Define Dimensions with Dependencies

```typescript
class ReviewGroupAnalyzer extends Plugin {
	constructor() {
		super("review-group-analyzer", "Review Group Analyzer", "Demo");

		this.dimensions = [
			"classify", // Section
			{ name: "group_by_category", scope: "global" }, // Global
			"analyze_category", // Section (on transformed data!)
		];
	}

	defineDependencies() {
		return {
			group_by_category: ["classify"],
			analyze_category: ["group_by_category"], // Will receive transformed sections
		};
	}
}
```

**Key point:** The dependency chain ensures classification happens first, then grouping, then analysis of the transformed groups.

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

**Key point:** Called after every dimension completes. Return `ctx.currentSections` for no change, or return a new array to reshape data.

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

**Key point:** The `analyze_category` dimension receives transformed sections where each section represents a group of reviews, not individual reviews.

### Step 4: Process and See Transformation

```typescript
const result = await engine.process(reviews);

// After transformation, sections represent groups, not individual reviews
result.sections.forEach((sectionResult) => {
	const analysis = sectionResult.results.analyze_category?.data;
	console.log(`${analysis.category}: ${analysis.review_count} reviews`);
	console.log(`Summary: ${analysis.summary}`);
});
```

## Key Concepts

### 1. The transformSections Hook

Signature:

```typescript
transformSections(ctx: TransformSectionsContext): SectionData[]
```

**Context includes:**

- `dimension` - Which dimension just completed
- `currentSections` - Current sections array
- `result` - Result from the dimension that just ran

**Characteristics:**

- Called after every dimension completes
- Must return a SectionData array
- Subsequent dimensions receive the transformed sections
- Can maintain, reduce, increase, or filter section count

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
7. analyze_category runs (3 sections!)
```

**Characteristics:**

- Executes in the gap between dimensions
- Next dimension receives transformed sections
- Can chain multiple transformations
- Transformation is optional for each dimension

### 3. The Classic Pattern: Many → Few

Group items before expensive analysis:

```
Input: Many individual items
↓
Classify each item (cheap, fast model)
↓
Group into categories (single global call)
↓
Transform: Create sections for each group
↓
Analyze groups (fewer expensive calls)
```

**Characteristics:**

- Reduces API call count significantly
- Uses cheap models for classification
- Reserves expensive models for synthesis
- Maintains data quality while cutting costs

### 4. Transformation Types

#### Grouping (Many → Few)

```typescript
// Multiple items → fewer groups
return groups.map((group) => ({
	content: group.items.join("\n"),
	metadata: { group: group.name, count: group.items.length },
}));
```

#### Filtering (Many → Fewer)

```typescript
// Keep only items matching criteria
return ctx.currentSections.filter((section) => section.metadata?.score > 0.8);
```

#### Splitting (Few → Many)

```typescript
// Split large documents into chunks
return ctx.currentSections.flatMap((section) =>
	chunkText(section.content, 1000).map((chunk) => ({
		content: chunk,
		metadata: { ...section.metadata, chunk: true },
	})),
);
```

#### Enriching (Same → Enhanced)

```typescript
// Add data without changing count
return ctx.currentSections.map((section) => ({
	...section,
	metadata: {
		...section.metadata,
		enriched: someData,
	},
}));
```

## Real-World Examples

### Customer Feedback Analysis

```typescript
this.dimensions = [
	"extract_sentiment",
	{ name: "cluster", scope: "global" },
	"deep_analysis",
];
// Transform: Group reviews by theme, analyze themes instead of individuals
```

### Document Processing

```typescript
this.dimensions = [
	"extract_entities",
	{ name: "group_by_topic", scope: "global" },
	"topic_summary",
];
// Transform: Group documents by topic, summarize topics instead of documents
```

### Large Document Chunking

```typescript
this.dimensions = [
	"chunk_document",
	"analyze_chunk",
	{ name: "synthesize", scope: "global" },
];
// Transform: Split large document into chunks, analyze each chunk in parallel
```

## Decision Framework

### Use Transformations When:

**Grouping/Clustering** - Analyze many reviews as fewer sentiment groups, process many documents as fewer topic clusters

**Filtering** - Keep only high-confidence items, remove duplicates or irrelevant data

**Chunking** - Split large documents into processable pieces, break long conversations into turns

**Aggregating** - Combine related items before expensive analysis, merge duplicates or similar content

### Skip Transformations When:

**Independent Analysis** - Each item truly needs separate processing with no relationship between items

**Simple Workflows** - Just 2-3 dimensions with no grouping needed, data shape doesn't need to change

**Already Optimal** - Sections are already in the right format with no benefit from reshaping

## Summary

**What you learned:**

✅ **transformSections() hook** - Reshape data between dimensions dynamically  
✅ **Many-to-few pattern** - Group items to reduce expensive API calls  
✅ **When to transform** - Clear criteria for applying transformations  
✅ **Transformation types** - Group, filter, split, and enrich data  
✅ **Real patterns** - Customer feedback, document processing, chunking

**Key insight:**

Transformations change data granularity at the optimal point in your pipeline. The many-to-few pattern is particularly powerful: classify individual items with a cheap model, group them, then analyze groups with an expensive model. This reduces API calls while maintaining or improving insight quality. The hook executes automatically between dimensions, making complex data reshaping transparent to the rest of your workflow.

## Troubleshooting

### Transformation Not Applied

```typescript
transformSections(ctx) {
  if (ctx.dimension === 'group') {
    const newSections = createGroups();
    // Forgot to return!
  }
}
```

**Cause:** Missing return statement in transformation logic.

**Fix:**

```typescript
transformSections(ctx) {
  if (ctx.dimension === 'group') {
    return createGroups();
  }
  return ctx.currentSections;  // Always return
}
```

### Next Dimension Gets Wrong Data

```typescript
defineDependencies() {
  return {
    analyze_category: ['classify']  // Wrong dependency
  };
}
```

**Cause:** Dimension depends on wrong predecessor, missing the transformation trigger.

**Fix:**

```typescript
defineDependencies() {
  return {
    group_by_category: ['classify'],
    analyze_category: ['group_by_category']  // Depend on grouping dimension
  };
}
```

### Lost Metadata

```typescript
transformSections(ctx) {
  return groups.map(group => ({
    content: group.reviews.join('\n')
    // metadata missing!
  }));
}
```

**Cause:** Metadata not included in transformed sections.

**Fix:**

```typescript
transformSections(ctx) {
  return groups.map(group => ({
    content: group.reviews.join('\n'),
    metadata: {
      category: group.category,
      count: group.reviews.length,
      original_ids: group.reviews.map(r => r.id)
    }
  }));
}
```
