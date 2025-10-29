---
title: Engine Configuration API
description: Complete reference for DagEngine configuration options
---

# Engine Configuration API

Complete reference for `DagEngine` configuration options.

## Constructor

```typescript
import { DagEngine } from '@dagengine/dag-engine';

const engine = new DagEngine(config: EngineConfig);
```

## Table of Contents

- [Required Fields](#required-fields)
  - [plugin](#plugin)
  - [providers](#providers)
    - [Format 1: Plain Object](#format-1-plain-object-recommended)
    - [Format 2: Pre-configured Adapter](#format-2-pre-configured-adapter)
    - [Format 3: Provider Registry](#format-3-provider-registry)
    - [Gateway Configuration (Portkey)](#gateway-configuration-portkey)
- [Optional Fields](#optional-fields)
  - [execution](#execution)
  - [pricing](#pricing)
  - [progressDisplay](#progressdisplay)
- [ExecutionConfig](#executionconfig)
- [PricingConfig](#pricingconfig)
- [ProgressDisplayOptions](#progressdisplayoptions)
- [Default Values](#default-values)
- [Complete Example](#complete-example)

## Required Fields

### plugin

Your plugin instance that defines dimensions and behavior.

**Type:** `Plugin`

**Required:** Yes

**Description:**  
The plugin is the core of the engine. It defines:
- Available dimensions to execute
- Dependencies between dimensions
- How to create prompts for each dimension
- Provider selection logic for each dimension

**Example:**
```typescript
import { Plugin } from '@dagengine/dag-engine';

class MyPlugin extends Plugin {
  constructor() {
    super('my-plugin', 'My Plugin', 'Plugin description');
    this.dimensions = ['sentiment', 'topics', 'summary'];
  }
  
  createPrompt(context) {
    // Implementation
  }
  
  selectProvider(dimension) {
    // Implementation
  }
}

const engine = new DagEngine({
  plugin: new MyPlugin()
});
```

### providers

Provider configuration - accepts multiple formats for flexibility.

**Type:** `ProviderAdapter | ProviderAdapterConfig | ProviderRegistry`

**Required:** Yes

**Description:**  
Configures which AI providers are available and their API keys. You can provide this in three different formats, all equally supported.

#### Format 1: Plain Object (Recommended)

The simplest and most common format.

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: {
    anthropic: { 
      apiKey: process.env.ANTHROPIC_API_KEY 
    },
    openai: { 
      apiKey: process.env.OPENAI_API_KEY 
    },
    gemini: { 
      apiKey: process.env.GEMINI_API_KEY 
    }
  }
});
```

**Supported Providers:**
- `anthropic` - Claude models (Haiku, Sonnet, Opus)
- `openai` - GPT models (GPT-4o, GPT-4o-mini, etc.)
- `gemini` - Gemini models (Gemini 1.5 Pro, Flash, etc.)

#### Format 2: Pre-configured Adapter

Use when you need more control over provider configuration.

```typescript
import { ProviderAdapter } from '@dagengine/dag-engine';

const adapter = new ProviderAdapter({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
});

// Register additional custom providers
adapter.registerProvider(new CustomProvider());

const engine = new DagEngine({
  plugin: myPlugin,
  providers: adapter
});
```

#### Format 3: Provider Registry

Use for custom providers or advanced scenarios.

```typescript
import { ProviderRegistry, AnthropicProvider } from '@dagengine/dag-engine';

const registry = new ProviderRegistry();
registry.register(new AnthropicProvider({ 
  apiKey: process.env.ANTHROPIC_API_KEY 
}));
registry.register(new CustomProvider());

const engine = new DagEngine({
  plugin: myPlugin,
  providers: registry
});
```

#### Gateway Configuration (Portkey)

Enable unified AI gateway for advanced features like automatic retries, fallbacks, rate limiting, and caching.

**What is Portkey?**  
Portkey is an AI gateway that sits between your application and AI providers, providing:
- **Unified API** - Single interface for all AI providers
- **Automatic Retries** - Built-in retry logic with exponential backoff
- **Load Balancing** - Distribute requests across providers
- **Caching** - Reduce costs and latency with semantic caching
- **Rate Limiting** - Automatic rate limit handling
- **Observability** - Request logging and analytics

**Configuration:**

```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      gateway: 'portkey',
      gatewayApiKey: process.env.PORTKEY_API_KEY,
      gatewayConfig: 'pc-my-config-id'  // Optional: Portkey config ID
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      gateway: 'portkey',
      gatewayApiKey: process.env.PORTKEY_API_KEY
    }
  }
});
```

**Gateway Options:**

- `gateway`: Set to `'portkey'` to enable Portkey gateway
- `gatewayApiKey`: Your Portkey API key from the Portkey dashboard
- `gatewayConfig`: (Optional) Portkey config ID for advanced features like retry policies, load balancing, and caching

**Benefits:**

✅ **Single Retry Strategy**: Gateway handles retries internally - DagEngine makes a single attempt  
✅ **Provider Failover**: Automatic failover between providers configured in Portkey  
✅ **Cost Optimization**: Semantic caching reduces redundant API calls  
✅ **Rate Limit Handling**: Automatic backoff and retry on rate limits  
✅ **Unified Observability**: All provider requests logged in one place

**Example with Config:**

```typescript
// Create a config in Portkey dashboard with:
// - Retry policy: 3 retries with exponential backoff
// - Fallback: Claude Sonnet -> GPT-4o
// - Cache: 1 hour semantic cache

const engine = new DagEngine({
  plugin: myPlugin,
  providers: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      gateway: 'portkey',
      gatewayApiKey: process.env.PORTKEY_API_KEY,
      gatewayConfig: 'pc-claude-with-gpt4-fallback'
    }
  }
});
```

**Direct Mode vs Gateway Mode:**

| Feature | Direct Mode | Gateway Mode (Portkey) |
|---------|-------------|----------------------|
| Retries | Engine handles (configurable) | Gateway handles (via config) |
| Fallbacks | Engine handles (via plugin) | Gateway handles (via config) |
| Rate Limiting | Manual handling | Automatic |
| Caching | Not available | Semantic caching |
| Observability | Basic | Advanced dashboard |
| Complexity | More code | Less code |

**When to Use Gateway:**

✅ Production applications requiring high reliability  
✅ Multi-provider setups with complex fallback logic  
✅ Need for caching to reduce costs  
✅ Want centralized observability across providers

**When to Use Direct Mode:**

✅ Simple single-provider setups  
✅ Development and testing  
✅ Full control over retry logic needed  
✅ No external dependencies preferred

## Optional Fields

### execution

Execution configuration (recommended way to configure behavior).

**Type:** `ExecutionConfig`

**Default:** See [ExecutionConfig](#executionconfig)

**Description:**  
Controls concurrency, retries, timeouts, and error handling. This is the recommended way to configure execution behavior.

**Example:**
```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { ... },
  execution: {
    concurrency: 10,
    maxRetries: 5,
    retryDelay: 2000,
    timeout: 30000,
    continueOnError: false,
    dimensionTimeouts: {
      'slow-task': 120000
    }
  }
});
```

See [ExecutionConfig](#executionconfig) for detailed field descriptions.

### pricing

Pricing configuration for cost tracking.

**Type:** `PricingConfig`

**Default:** `undefined` (no cost tracking)

**Description:**  
When provided, the engine tracks token usage and calculates costs for each dimension and provider. Costs are returned in the `ProcessResult`.

**Example:**
```typescript
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { ... },
  pricing: {
    models: {
      'claude-3-5-haiku-20241022': {
        inputPer1M: 0.80,   // $0.80 per 1M input tokens
        outputPer1M: 4.00   // $4.00 per 1M output tokens
      },
      'claude-3-5-sonnet-20241022': {
        inputPer1M: 3.00,
        outputPer1M: 15.00
      },
      'gpt-4o': {
        inputPer1M: 2.50,
        outputPer1M: 10.00
      },
      'gpt-4o-mini': {
        inputPer1M: 0.15,
        outputPer1M: 0.60
      }
    }
  }
});
```

**Result Access:**
```typescript
const result = await engine.process(sections);

console.log(result.costs);
// {
//   totalCost: 0.0282,
//   totalTokens: 12289,
//   byDimension: {
//     sentiment: { cost: 0.0015, tokens: {...}, model: 'Haiku', provider: 'anthropic' },
//     topics: { cost: 0.0011, ... }
//   },
//   byProvider: {
//     anthropic: { cost: 0.0282, tokens: {...}, models: ['Haiku', 'Sonnet'] }
//   },
//   currency: 'USD'
// }
```

See [PricingConfig](#pricingconfig) for the interface.

### progressDisplay

Progress display configuration.

**Type:** `ProgressDisplayOptions | boolean`

**Default:** `undefined` (no progress display)

**Description:**  
Controls whether and how progress is displayed during processing.

**Examples:**

```typescript
// Enable default progress bar
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { ... },
  progressDisplay: true
});

// Custom progress display
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { ... },
  progressDisplay: {
    display: 'bar',           // 'simple' | 'bar' | 'multi' | 'none'
    showDimensions: true,
    throttleMs: 100
  }
});

