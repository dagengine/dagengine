---
title: Error Handling
description: Build resilient AI workflows with comprehensive error handling
---

# Error Handling

Build production-ready workflows that handle failures gracefully.

---

## 🎯 Overview

dag-ai provides **multiple layers** of error handling:

1. ✅ **Automatic Retries** - Try again on transient failures
2. ✅ **Provider Fallbacks** - Switch providers automatically
3. ✅ **Custom Error Handlers** - Control what happens on failure
4. ✅ **Graceful Degradation** - Continue processing when possible
5. ✅ **Error Tracking** - Monitor and debug issues

---

## 🔄 Automatic Retry Logic

### Default Behavior

dag-ai automatically retries failed requests **3 times** with exponential backoff.

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  maxRetries: 3  // Default: 3 retries
});
```

**What happens:**
```
Attempt 1: Immediate
  ↓ (fails)
Attempt 2: Wait 1 second
  ↓ (fails)
Attempt 3: Wait 2 seconds
  ↓ (fails)
Attempt 4: Wait 4 seconds
  ↓ (fails)
Error thrown
```

---

### Configure Retries

#### Global Configuration

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  maxRetries: 5,              // More retries
  retryDelay: 2000,           // Start with 2s delay
  retryBackoffMultiplier: 2   // Double each time (2s, 4s, 8s...)
});
```

#### Per-Provider Configuration

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },
    maxRetries: 5,        // Override global setting
    retryDelay: 1000      // Custom delay for this provider
  };
}
```

#### Disable Retries

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  maxRetries: 0  // No retries
});
```

---

## 🔀 Provider Fallbacks

### Basic Fallback

If primary provider fails, automatically try backup providers:

```typescript
class FallbackPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze sentiment: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return {
      provider: 'anthropic',  // Try this first
      fallbacks: [
        { provider: 'openai' },   // Then this
        { provider: 'gemini' }    // Then this
      ]
    };
  }
}
```

**Execution Flow:**
```
1. Try Anthropic (3 retries)
   ↓ (all fail)
2. Try OpenAI (3 retries)
   ↓ (all fail)
3. Try Gemini (3 retries)
   ↓ (all fail)
4. Throw error
```

**Total attempts:** Up to 9 attempts (3 providers × 3 retries)

---

### Fallback with Custom Delays

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    fallbacks: [
      { 
        provider: 'openai', 
        retryAfter: 2000  // Wait 2s before trying OpenAI
      },
      { 
        provider: 'gemini', 
        retryAfter: 5000  // Wait 5s before trying Gemini
      }
    ]
  };
}
```

---

### Smart Fallback (Different Models)

Use cheaper fallback models:

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' },  // Best quality
    fallbacks: [
      { 
        provider: 'anthropic',
        options: { model: 'claude-haiku-3-5' }  // Cheaper fallback
      },
      { 
        provider: 'openai',
        options: { model: 'gpt-4o-mini' }  // Even cheaper
      }
    ]
  };
}
```

---

## 🎛️ Custom Error Handlers

### handleRetry Hook

Called before each retry attempt:

```typescript
class RetryPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
  
  handleRetry(context) {
    console.log(`Retry ${context.attempt}/${context.maxRetries} for ${context.dimension}`);
    console.log(`Error: ${context.error.message}`);
    
    // Optional: Modify the retry behavior
    if (context.error.message.includes('rate_limit')) {
      // Wait longer for rate limits
      return { delay: 10000 };  // 10 seconds
    }
    
    // Use default retry logic
    return { delay: context.defaultDelay };
  }
}
```

**Output:**
```
Retry 1/3 for sentiment
Error: API rate limit exceeded
Retry 2/3 for sentiment
Error: API rate limit exceeded
...
```

---

### handleProviderFallback Hook

Called when switching to a fallback provider:

```typescript
class FallbackPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return {
      provider: 'anthropic',
      fallbacks: [
        { provider: 'openai' },
        { provider: 'gemini' }
      ]
    };
  }
  
  handleProviderFallback(context) {
    console.log(`Switching from ${context.fromProvider} to ${context.toProvider}`);
    console.log(`Reason: ${context.error.message}`);
    
    // Optional: Modify prompt for fallback provider
    if (context.toProvider === 'gemini') {
      return {
        // Add special instruction for Gemini
        promptModifier: (prompt) => `${prompt}\n\nIMPORTANT: Return valid JSON only.`
      };
    }
  }
}
```

