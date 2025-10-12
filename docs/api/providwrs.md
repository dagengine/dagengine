---
title: Providers API
description: Complete API reference for provider system
---

# Providers API Reference

Complete guide to the provider system, built-in providers, and custom provider creation.

---

## 📋 Overview

**The Provider System** handles communication with AI and data services.

**Key Components:**
- ✅ **ProviderAdapter** - Unified interface to all providers
- ✅ **ProviderRegistry** - Registry for managing providers
- ✅ **BaseProvider** - Abstract class for custom providers
- ✅ **Built-in Providers** - 5 ready-to-use providers

**Architecture:**
```
Plugin → selectProvider() → ProviderAdapter → Specific Provider → AI/Data Service
```

---

## 🔧 ProviderAdapter

The main interface for managing and executing requests across providers.

### Constructor

**Signature:**
```typescript
new ProviderAdapter(config?: ProviderAdapterConfig)
```

**Config:**
```typescript
interface ProviderAdapterConfig {
  anthropic?: AnthropicConfig;
  openai?: OpenAIConfig;
  gemini?: GeminiConfig;
  tavily?: TavilyConfig;
  whoisxml?: WhoisXMLConfig;
}

interface AnthropicConfig {
  apiKey: string;  // Required
}

interface OpenAIConfig {
  apiKey: string;  // Required
}

interface GeminiConfig {
  apiKey: string;      // Required
  baseUrl?: string;    // Optional
}

interface TavilyConfig {
  apiKey: string;      // Required
  endpoint?: string;   // Optional
}

interface WhoisXMLConfig {
  apiKey: string;      // Required
  cacheTTL?: number;   // Optional: milliseconds, default 86400000 (24h)
}
```

**Examples:**

**Basic Setup:**
```typescript
import { ProviderAdapter } from '@ivan629/dag-ai';

const adapter = new ProviderAdapter({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  openai: { apiKey: process.env.OPENAI_API_KEY }
});
```

**All Providers:**
```typescript
const adapter = new ProviderAdapter({
  anthropic: { 
    apiKey: process.env.ANTHROPIC_API_KEY 
  },
  openai: { 
    apiKey: process.env.OPENAI_API_KEY 
  },
  gemini: { 
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: 'https://custom-endpoint.example.com'  // Optional
  },
  tavily: { 
    apiKey: process.env.TAVILY_API_KEY,
    endpoint: 'https://api.tavily.com/search'  // Optional
  },
  whoisxml: { 
    apiKey: process.env.WHOISXML_API_KEY,
    cacheTTL: 3600000  // 1 hour cache
  }
});
```

**Factory Function:**
```typescript
import { createProviderAdapter } from '@ivan629/dag-ai';

const adapter = createProviderAdapter({
  anthropic: { apiKey: '...' },
  openai: { apiKey: '...' }
});
```

---

### Methods

#### `execute()`

Execute a request using specified provider.

**Signature:**
```typescript
async execute(
  providerName: string,
  request: ProviderRequest
): Promise<ProviderResponse>
```

**Request:**
```typescript
interface ProviderRequest {
  input: string | string[];           // Single or batch
  options?: Record<string, any>;      // Provider-specific
  dimension?: string;                 // For metadata
  isGlobal?: boolean;                 // Scope info
  metadata?: Record<string, any>;     // Custom data
}
```

**Response:**
```typescript
interface ProviderResponse<T = unknown> {
  data?: T;                           // Parsed result
  error?: string;                     // Error if failed
  metadata?: ProviderMetadata;
}

interface ProviderMetadata {
  model?: string;
  provider?: string;
  tokens?: TokenUsage;
  [key: string]: unknown;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

**Examples:**

**Simple Request:**
```typescript
const response = await adapter.execute('anthropic', {
  input: 'Analyze sentiment: "I love this product!"',
  options: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.1
  }
});

console.log(response.data);
// { sentiment: 'positive', score: 0.95 }