// Disable progress display
const engine = new DagEngine({
  plugin: myPlugin,
  providers: { ... },
  progressDisplay: false
});
```

See [ProgressDisplayOptions](#progressdisplayoptions) for detailed options.

## ExecutionConfig

Configuration for execution behavior.

```typescript
interface ExecutionConfig {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  continueOnError?: boolean;
  timeout?: number;
  dimensionTimeouts?: Record<string, number>;
  pricing?: PricingConfig;
}
```

### concurrency

Maximum number of dimensions to execute concurrently.

**Type:** `number`

**Default:** `5`

**Range:** `1-100`

**Description:**  
Controls how many dimensions can run simultaneously. Higher values increase throughput but consume more resources.

**Example:**
```typescript
{
  execution: {
    concurrency: 10  // Process 10 dimensions simultaneously
  }
}
```

**Performance Impact:**
- Low value (1-3): Sequential processing, slower but less resource-intensive
- Medium value (5-10): Balanced throughput and resource usage
- High value (15+): Maximum throughput, requires sufficient resources

### maxRetries

Maximum number of retry attempts for failed operations.

**Type:** `number`

**Default:** `3`

**Range:** `0-10`

**Description:**  
Number of times to retry a failed dimension execution before giving up.

**Example:**
```typescript
{
  execution: {
    maxRetries: 5  // Retry up to 5 times
  }
}
```

**Retry Behavior:**
- Uses exponential backoff: `retryDelay * 2^attempt`
- First retry: `retryDelay` ms
- Second retry: `retryDelay * 2` ms
- Third retry: `retryDelay * 4` ms
- And so on...

**Note:** When using Portkey gateway, retries are handled by the gateway and this setting has less impact.

### retryDelay

Base delay between retry attempts in milliseconds.

**Type:** `number`

**Default:** `1000` (1 second)

**Description:**  
Base delay for exponential backoff. Actual delay doubles with each retry attempt.

**Example:**
```typescript
{
  execution: {
    maxRetries: 3,
            retryDelay: 2000  // First retry after 2s, second after 4s, third after 8s
  }
}
```

**Calculation:**
```
Attempt 1: retryDelay * 2^0 = 2000ms
Attempt 2: retryDelay * 2^1 = 4000ms
Attempt 3: retryDelay * 2^2 = 8000ms
```

### continueOnError

Whether to continue execution when a dimension fails.

**Type:** `boolean`

**Default:** `true`

**Description:**  
Controls engine behavior when a dimension fails after all retries.

**Values:**
- `true` - Continue processing other dimensions, return partial results
- `false` - Stop immediately on first failure, throw error

**Example:**
```typescript
{
  execution: {
    continueOnError: false  // Stop on first error
  }
}
```

**Use Cases:**
- `true`: Analytics workflows where partial results are valuable
- `false`: Critical workflows where all dimensions must succeed

### timeout

Default timeout for dimension execution in milliseconds.

**Type:** `number`

**Default:** `60000` (60 seconds)

**Range:** `1000-600000` (1 second to 10 minutes)

**Description:**  
Default timeout applied to all dimensions unless overridden by `dimensionTimeouts`.

**Example:**
```typescript
{
  execution: {
    timeout: 30000  // 30 second default timeout
  }
}
```

**Timeout Behavior:**
- Dimension exceeds timeout → Treated as error
- Triggers retry logic (if retries available)
- If all retries timeout → `handleDimensionFailure` called

### dimensionTimeouts

Dimension-specific timeout overrides.

**Type:** `Record<string, number>`

**Default:** `{}`

**Description:**  
Override the default timeout for specific dimensions. Useful when some dimensions require more time.

**Example:**
```typescript
{
  execution: {
    timeout: 30000,  // Default 30s for most dimensions
            dimensionTimeouts: {
      'deep-analysis': 120000,    // 2 minutes for deep analysis
              'quick-check': 5000,        // 5 seconds for quick check
              'image-processing': 180000, // 3 minutes for images
              'video-analysis': 300000    // 5 minutes for videos
    }
  }
}
```

**Priority:**
1. `dimensionTimeouts[dimensionName]` (highest priority)
2. `execution.timeout` (default fallback)
3. `60000ms` (system default)

### pricing

Pricing configuration for cost tracking (can also be set at top level).

**Type:** `PricingConfig`

**Default:** `undefined`

**Description:**  
When specified here, it takes precedence over top-level `pricing` configuration.

**Example:**
```typescript
{
  execution: {
    pricing: {
      models: {
        'claude-3-5-sonnet-20241022': {
          inputPer1M: 3.00,
                  outputPer1M: 15.00
        }
      }
    }
  }
}
```

## PricingConfig

Configuration for cost tracking.

```typescript
interface PricingConfig {
  models: Record<string, ModelPricing>;
  lastUpdated?: string;
}