---

### handleDimensionFailure Hook

Called when a dimension fails after all retries:

```typescript
class ErrorPlugin extends Plugin {
  dimensions = ['sentiment', 'topics', 'summary'];
  
  defineDependencies() {
    return { summary: ['sentiment', 'topics'] };
  }
  
  createPrompt(context) {
    return `Analyze ${context.dimension}: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
  
  handleDimensionFailure(context) {
    console.error(`Dimension ${context.dimension} failed:`, context.error);
    
    // Provide fallback result
    if (context.dimension === 'sentiment') {
      return {
        continueProcessing: true,
        fallbackResult: {
          data: { sentiment: 'unknown', score: 0.5 },
          metadata: { error: true, message: context.error.message }
        }
      };
    }
    
    // Stop processing dependent dimensions
    return { continueProcessing: false };
  }
}
```

**Behavior:**
```
sentiment fails → Use fallback result → Continue
topics fails → Stop (no fallback) → Error
summary skipped (dependency failed)
```

---

### handleProcessFailure Hook

Called when the entire process fails:

```typescript
class ProcessErrorPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
  
  handleProcessFailure(context) {
    console.error('Process failed:', context.error);
    console.log('Failed sections:', context.failedSections.length);
    console.log('Completed sections:', context.completedSections.length);
    
    // Send alert
    this.sendAlert({
      error: context.error.message,
      failedCount: context.failedSections.length
    });
    
    // Return partial results
    return {
      returnPartialResults: true
    };
  }
  
  sendAlert(data) {
    // Send to monitoring service
    console.log('ALERT:', data);
  }
}
```

---

## 🛡️ Graceful Degradation

### Continue on Error

By default, dag-ai continues processing other sections when one fails:

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  continueOnError: true  // Default: true
});

const result = await engine.process([
  { content: 'Document 1', metadata: {} },  // Success
  { content: 'Document 2', metadata: {} },  // Fails
  { content: 'Document 3', metadata: {} }   // Success
]);

console.log(result.sections[0].results);  // ✅ Has results
console.log(result.sections[1].error);     // ❌ Has error
console.log(result.sections[2].results);  // ✅ Has results
```

---

### Stop on Error

Fail fast - stop at first error:

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  continueOnError: false  // Stop on first error
});
```

---

### Partial Results

Handle partial success gracefully:

```typescript
const result = await engine.process(sections);

// Check for errors
const successful = result.sections.filter(s => !s.error);
const failed = result.sections.filter(s => s.error);

console.log(`Processed: ${successful.length}/${result.sections.length}`);

if (failed.length > 0) {
  console.error('Failed sections:', failed.map(s => ({
    content: s.section.content.substring(0, 50),
    error: s.error.message
  })));
}

// Process successful results
successful.forEach(section => {
  console.log(section.results.sentiment.data);
});
```

---

## 🚨 Error Types

### Provider Errors

```typescript
try {
  const result = await engine.process(sections);
} catch (error) {
  if (error.type === 'PROVIDER_ERROR') {
    console.error('Provider failed:', error.provider);
    console.error('Message:', error.message);
    
    // Common provider errors:
    // - API key invalid
    // - Rate limit exceeded
    // - Model not found
    // - Network timeout
  }
}
```

---

### Configuration Errors

```typescript
try {
  const engine = new DagEngine({
    plugin: myPlugin,
    providers: {}  // ❌ No providers configured
  });
} catch (error) {
  if (error.type === 'CONFIG_ERROR') {
    console.error('Configuration error:', error.message);
    
    // Common config errors:
    // - Provider not configured
    // - Invalid API key format
    // - Missing required options
  }
}
```

---

### Dependency Errors

```typescript
class BadPlugin extends Plugin {
  dimensions = ['A', 'B'];
  
  defineDependencies() {
    return {
      A: ['B'],
      B: ['A']  // ❌ Circular dependency
    };
  }
}