console.log(response.metadata);
// {
//   model: 'claude-sonnet-4-5-20250929',
//   provider: 'anthropic',
//   tokens: { inputTokens: 25, outputTokens: 12, totalTokens: 37 }
// }
```

**With Metadata:**
```typescript
const response = await adapter.execute('openai', {
  input: 'Extract entities: "Apple CEO Tim Cook..."',
  options: { model: 'gpt-4o' },
  dimension: 'entities',
  metadata: {
    sectionIndex: 0,
    totalSections: 10,
    userId: 'user123'
  }
});
```

**Batch Request (Tavily, WhoisXML):**
```typescript
// Search multiple queries
const response = await adapter.execute('tavily', {
  input: ['AI news', 'ML trends', 'GPT updates'],
  options: { maxResults: 5 }
});

// Query multiple domains
const response = await adapter.execute('whoisxml', {
  input: ['example.com', 'google.com', 'github.com']
});
```

**Error Handling:**
```typescript
try {
  const response = await adapter.execute('anthropic', request);
  
  if (response.error) {
    console.error('Provider error:', response.error);
  } else {
    console.log('Success:', response.data);
  }
} catch (error) {
  console.error('Execution error:', error);
}
```

**Throws:**
- Provider not found
- Invalid request format
- Network errors
- API errors

---

#### `registerProvider()`

Register a custom provider.

**Signature:**
```typescript
registerProvider(provider: BaseProvider): void
```

**Example:**
```typescript
import { BaseProvider } from '@ivan629/dag-ai';

class CustomProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('custom', config);
  }
  
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    // Your implementation
    return { data: { result: 'success' } };
  }
}

const adapter = new ProviderAdapter({
  anthropic: { apiKey: '...' }
});

adapter.registerProvider(new CustomProvider({ apiKey: '...' }));

// Now available
const response = await adapter.execute('custom', { input: 'test' });
```

**See:** [Custom Providers](#custom-providers)

---

#### `hasProvider()`

Check if provider is registered.

**Signature:**
```typescript
hasProvider(name: string): boolean
```

**Example:**
```typescript
if (adapter.hasProvider('anthropic')) {
  console.log('Anthropic is available');
}

if (!adapter.hasProvider('gemini')) {
  console.log('Gemini not configured');
}
```

---

#### `listProviders()`

Get all registered provider names.

**Signature:**
```typescript
listProviders(): string[]
```

**Example:**
```typescript
const providers = adapter.listProviders();
console.log('Available providers:', providers);
// ['anthropic', 'openai', 'gemini', 'tavily', 'whoisxml']
```

---

#### `getProvider()`

Get provider instance directly (advanced).

**Signature:**
```typescript
getProvider(name: string): BaseProvider
```

**Example:**
```typescript
const anthropic = adapter.getProvider('anthropic');

// Access provider-specific methods
const response = await anthropic.execute({
  input: 'test',
  options: { model: 'claude-sonnet-4-5-20250929' }
});
```

**Throws:** If provider not found

---

#### `getRegistry()`

Get underlying ProviderRegistry (advanced).

**Signature:**
```typescript
getRegistry(): ProviderRegistry
```

**Example:**
```typescript
const registry = adapter.getRegistry();