interface ModelPricing {
  inputPer1M: number;   // Cost per 1M input tokens (USD)
  outputPer1M: number;  // Cost per 1M output tokens (USD)
}
```

### Example

```typescript
const pricing: PricingConfig = {
  models: {
    // Anthropic Models
    'claude-3-5-haiku-20241022': {
      inputPer1M: 0.80,
      outputPer1M: 4.00
    },
    'claude-3-5-sonnet-20241022': {
      inputPer1M: 3.00,
      outputPer1M: 15.00
    },
    'claude-3-opus-20240229': {
      inputPer1M: 15.00,
      outputPer1M: 75.00
    },

    // OpenAI Models
    'gpt-4o': {
      inputPer1M: 2.50,
      outputPer1M: 10.00
    },
    'gpt-4o-mini': {
      inputPer1M: 0.15,
      outputPer1M: 0.60
    },
    'gpt-4-turbo': {
      inputPer1M: 10.00,
      outputPer1M: 30.00
    },

    // Google Gemini Models
    'gemini-1.5-pro': {
      inputPer1M: 1.25,
      outputPer1M: 5.00
    },
    'gemini-1.5-flash': {
      inputPer1M: 0.075,
      outputPer1M: 0.30
    }
  },
  lastUpdated: '2024-01-15'
};
```

## ProgressDisplayOptions

Configuration for progress display during execution.

```typescript
interface ProgressDisplayOptions {
  display?: 'simple' | 'bar' | 'multi' | 'none';
  format?: string;
  showDimensions?: boolean;
  throttleMs?: number;
}
```

### display

Display style for progress.

**Type:** `'simple' | 'bar' | 'multi' | 'none'`

**Default:** `'bar'`

**Options:**
- `'simple'` - Single line text output (no dependencies required)
- `'bar'` - Single progress bar (requires `cli-progress`)
- `'multi'` - Multiple bars, one per dimension (requires `cli-progress`)
- `'none'` - No display

**Example:**
```typescript
{
  progressDisplay: {
    display: 'multi'  // Show progress bar for each dimension
  }
}
```

### format

Custom format string for progress bar.

**Type:** `string`

**Default:** `'Progress |{bar}| {percentage}% | {value}/{total} | ${cost} | ETA: {eta}s'`

**Description:**  
Custom format for progress bar display. Available tokens:
- `{bar}` - Progress bar
- `{percentage}` - Percentage complete
- `{value}` - Current value
- `{total}` - Total value
- `{cost}` - Current cost
- `{eta}` - Estimated time remaining
- `{dimension}` - Current dimension (for multi-bar)

**Example:**
```typescript
{
  progressDisplay: {
    display: 'bar',
            format: '{bar} | {percentage}% | Cost: ${cost} | ETA: {eta}s'
  }
}
```

### showDimensions

Show dimension names in progress output.

**Type:** `boolean`

**Default:** `true`

**Description:**  
Whether to display dimension names in progress output.

**Example:**
```typescript
{
  progressDisplay: {
    showDimensions: false  // Hide dimension names
  }
}
```

### throttleMs

Update frequency (throttle) in milliseconds.

**Type:** `number`

**Default:** `100`

**Description:**  
Minimum time between progress updates. Higher values reduce CPU usage but make progress appear less smooth.

**Example:**
```typescript
{
  progressDisplay: {
    throttleMs: 250  // Update every 250ms
  }
}
```

## Default Values

```typescript
const DEFAULT_EXECUTION_CONFIG = {
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
  continueOnError: true,
  timeout: 60000,
  dimensionTimeouts: {}
};
```

**Accessing defaults:**
```typescript
import { DEFAULT_EXECUTION_CONFIG } from '@dagengine/dag-engine';