try {
  const engine = new DagEngine({ plugin: new BadPlugin(), providers: {...} });
  await engine.process(sections);
} catch (error) {
  if (error.type === 'DEPENDENCY_ERROR') {
    console.error('Dependency error:', error.message);
    // Error: Circular dependency detected: A → B → A
  }
}
```

---

### Timeout Errors

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  timeout: 10000  // 10 seconds
});

try {
  const result = await engine.process(sections);
} catch (error) {
  if (error.type === 'TIMEOUT_ERROR') {
    console.error('Timeout:', error.message);
    console.log('Dimension:', error.dimension);
    console.log('Duration:', error.duration);
  }
}
```

---

## 📊 Error Monitoring

### Track Errors in Results

```typescript
const result = await engine.process(sections);

// Check overall success
console.log('Success rate:', result.successRate);  // e.g., "80%"

// Get error summary
console.log('Errors:', result.errorSummary);
// {
//   total: 2,
//   byDimension: { sentiment: 1, topics: 1 },
//   byProvider: { anthropic: 2 }
// }

// Get failed sections
result.sections.forEach((section, i) => {
  if (section.error) {
    console.error(`Section ${i} failed:`, section.error);
  }
});
```

---

### Log Errors

```typescript
class LoggingPlugin extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
  
  afterDimensionExecute(context) {
    if (context.error) {
      this.logError({
        dimension: context.dimension,
        section: context.section.metadata.id,
        error: context.error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  logError(data) {
    // Send to logging service
    console.error('[ERROR]', JSON.stringify(data));
  }
}
```

---

## 🔍 Debugging Errors

### Verbose Logging

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  verbose: true  // Enable detailed logging
});
```

**Output:**
```
[dag-ai] Starting process for 3 sections
[dag-ai] Building DAG for dimensions: sentiment, topics, summary
[dag-ai] Execution order: [sentiment, topics], [summary]
[dag-ai] Processing dimension: sentiment (section 0)
[dag-ai] Provider: anthropic, Model: claude-sonnet-4-5-20250929
[dag-ai] Request failed: Rate limit exceeded
[dag-ai] Retrying in 1000ms (attempt 1/3)
...
```

---

### Inspect Failed Requests

```typescript
afterProviderExecute(context) {
  if (context.error) {
    console.log('Failed request:', {
      provider: context.provider,
      model: context.options?.model,
      input: context.input.substring(0, 100),
      error: context.error.message,
      statusCode: context.error.statusCode,
      retryCount: context.retryCount
    });
  }
}
```

---

## 🎯 Best Practices

### 1. Always Configure Fallbacks

```typescript
// ❌ BAD - Single point of failure
selectProvider() {
  return { provider: 'anthropic', options: {} };
}

// ✅ GOOD - Resilient
selectProvider() {
  return {
    provider: 'anthropic',
    fallbacks: [
      { provider: 'openai' },
      { provider: 'gemini' }
    ]
  };
}
```

---

### 2. Use Appropriate Retry Counts

```typescript
// For fast operations (< 1s)
maxRetries: 3

// For slow operations (> 5s)
maxRetries: 2

// For rate-limited APIs
maxRetries: 5  // With exponential backoff
```

---

### 3. Handle Specific Error Types

```typescript
handleDimensionFailure(context) {
  // Rate limit - provide cached result
  if (context.error.message.includes('rate_limit')) {
    const cached = this.cache.get(context.section.content);
    if (cached) {
      return { continueProcessing: true, fallbackResult: cached };
    }
  }
  
  // Invalid content - skip
  if (context.error.message.includes('content_policy')) {
    return { continueProcessing: true, fallbackResult: { data: { skipped: true } } };
  }
  
  // Unknown error - stop
  return { continueProcessing: false };
}
```

---

### 4. Set Appropriate Timeouts

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { anthropic: { apiKey: '...' } },
  timeout: 60000,  // Global: 60s
  dimensionTimeouts: {
    quick_scan: 10000,      // 10s for fast dimensions
    deep_analysis: 120000,  // 120s for slow dimensions
    image_gen: 300000       // 300s for very slow dimensions
  }
});
```

---

### 5. Monitor and Alert

```typescript
handleProcessFailure(context) {
  const errorRate = context.failedSections.length / context.totalSections;
  
  // Alert if > 10% failure rate
  if (errorRate > 0.1) {
    this.sendAlert({
      level: 'critical',
      message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
      failedSections: context.failedSections.length,
      totalSections: context.totalSections,
      errors: context.errors
    });
  }
}
```

---

## 🚀 Production Checklist

Before going to production:

- [ ] Configure provider fallbacks
- [ ] Set appropriate retry counts
- [ ] Set appropriate timeouts
- [ ] Implement error monitoring
- [ ] Test failure scenarios
- [ ] Set up alerting
- [ ] Log errors to external service
- [ ] Handle partial failures gracefully
- [ ] Test with rate limiting
- [ ] Test with network failures

---

## 📚 Real-World Examples

### Example 1: Resilient Sentiment Analysis

```typescript
class ResilientSentiment extends Plugin {
  dimensions = ['sentiment'];
  
  createPrompt(context) {
    return `Analyze sentiment: "${context.sections[0].content}"
      Return JSON: {"sentiment": "positive|negative|neutral", "score": 0-1}`;
  }
  
  selectProvider() {
    return {
      provider: 'anthropic',
      options: { model: 'claude-sonnet-4-5-20250929' },
      fallbacks: [
        { provider: 'openai', options: { model: 'gpt-4o' } },
        { provider: 'gemini', options: { model: 'gemini-pro' } }
      ]
    };
  }
  
  handleDimensionFailure(context) {
    // Provide neutral fallback
    return {
      continueProcessing: true,
      fallbackResult: {
        data: { sentiment: 'neutral', score: 0.5 },
        metadata: { fallback: true, error: context.error.message }
      }
    };
  }
}
```

**Result:** 99.9% success rate (never fails completely)

---

### Example 2: Rate-Limited API

```typescript
class RateLimitedPlugin extends Plugin {
  dimensions = ['analyze'];
  
  cache = new Map();
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
  
  handleRetry(context) {
    if (context.error.message.includes('rate_limit')) {
      // Check cache first
      const cached = this.cache.get(context.section.content);
      if (cached) {
        return { skip: true, result: cached };
      }
      
      // Wait longer for rate limits
      return { delay: 10000 };  // 10 seconds
    }
    
    return { delay: context.defaultDelay };
  }
  
  afterDimensionExecute(context) {
    if (!context.error) {
      // Cache successful results
      this.cache.set(context.section.content, context.result);
    }
  }
}
```

---

### Example 3: Multi-Tier Fallback

```typescript
class MultiTierPlugin extends Plugin {
  dimensions = ['analysis'];
  
  createPrompt(context) {
    return `Analyze: "${context.sections[0].content}"`;
  }
  
  selectProvider(dimension, section) {
    // Try best model first
    if (!section.metadata.failedAttempts) {
      return {
        provider: 'anthropic',
        options: { model: 'claude-sonnet-4-5-20250929' },
        fallbacks: [
          { 
            provider: 'anthropic',
            options: { model: 'claude-haiku-3-5' }  // Cheaper
          }
        ]
      };
    }
    
    // On retry, use faster model
    return {
      provider: 'anthropic',
      options: { model: 'claude-haiku-3-5' }
    };
  }
  
  handleProviderFallback(context) {
    // Track failed attempts
    context.section.metadata.failedAttempts = 
      (context.section.metadata.failedAttempts || 0) + 1;
  }
}
```

---

## 🆘 Common Issues

### Issue: "Rate limit exceeded"

**Solution:**
```typescript
// Increase retry delay
maxRetries: 5,
retryDelay: 5000,  // 5 seconds

// Or use fallback provider
fallbacks: [{ provider: 'openai' }]
```

---

### Issue: "Timeout error"

**Solution:**
```typescript
// Increase timeout
timeout: 120000,  // 120 seconds

// Or per dimension
dimensionTimeouts: {
  slow_dimension: 300000  // 300 seconds
}
```

---

### Issue: "All providers failed"

**Solution:**
```typescript
// Add more fallbacks
selectProvider() {
  return {
    provider: 'anthropic',
    fallbacks: [
      { provider: 'openai' },
      { provider: 'gemini' },
      { provider: 'cohere' }  // Add more options
    ]
  };
}
```

---

## 📖 Next Steps

- [Cost Optimization](/guide/cost-optimization) - Save money with smart error handling
- [Best Practices](/guide/best-practices) - Production-ready patterns
- [API Reference](/api/plugin#error-hooks) - Complete hook documentation

---

## 🔗 Related

- [Hooks System](/lifecycle/hooks) - All lifecycle hooks
- [Provider API](/api/providers) - Provider configuration
- [Examples](/guide/examples) - Working examples