// Direct registry operations
registry.register(new CustomProvider());
console.log(registry.list());
```

---

## 📦 Built-in Providers

### AnthropicProvider

Claude models from Anthropic.

**Import:**
```typescript
import { AnthropicProvider } from '@ivan629/dag-ai';
```

**Configuration:**
```typescript
anthropic: {
  apiKey: string  // Required
}
```

**Supported Models:**
- `claude-sonnet-4-5-20250929` (default) - Most balanced
- `claude-opus-4` - Most capable
- `claude-4` - Fast and smart
- `claude-haiku-3-5` - Fastest, cheapest

**Options:**
```typescript
options: {
  model?: string;        // Default: 'claude-sonnet-4-5-20250929'
  maxTokens?: number;    // Default: 4096
  temperature?: number;  // 0.0 - 1.0, default: 1.0
}
```

**Example:**
```typescript
const response = await adapter.execute('anthropic', {
  input: 'Analyze sentiment: "I love this!"',
  options: {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 2000,
    temperature: 0.1
  }
});
```

**Response:**
```json
{
  "data": {
    "sentiment": "positive",
    "score": 0.95
  },
  "metadata": {
    "model": "claude-sonnet-4-5-20250929",
    "provider": "anthropic",
    "tokens": {
      "inputTokens": 150,
      "outputTokens": 50,
      "totalTokens": 200
    }
  }
}
```

**Features:**
- ✅ Automatic JSON parsing
- ✅ Token usage tracking
- ✅ Error handling
- ✅ Rate limit detection

**Pricing (as of Jan 2025):**
- **claude-sonnet-4-5-20250929**: $3/$15 per 1M tokens (input/output)
- **claude-opus-4**: $15/$75 per 1M tokens
- **claude-haiku-3-5**: $0.25/$1.25 per 1M tokens

---

### OpenAIProvider

GPT models from OpenAI.

**Import:**
```typescript
import { OpenAIProvider } from '@ivan629/dag-ai';
```

**Configuration:**
```typescript
openai: {
  apiKey: string  // Required
}
```

**Supported Models:**
- `gpt-4o` (default) - Multimodal, most capable
- `gpt-4o-mini` - Fast, affordable
- `gpt-4-turbo` - Previous generation
- `gpt-3.5-turbo` - Legacy, cheapest

**Options:**
```typescript
options: {
  model?: string;        // Default: 'gpt-4o'
  maxTokens?: number;    // Default: 4096
  temperature?: number;  // Default: 0.1
}
```

**Example:**
```typescript
const response = await adapter.execute('openai', {
  input: 'Extract topics: "AI and machine learning trends..."',
  options: {
    model: 'gpt-4o',
    maxTokens: 1000,
    temperature: 0.2
  }
});
```

**Response:**
```json
{
  "data": {
    "topics": ["AI", "machine learning", "trends"]
  },
  "metadata": {
    "model": "gpt-4o",
    "provider": "openai",
    "tokens": {
      "inputTokens": 200,
      "outputTokens": 30,
      "totalTokens": 230
    }
  }
}
```

**Features:**
- ✅ Automatic JSON parsing
- ✅ Token usage tracking
- ✅ Chat completions API
- ✅ Function calling support

**Pricing (as of Jan 2025):**
- **gpt-4o**: $2.50/$10 per 1M tokens
- **gpt-4o-mini**: $0.15/$0.60 per 1M tokens
- **gpt-3.5-turbo**: $0.50/$1.50 per 1M tokens

---

### GeminiProvider

Gemini models from Google.

**Import:**
```typescript
import { GeminiProvider } from '@ivan629/dag-ai';
```

**Configuration:**
```typescript
gemini: {
  apiKey: string;      // Required
  baseUrl?: string;    // Optional: Custom endpoint
}
```

**Supported Models:**
- `gemini-1.5-pro` (default) - Most capable
- `gemini-1.5-flash` - Fast, affordable

**Options:**
```typescript
options: {
  model?: string;        // Default: 'gemini-1.5-pro'
  maxTokens?: number;    // Default: 4096 (called maxOutputTokens)
  temperature?: number;  // Default: 0.1
  topP?: number;         // Nucleus sampling
  topK?: number;         // Top-k sampling
}
```

**Example:**
```typescript
const response = await adapter.execute('gemini', {
  input: 'Summarize: "Long article text..."',
  options: {
    model: 'gemini-1.5-flash',  // Cheaper model
    maxTokens: 500,
    temperature: 0
  }
});
```

**Response:**
```json
{
  "data": {
    "summary": "Brief summary text..."
  },
  "metadata": {
    "model": "gemini-1.5-flash",
    "provider": "gemini",
    "tokens": {
      "inputTokens": 1500,
      "outputTokens": 100,
      "totalTokens": 1600
    },
    "finishReason": "STOP",
    "safetyRatings": [
      {
        "category": "HARM_CATEGORY_HARASSMENT",
        "probability": "NEGLIGIBLE"
      }
    ]
  }
}
```

**Features:**
- ✅ Automatic JSON mode
- ✅ Safety filters
- ✅ Token usage tracking
- ✅ Content blocking detection

**Safety Filters:**
Gemini includes safety ratings:
- `HARM_CATEGORY_HARASSMENT`
- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_DANGEROUS_CONTENT`

**Finish Reasons:**
- `STOP` - Normal completion
- `MAX_TOKENS` - Truncated (warns but returns data)
- `SAFETY` - Blocked by safety filters
- `RECITATION` - Too similar to training data

**Error Handling:**
```typescript
const response = await adapter.execute('gemini', request);

if (response.error) {
  if (response.error.includes('blocked by safety filters')) {
    // Handle safety block
  }
  if (response.error.includes('Content was blocked')) {
    // Handle content block
  }
}
```