const myConfig = {
  ...DEFAULT_EXECUTION_CONFIG,
  concurrency: 10  // Override just what you need
};
```

## Complete Example

```typescript
import { DagEngine } from '@dagengine/dag-engine';
import { MyPlugin } from './my-plugin';

const engine = new DagEngine({
  // ============================================================================
  // REQUIRED
  // ============================================================================

  plugin: new MyPlugin(),

  providers: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Optional: Enable Portkey gateway
      gateway: 'portkey',
      gatewayApiKey: process.env.PORTKEY_API_KEY,
      gatewayConfig: 'pc-my-retry-config'
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      gateway: 'portkey',
      gatewayApiKey: process.env.PORTKEY_API_KEY
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY
    }
  },

  // ============================================================================
  // EXECUTION CONFIGURATION
  // ============================================================================

  execution: {
    // Concurrency: Process 10 dimensions simultaneously
    concurrency: 10,

    // Retries: Retry up to 5 times with 2s base delay
    maxRetries: 5,
    retryDelay: 2000,

    // Timeouts: 30s default, custom for specific dimensions
    timeout: 30000,
    dimensionTimeouts: {
      'deep-analysis': 120000,    // 2 minutes
      'image-processing': 180000, // 3 minutes
      'quick-check': 5000         // 5 seconds
    },

    // Error handling: Stop on first error
    continueOnError: false
  },

  // ============================================================================
  // COST TRACKING
  // ============================================================================

  pricing: {
    models: {
      'claude-3-5-haiku-20241022': {
        inputPer1M: 0.80,
        outputPer1M: 4.00
      },
      'claude-3-5-sonnet-20241022': {
        inputPer1M: 3.00,
        outputPer1M: 15.00
      },
      'gpt-4o': {
        inputPer1M: 2.50,
        outputPer1M: 10.00
      },
      'gpt-4o-mini': {
        inputPer1M: 0.15,
        outputPer1M: 0.60
      }
    }
  },

  // ============================================================================
  // PROGRESS DISPLAY
  // ============================================================================

  progressDisplay: {
    display: 'bar',
    showDimensions: true,
    throttleMs: 100
  }
});

// Process sections
const result = await engine.process(sections);

// Access costs
console.log('Total cost:', result.costs?.totalCost);
console.log('By dimension:', result.costs?.byDimension);
console.log('By provider:', result.costs?.byProvider);
```