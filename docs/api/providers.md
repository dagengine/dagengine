---
title: Providers
description: API reference for provider system
---

# Providers

Provider system for AI services.

## Import

```typescript
import { ProviderAdapter } from '@ivan629/dag-ai';
```

## ProviderAdapter

Main interface for managing providers.

### Constructor

```typescript
new ProviderAdapter(config?: ProviderAdapterConfig)
```

### Configuration

```typescript
interface ProviderAdapterConfig {
  anthropic?: { apiKey: string; [key: string]: unknown };
  openai?: { apiKey: string; [key: string]: unknown };
  gemini?: { apiKey: string; [key: string]: unknown };
}
```

### Example

```typescript
const adapter = new ProviderAdapter({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  openai: { apiKey: process.env.OPENAI_API_KEY },
  gemini: { apiKey: process.env.GEMINI_API_KEY }
});
```

## Methods

### execute()

Execute request using specified provider:

```typescript
async execute(
  providerName: string,
  request: ProviderRequest
): Promise<ProviderResponse>
```

#### Example

```typescript
const response = await adapter.execute('anthropic', {
  input: 'Analyze sentiment: "I love this!"',
  options: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.1
  }
});

console.log(response.data);
console.log(response.metadata.tokens);
```

### registerProvider()

Register custom provider:

```typescript
registerProvider(provider: BaseProvider): void
```

### hasProvider()

Check if provider exists:

```typescript
hasProvider(name: string): boolean
```

### listProviders()

Get all provider names:

```typescript
listProviders(): string[]
```

## Built-in Providers

All providers automatically parse responses as JSON and return structured data.

### Anthropic

**Configuration:**
```typescript
anthropic: {
  apiKey: string;
  [key: string]: unknown;  // Additional provider-specific options
}
```

**Example:**
```typescript
const response = await adapter.execute('anthropic', {
  input: 'Analyze: "Great product!"',
  options: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.1,
    max_tokens: 4096
  }
});
```

**Available options depend on the API.** See official documentation:
- [Anthropic API Documentation](https://docs.anthropic.com)
- [Anthropic Pricing](https://www.anthropic.com/pricing)


### OpenAI

**Configuration:**
```typescript
openai: {
  apiKey: string;
  [key: string]: unknown;  // Additional provider-specific options
}
```

**Example:**
```typescript
const response = await adapter.execute('openai', {
  input: 'Extract topics: "AI and ML trends"',
  options: {
    model: 'gpt-4o',
    temperature: 0.1,
    max_tokens: 4096
  }
});
```

**Available options depend on the API.** See official documentation:
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Pricing](https://openai.com/pricing)


### Gemini

**Configuration:**
```typescript
gemini: {
  apiKey: string;
  baseUrl?: string;
  [key: string]: unknown;  // Additional provider-specific options
}
```

**Example:**
```typescript
const response = await adapter.execute('gemini', {
  input: 'Summarize: "Long text..."',
  options: {
    model: 'gemini-1.5-pro',
    temperature: 0,
    max_tokens: 4096
  }
});
```

**Note:** Gemini does not support batch inputs (arrays). Process one input at a time.

**Available options depend on the API.** See official documentation:
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini Pricing](https://ai.google.dev/pricing)


## Custom Providers

### Creating a Custom Provider

Extend `BaseProvider` to create custom providers:

```typescript
import { BaseProvider, ProviderRequest, ProviderResponse } from '@ivan629/dag-ai';

class CustomProvider extends BaseProvider {
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    super('custom-provider', config);
    this.apiKey = config.apiKey;
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      const response = await fetch('https://api.example.com', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: request.input,
          ...request.options
        })
      });

      if (!response.ok) {
        return { error: `API error: ${response.statusText}` };
      }

      const data = await response.json();

      return {
        data: data.result,
        metadata: {
          provider: 'custom-provider',
          tokens: {
            inputTokens: data.usage?.input || 0,
            outputTokens: data.usage?.output || 0,
            totalTokens: data.usage?.total || 0
          }
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
```

### Register Custom Provider

```typescript
const adapter = new ProviderAdapter({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
});

// Register your custom provider
adapter.registerProvider(new CustomProvider({
  apiKey: process.env.CUSTOM_API_KEY
}));

// Use it like any built-in provider
const response = await adapter.execute('custom-provider', {
  input: 'test',
  options: { model: 'custom-model' }
});
```

### Use in Plugin

```typescript
class MyPlugin extends Plugin {
  selectProvider(dimension: string): ProviderSelection {
    return {
      provider: 'custom-provider',
      options: { model: 'custom-model' },
      fallbacks: [
        { provider: 'anthropic' }
      ]
    };
  }
}
```

## Provider Selection

### Basic

```typescript
selectProvider() {
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }
  };
}
```

### With Fallbacks

```typescript
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

### Dynamic Selection

```typescript
selectProvider(dimension, section) {
  // Route by dimension
  if (dimension === 'quick_filter') {
    return { provider: 'gemini', options: { model: 'gemini-2.5-flash' } };
  }
  
  // Route by content length
  if (section && section.content.length > 10000) {
    return { provider: 'anthropic', options: { model: 'claude-opus-4' } };
  }
  
  // Default
  return { provider: 'anthropic', options: { model: 'claude-sonnet-4-5-20250929' } };
}
```

## Types

### ProviderRequest

```typescript
interface ProviderRequest {
  input: string | string[];
  options?: Record<string, unknown>;
  dimension?: string;
  isGlobal?: boolean;
  metadata?: {
    sectionIndex?: number;
    totalSections?: number;
    [key: string]: unknown;
  };
}
```

### ProviderResponse

```typescript
interface ProviderResponse<T = unknown> {
  data?: T;
  error?: string;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    [key: string]: unknown;
  };
}
```

## Provider Resources

- **Anthropic:** [docs.anthropic.com](https://docs.anthropic.com) | [Pricing](https://www.anthropic.com/pricing)
- **OpenAI:** [platform.openai.com/docs](https://platform.openai.com/docs) | [Pricing](https://openai.com/pricing)
- **Gemini:** [ai.google.dev/docs](https://ai.google.dev/docs) | [Pricing](https://ai.google.dev/pricing)

## Next Steps

- [DagEngine API](/api/engine) - Engine configuration
- [Plugin API](/api/plugin) - Plugin methods
- [Quick Start](/guide/quick-start) - Build your first workflow
- [Examples](/guide/examples) - Real-world usage