**Pricing (as of Jan 2025):**
- **gemini-1.5-pro**: $1.25/$5 per 1M tokens
- **gemini-1.5-flash**: $0.075/$0.30 per 1M tokens

**Note:** Gemini does NOT support batch input (arrays). Single strings only.

---

### TavilyProvider

Web search API.

**Import:**
```typescript
import { TavilyProvider } from '@ivan629/dag-ai';
```

**Configuration:**
```typescript
tavily: {
  apiKey: string;      // Required
  endpoint?: string;   // Optional: Default 'https://api.tavily.com/search'
}
```

**Options:**
```typescript
options: {
  maxResults?: number;                    // Default: 5 (max: 20)
  searchDepth?: 'basic' | 'advanced';     // Default: 'advanced'
}
```

**Input:**
- Single query: `string`
- Multiple queries: `string[]` (batch)

**Example:**

**Single Query:**
```typescript
const response = await adapter.execute('tavily', {
  input: 'latest AI news',
  options: {
    maxResults: 5,
    searchDepth: 'advanced'
  }
});
```

**Batch Queries:**
```typescript
const response = await adapter.execute('tavily', {
  input: [
    'AI trends 2025',
    'machine learning news',
    'GPT-5 release date'
  ],
  options: { maxResults: 3 }
});
```

**Response:**
```typescript
interface TavilyResult {
  title: string;
  url: string;
  content: string;          // Summary/snippet
  score: number;            // Relevance score
  domain?: string;
  publishedDate?: string;
}
```

**Example Response:**
```json
{
  "data": [
    {
      "title": "OpenAI Announces GPT-5",
      "url": "https://example.com/news/gpt5",
      "content": "OpenAI today announced...",
      "score": 0.95,
      "domain": "example.com",
      "publishedDate": "2025-01-15"
    },
    {
      "title": "AI Industry Report 2025",
      "url": "https://example.com/report",
      "content": "The AI industry saw...",
      "score": 0.88
    }
  ],
  "metadata": {
    "totalQueries": 1,
    "totalResults": 2
  }
}
```

**Use Cases:**
- News aggregation
- Market research
- Content discovery
- Fact checking
- Competitive analysis

