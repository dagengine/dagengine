---
title: Skip Logic
description: Skip unnecessary processing with dynamic conditions
---

# Skip Logic

Skip processing for specific sections using `shouldSkipDimension()`.

## Basic Usage

```typescript
class MyPlugin extends Plugin {
  dimensions = ['analysis'];

  shouldSkipDimension(context) {
    // Skip short content
    if (context.section.content.length < 50) {
      return true;
    }
    
    return false;
  }

  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

## Skip Patterns

### By Content Properties

```typescript
shouldSkipDimension(context) {
  const length = context.section.content.length;
  
  if (length < 50) return true;      // Too short
  if (length > 10000) return true;   // Too long
  if (!context.section.content.trim()) return true;  // Empty
  
  return false;
}
```

### By Metadata

```typescript
shouldSkipDimension(context) {
  if (context.section.metadata.processed) return true;
  if (context.section.metadata.spam_score > 0.8) return true;
  if (context.section.metadata.archived) return true;
  
  return false;
}
```

### By Dependencies

```typescript
class FilteredPlugin extends Plugin {
  dimensions = ['quality_check', 'deep_analysis'];

  defineDependencies() {
    return { deep_analysis: ['quality_check'] };
  }

  shouldSkipDimension(context) {
    if (context.dimension === 'deep_analysis') {
      const quality = context.dependencies.quality_check?.data?.quality;
      if (quality < 7) return true;
    }
    return false;
  }

  createPrompt(context) {
    if (context.dimension === 'quality_check') {
      return `Rate quality 1-10: "${context.sections[0].content}"`;
    }
    return `Detailed analysis: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

## Return Cached Results

Skip processing and return a cached result:

```typescript
class CachedPlugin extends Plugin {
  cache = new Map();
  dimensions = ['analysis'];

  shouldSkipDimension(context) {
    const key = context.section.content;
    const cached = this.cache.get(key);
    
    if (cached) {
      return { skip: true, result: cached };
    }
    
    return false;
  }

  afterDimensionExecute(context) {
    if (!context.error) {
      const key = context.section.content;
      this.cache.set(key, context.result);
    }
  }

  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

For production, use Redis or similar for persistent caching across processes.

---

## Use Cases

### Cost Reduction

Skip unnecessary API calls:

```typescript
shouldSkipDimension(context) {
  if (context.section.content.length < 100) return true;
  return false;
}
```

### Performance

Skip duplicate processing:

```typescript
shouldSkipDimension(context) {
  const cached = this.cache.get(context.section.content);
  if (cached) return { skip: true, result: cached };
  return false;
}
```

### Quality Filtering

Skip low-quality content:

```typescript
shouldSkipDimension(context) {
  if (context.dimension === 'expensive_analysis') {
    const quality = context.dependencies.filter?.data?.quality;
    if (quality < 7) return true;
  }
  return false;
}
```

### Language Filtering

Skip translation for English content:

```typescript
shouldSkipDimension(context) {
  if (context.dimension === 'translate') {
    const lang = context.dependencies.detect_language?.data?.language;
    if (lang === 'en') {
      return {
        skip: true,
        result: { data: { text: context.section.content } }
      };
    }
  }
  return false;
}
```

## Return Values

**`true`** - Skip processing, no result stored  
**`false`** - Process normally  
**`{ skip: true, result: ... }`** - Skip processing, use provided result

## Complete Example

```typescript
class OptimizedPlugin extends Plugin {
  cache = new Map();
  dimensions = ['filter', 'analysis'];

  defineDependencies() {
    return { analysis: ['filter'] };
  }

  shouldSkipDimension(context) {
    // Skip empty
    if (!context.section.content.trim()) return true;
    
    // Skip short
    if (context.section.content.length < 50) return true;
    
    // Check cache
    const key = `${context.dimension}:${context.section.content}`;
    const cached = this.cache.get(key);
    if (cached) return { skip: true, result: cached };
    
    // Skip low quality
    if (context.dimension === 'analysis') {
      const quality = context.dependencies.filter?.data?.quality;
      if (quality < 7) return true;
    }
    
    return false;
  }

  afterDimensionExecute(context) {
    if (!context.error) {
      const key = `${context.dimension}:${context.section.content}`;
      this.cache.set(key, context.result);
    }
  }

  createPrompt(context) {
    if (context.dimension === 'filter') {
      return `Quality 1-10: "${context.sections[0].content}"`;
    }
    return `Analyze: "${context.sections[0].content}"`;
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}
```

## Next Steps

- [Quick Start](/guide/quick-start) - Build your first workflow
- [Core Concepts](/guide/core-concepts) - Understand the basics
- [Lifecycle Hooks](/lifecycle/hooks) - All available hooks
- [Examples](/guide/examples) - Working examples