**Pricing:**
Check [Tavily pricing](https://tavily.com/pricing)

---

### WhoisXMLProvider

Domain registration data.

**Import:**
```typescript
import { WhoisXMLProvider } from '@ivan629/dag-ai';
```

**Configuration:**
```typescript
whoisxml: {
  apiKey: string;      // Required
  cacheTTL?: number;   // Optional: Cache duration in ms, default: 86400000 (24h)
}
```

**Input:**
- Single domain: `string` (e.g., `'example.com'`)
- Multiple domains: `string[]` (batch)

**Example:**

**Single Domain:**
```typescript
const response = await adapter.execute('whoisxml', {
  input: 'example.com'
});
```

**Batch Domains:**
```typescript
const response = await adapter.execute('whoisxml', {
  input: ['example.com', 'google.com', 'github.com']
});
```

**Response:**
```typescript
interface WhoisData {
  domain: string;
  estimatedDomainAge: number | null;  // Age in days
  createdDate: string | null;         // ISO date
  expiresDate: string | null;         // ISO date
  registrar: string | null;
  success: boolean;
}
```

**Example Response:**
```json
{
  "data": [
    {
      "domain": "example.com",
      "estimatedDomainAge": 9500,
      "createdDate": "1995-08-14T04:00:00Z",
      "expiresDate": "2025-08-13T04:00:00Z",
      "registrar": "RESERVED-Internet Assigned Numbers Authority",
      "success": true
    }
  ]
}
```

**Caching:**
- Results cached in memory for `cacheTTL` duration
- Default: 24 hours
- Clear cache:
```typescript
const whoisProvider = adapter.getProvider('whoisxml');
whoisProvider.clearCache();
```

**Use Cases:**
- Domain age verification
- Brand protection
- Due diligence
- Competitor research
- Domain availability

**Pricing:**
Check [WhoisXML pricing](https://www.whoisxmlapi.com/pricing)

---

## 🛠️ Custom Providers

### BaseProvider

Abstract class for creating custom providers.

**Import:**
```typescript
import { BaseProvider, ProviderRequest, ProviderResponse, ProviderConfig } from '@ivan629/dag-ai';
```

**Definition:**
```typescript
abstract class BaseProvider {
  public readonly name: string;
  protected readonly config: ProviderConfig;

  constructor(name: string, config: ProviderConfig);
  
  abstract execute(request: ProviderRequest): Promise<ProviderResponse>;
}
```

---

### Creating a Custom Provider

**Step 1: Extend BaseProvider**

```typescript
import { BaseProvider, ProviderRequest, ProviderResponse, ProviderConfig } from '@ivan629/dag-ai';

interface MyProviderConfig extends ProviderConfig {
  apiKey: string;
  endpoint?: string;
  customOption?: string;
}

class MyCustomProvider extends BaseProvider {
  private apiKey: string;
  private endpoint: string;

  constructor(config: MyProviderConfig) {
    super('my-custom-provider', config);
    
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'https://api.example.com';
    
    if (!this.apiKey) {
      throw new Error('API key required');
    }
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      // 1. Build API request
      const response = await fetch(this.endpoint, {
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

      // 2. Handle errors
      if (!response.ok) {
        return {
          error: `API error: ${response.statusText}`
        };
      }

      // 3. Parse response
      const data = await response.json();

      // 4. Return standardized format
      return {
        data: data.result,
        metadata: {
          model: request.options?.model || 'default',
          provider: 'my-custom-provider',
          tokens: {
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0
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

**Step 2: Register with Adapter**

```typescript
const adapter = new ProviderAdapter({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
});

// Register custom provider
adapter.registerProvider(
  new MyCustomProvider({
    apiKey: process.env.MY_API_KEY,
    endpoint: 'https://api.example.com',
    customOption: 'value'
  })
);

// Now available
const response = await adapter.execute('my-custom-provider', {
  input: 'test',
  options: { model: 'custom-model' }
});
```

**Step 3: Use in Plugin**

```typescript
class MyPlugin extends Plugin {
  selectProvider(dimension: string): ProviderSelection {
    return {
      provider: 'my-custom-provider',
      options: {
        model: 'custom-model',
        temperature: 0.5
      },
      fallbacks: [
        { provider: 'anthropic', options: {} }
      ]
    };
  }
}
```

---

### Advanced Custom Provider Examples

#### Example 1: Database Provider

```typescript
class DatabaseProvider extends BaseProvider {
  private db: Database;

  constructor(config: { connectionString: string }) {
    super('database', config);
    this.db = new Database(config.connectionString);
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      const query = request.input as string;
      const results = await this.db.query(query);
      
      return {
        data: results,
        metadata: {
          provider: 'database',
          rowCount: results.length
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Database error'
      };
    }
  }
}
```

---

#### Example 2: REST API Provider

```typescript
class RestAPIProvider extends BaseProvider {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: { apiKey: string; baseUrl: string }) {
    super('rest-api', config);
    
    this.baseUrl = config.baseUrl;
    this.headers = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      const endpoint = request.options?.endpoint || '/analyze';
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          text: request.input,
          ...request.options
        })
      });

      if (!response.ok) {
        return {
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();
      
      return {
        data: data.result,
        metadata: {
          provider: 'rest-api',
          statusCode: response.status
        }
      };
      
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Request failed'
      };
    }
  }
}
```

---

#### Example 3: Cache Provider (Wrapper)

```typescript
class CachedProvider extends BaseProvider {
  private innerProvider: BaseProvider;
  private cache: Map<string, ProviderResponse>;
  private ttl: number;

  constructor(
    provider: BaseProvider,
    config: { ttl?: number } = {}
  ) {
    super(`cached-${provider.name}`, config);
    
    this.innerProvider = provider;
    this.cache = new Map();
    this.ttl = config.ttl || 3600000;  // 1 hour default
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    // Generate cache key
    const key = this.hash(JSON.stringify(request));
    
    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true
        }
      };
    }
    
    // Execute inner provider
    const response = await this.innerProvider.execute(request);
    
    // Cache successful responses
    if (!response.error) {
      this.cache.set(key, response);
      
      // Clear after TTL
      setTimeout(() => {
        this.cache.delete(key);
      }, this.ttl);
    }
    
    return response;
  }

  private hash(str: string): string {
    // Simple hash (use crypto in production)
    return Buffer.from(str).toString('base64').slice(0, 32);
  }
  
  clearCache(): void {
    this.cache.clear();
  }
}

// Usage
const anthropic = new AnthropicProvider({ apiKey: '...' });
const cached = new CachedProvider(anthropic, { ttl: 3600000 });

adapter.registerProvider(cached);
```

---

#### Example 4: Rate-Limited Provider (Wrapper)

```typescript
class RateLimitedProvider extends BaseProvider {
  private innerProvider: BaseProvider;
  private requestsPerMinute: number;
  private requests: number[] = [];

  constructor(
    provider: BaseProvider,
    requestsPerMinute: number
  ) {
    super(`ratelimited-${provider.name}`, {});
    
    this.innerProvider = provider;
    this.requestsPerMinute = requestsPerMinute;
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    // Wait if rate limit exceeded
    await this.waitForRateLimit();
    
    // Record request
    this.requests.push(Date.now());
    
    // Execute
    return this.innerProvider.execute(request);
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old requests
    this.requests = this.requests.filter(t => t > oneMinuteAgo);
    
    // Check limit
    if (this.requests.length >= this.requestsPerMinute) {
      const oldestRequest = this.requests[0];
      const waitTime = 60000 - (now - oldestRequest);
      
      if (waitTime > 0) {
        console.log(`Rate limit: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}

// Usage
const openai = new OpenAIProvider({ apiKey: '...' });
const rateLimited = new RateLimitedProvider(openai, 50);  // 50 req/min

adapter.registerProvider(rateLimited);
```

---

## 📊 ProviderRegistry

Low-level registry for managing providers (usually used internally).

**Import:**
```typescript
import { ProviderRegistry } from '@ivan629/dag-ai';
```

### Methods

#### `register()`

Register a provider.

**Signature:**
```typescript
register(provider: BaseProvider): void
```

**Example:**
```typescript
const registry = new ProviderRegistry();

registry.register(new AnthropicProvider({ apiKey: '...' }));
registry.register(new OpenAIProvider({ apiKey: '...' }));
registry.register(new CustomProvider({ apiKey: '...' }));
```

**Throws:** If provider with same name already registered

---

#### `get()`

Get provider by name.

**Signature:**
```typescript
get(name: string): BaseProvider
```

**Example:**
```typescript
const anthropic = registry.get('anthropic');
```

**Throws:** If provider not found

---

#### `has()`

Check if provider exists.

**Signature:**
```typescript
has(name: string): boolean
```

**Example:**
```typescript
if (registry.has('anthropic')) {
  console.log('Anthropic is registered');
}
```

---

#### `list()`

Get all provider names.

**Signature:**
```typescript
list(): string[]
```

**Example:**
```typescript
const providers = registry.list();
console.log('Registered:', providers);
// ['anthropic', 'openai', 'custom']
```

---

### Advanced: Using Registry Directly

```typescript
import { DagEngine, ProviderRegistry, AnthropicProvider, OpenAIProvider } from '@ivan629/dag-ai';

// Create registry
const registry = new ProviderRegistry();

// Register providers
registry.register(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }));
registry.register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }));
registry.register(new CustomProvider({ config: '...' }));

// Use with engine
const engine = new DagEngine({
  plugin: myPlugin,
  registry: registry  // Pass registry instead of ProviderAdapter
});
```

---

## 🎯 Provider Best Practices

### 1. Always Provide Fallbacks

```typescript
// ❌ Bad: Single provider
selectProvider() {
  return { provider: 'anthropic', options: {} };
}

// ✅ Good: Multiple fallbacks
selectProvider() {
  return {
    provider: 'anthropic',
    options: {},
    fallbacks: [
      { provider: 'openai', options: {} },
      { provider: 'gemini', options: {} }
    ]
  };
}
```

---

### 2. Choose Models Based on Task

```typescript
selectProvider(dimension: string): ProviderSelection {
  // Simple task → cheap model
  if (dimension === 'quick_filter') {
    return {
      provider: 'gemini',
      options: { model: 'gemini-1.5-flash' }  // $0.075/1M
    };
  }
  
  // Complex task → best model
  if (dimension === 'critical_analysis') {
    return {
      provider: 'anthropic',
      options: { model: 'claude-opus-4' }  // $15/1M
    };
  }
  
  // Balanced
  return {
    provider: 'anthropic',
    options: { model: 'claude-sonnet-4-5-20250929' }  // $3/1M
  };
}
```

---

### 3. Handle Provider-Specific Errors

```typescript
async afterProviderExecute(context: ProviderResultContext): Promise<ProviderResponse> {
  const response = { ...context.result };
  
  // Gemini safety filters
  if (context.provider === 'gemini' && response.error?.includes('safety')) {
    console.warn('Content blocked by safety filters');
    // Return safe default or retry with different provider
  }
  
  // OpenAI content policy
  if (context.provider === 'openai' && response.error?.includes('content_policy')) {
    console.warn('Content policy violation');
  }
  
  return response;
}
```

---

### 4. Track Provider Performance

```typescript
class MonitoredPlugin extends Plugin {
  private providerStats = new Map<string, { success: number; failed: number }>();

  afterProviderExecute(context: ProviderResultContext): ProviderResponse {
    const stats = this.providerStats.get(context.provider) || { success: 0, failed: 0 };
    
    if (context.result.error) {
      stats.failed++;
    } else {
      stats.success++;
    }
    
    this.providerStats.set(context.provider, stats);
    
    return context.result;
  }

  getProviderStats() {
    return Array.from(this.providerStats.entries()).map(([provider, stats]) => ({
      provider,
      ...stats,
      successRate: stats.success / (stats.success + stats.failed)
    }));
  }
}
```

---

### 5. Implement Smart Routing

```typescript
selectProvider(dimension: string, section?: SectionData): ProviderSelection {
  // Route based on content length
  if (section) {
    const length = section.content.length;
    
    if (length < 1000) {
      return { provider: 'gemini', options: { model: 'gemini-1.5-flash' } };
    }
    if (length > 10000) {
      return { provider: 'anthropic', options: { model: 'claude-opus-4' } };
    }
  }
  
  // Route based on metadata
  if (section?.metadata.language === 'chinese') {
    return { provider: 'openai', options: {} };  // Better for Chinese
  }
  
  // Route based on priority
  if (section?.metadata.priority === 'high') {
    return { provider: 'anthropic', options: { model: 'claude-opus-4' } };
  }
  
  // Default
  return { provider: 'anthropic', options: {} };
}
```

---

## 📚 Related Documentation

- [DagEngine API](/api/dag-engine) - Engine configuration
- [Plugin API](/api/plugin) - Plugin methods
- [Types Reference](/api/types) - All TypeScript types
- [Error Handling Guide](/guide/error-handling) - Recovery strategies
- [Cost Optimization Guide](/guide/cost-optimization) - Save money

---

## ❓ FAQ

**Q: Which provider is fastest?**

Typical response times:
- Gemini Flash: 0.5-1.5s
- Claude Haiku: 0.5-1.5s
- GPT-4o Mini: 1-2s
- Claude Sonnet: 1-2s
- GPT-4o: 1-3s
- Claude Opus: 2-4s

**Q: Which provider is cheapest?**

Cost per 1M tokens (input/output):
- Gemini Flash: $0.075/$0.30 (cheapest)
- Claude Haiku: $0.25/$1.25
- GPT-4o Mini: $0.15/$0.60
- Claude Sonnet: $3/$15
- GPT-4o: $2.50/$10
- Claude Opus: $15/$75 (most expensive)

**Q: Can I use multiple providers simultaneously?**

Yes! Define fallbacks:
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

**Q: How do I add API keys?**

Store in environment variables:
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIza...
```

```typescript
const adapter = new ProviderAdapter({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  openai: { apiKey: process.env.OPENAI_API_KEY },
  gemini: { apiKey: process.env.GEMINI_API_KEY }
});
```

**Q: Can I test without API keys?**

Create a mock provider:
```typescript
class MockProvider extends BaseProvider {
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    return {
      data: { mock: true, result: 'test' },
      metadata: { provider: 'mock' }
    };
  }
}

adapter.registerProvider(new MockProvider({}));
```

**Q: How do I handle rate limits?**

Use `handleRetry` hook:
```typescript
handleRetry(context: RetryContext): RetryResponse {
  if (context.error.message.includes('rate_limit')) {
    return {
      shouldRetry: true,
      delayMs: 60000  // Wait 1 minute
    };
  }
  return {};
}
```

Or wrap provider with rate limiter (see examples above).
