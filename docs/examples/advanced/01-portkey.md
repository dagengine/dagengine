---
title: 01 - Portkey Gateway - Parallel Request / Rate Limitations Handling
description: Process 100 emails simultaneously with 100 parallel requests through Portkey
---

# 01 - Portkey Gateway - Parallel Request / Rate Limitations Handling

Fire 100 parallel AI requests simultaneously with automatic retry handling through Portkey gateway.

## What You'll Learn

- ✅ Handle 100+ parallel requests with automatic retry on failures
- ✅ Configure Portkey gateway for rate limit protection
- ✅ Track throughput and cost in real-time
- ✅ Process high-volume workloads without manual error handling

**Time:** 5 minutes

## Quick Run

```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 01-portkey
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/advanced/01-portkey)**

## What You'll See

```
======================================================================
🚀 PORTKEY: PARALLEL REQUEST HANDLING DEMO
======================================================================

📊 Test Configuration:
   Total Emails: 100
   Parallel Requests: 100 concurrent
   Provider: Anthropic Claude Haiku
   Gateway: Portkey with smart retries
   Retry Strategy: Up to 5 attempts on errors

📧 Generating test emails...
   Email types:
     - work: 38 (38%)
     - newsletter: 22 (22%)
     - personal: 13 (13%)
     - spam: 27 (27%)

⚡ Processing 100 emails with 100 parallel requests...

📊 Progress: 100/100 (100%) | 27.2 req/s | $0.0230 | ETA: 0s

✅ Completed in 3.67s
📊 Throughput: 27.2 requests/second

======================================================================
📊 RESULTS
======================================================================

⚡ Performance:
   Duration: 3.67s
   Emails Processed: 100
   Throughput: 27.2 emails/second
   Avg Time per Email: 37ms

✅ Success Rate:
   Successful: 100/100 (100.0%)

📂 Categories Detected:
   work: 38 (38.0%)
   spam: 29 (29.0%)
   newsletter: 22 (22.0%)
   personal: 11 (11.0%)

======================================================================
💰 COST ANALYSIS
======================================================================

📊 Cost Breakdown:
   Total Cost: $0.0234
   Cost per Email: $0.000234
   Cost per 1K emails: $0.23
   Cost per 1M emails: $234.16

Token Usage:
   Total Tokens: 13,010
   Input Tokens: 8,945
   Output Tokens: 4,065
   Avg Tokens/Email: 130

======================================================================
🎯 KEY TAKEAWAYS
======================================================================

✓ Processed 100 emails in parallel
✓ 27.2 requests per second throughput
✓ 100.0% success rate
✓ Automatic retry handling on failures
✓ Smart rate limit protection
✓ Real-time cost tracking

📊 View detailed logs in Portkey:
   https://app.portkey.ai/logs
```

**What happened?**

- 100 emails processed with 100 concurrent requests in 3.67 seconds
- Achieved 27.2 requests/second throughput - all emails sent simultaneously
- 100% success rate - Portkey handled all requests without failures
- Real-time progress tracking showed live throughput, cost, and ETA updates
- Total cost: $0.0234 for 100 emails ($0.23 per 1K emails)
- All 100 requests fired at once, demonstrating true parallel processing power

## Code Walkthrough

**Step 1: Configure Portkey Gateway with Smart Retries**

```typescript
const PORTKEY_CONFIG = {
	anthropic: {
		apiKey: process.env.ANTHROPIC_API_KEY!,
		gateway: "portkey",
		gatewayApiKey: process.env.PORTKEY_API_KEY!,
		gatewayConfig: {
			// Automatic retry on failures
			retry: {
				attempts: 5,
				on_status_codes: [429, 500, 502, 503, 504],
			}
		}
	}
};
```

**Key point:** The `retry` configuration tells Portkey to automatically retry failed requests up to 5 times. Status codes 429 (rate limit), 500, 502, 503, and 504 trigger retries with exponential backoff. This happens transparently - your code never sees these errors.

**Step 2: Create Simple Single-Dimension Plugin**

```typescript
class EmailAnalyzer extends Plugin {
	constructor() {
		super(
			"simple-email-analyzer",
			"Simple Email Analyzer",
			"Fast parallel email analysis with Portkey"
		);

		this.dimensions = ["analyze_email"];
	}

	createPrompt(ctx: PromptContext): string {
		const email = ctx.sections[0]!;
		
		return `Analyze this email quickly and categorize it.

Email: ${email.content}

Return ONLY valid JSON (no markdown):
{
  "category": "spam" | "work" | "personal" | "newsletter",
  "confidence": 0.95,
  "summary": "Brief one-line summary"
}`;
	}

	selectProvider(_dimension: string): ProviderSelection {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.1,
				max_tokens: 150
			}
		};
	}
}
```

**Key point:** A single dimension that processes each email independently enables maximum parallelism. The engine can process 100+ emails simultaneously without dependencies between them.

**Step 3: Configure High Concurrency Processing**

```typescript
const engine = new DagEngine({
	plugin: new EmailAnalyzer(),
	providers: PORTKEY_CONFIG,
	execution: {
		concurrency: 100,  // Process all 100 emails at once!
		maxRetries: 3,     // Engine-level retries
		continueOnError: true,
		retryDelay: 1000   // 1 second between retries
	},
	pricing: { models: PRICING },
	progressDisplay: {
		display: "bar",
	}
});
```

**Key point:** Setting `concurrency: 100` means all 100 emails are sent to Portkey simultaneously. This demonstrates true parallel processing power - no batching, no queuing. Combined with Portkey's retry logic, this provides maximum speed with reliability. The `continueOnError: true` ensures one failed email doesn't stop the entire batch.

**Step 4: Monitor Progress in Real-Time**

```typescript
const startTime = Date.now();
let lastProgressUpdate = 0;

const result = await engine.process(emails, {
	onProgress: (progress) => {
		// Update every 500ms for smooth display
		const now = Date.now();
		if (now - lastProgressUpdate < 500) return;
		lastProgressUpdate = now;

		const elapsed = (now - startTime) / 1000;
		const throughput = progress.completed / elapsed;

		// Show live stats: progress, throughput, cost, ETA
		process.stdout.write(
			`📊 Progress: ${progress.completed}/${progress.total} ` +
			`(${progress.percent.toFixed(0)}%) | ` +
			`${throughput.toFixed(1)} req/s | ` +
			`$${progress.cost.toFixed(4)} | ` +
			`ETA: ${Math.ceil(progress.etaSeconds)}s`
		);
	}
});
```

**Key point:** The `onProgress` callback fires as requests complete, providing real-time metrics: completion percentage, current throughput (req/s), accumulated cost, and estimated time remaining. This enables live monitoring of high-volume processing and immediate feedback on performance.

**Step 5: Calculate Final Metrics**

```typescript
const startTime = Date.now();

const result = await engine.process(emails, {
	onDimensionComplete: (dim, res) => {
		const elapsed = Date.now() - startTime;
		if (!res.error) {
			const rps = (EMAIL_COUNT / (elapsed / 1000)).toFixed(1);
			console.log(`\n✅ Completed in ${(elapsed / 1000).toFixed(2)}s`);
			console.log(`📊 Throughput: ${rps} requests/second`);
		}
	}
});

const totalDuration = Date.now() - startTime;

// Calculate metrics
const throughput = EMAIL_COUNT / (totalDuration / 1000);
const successCount = result.sections.filter(s => 
	s.results.analyze_email?.data
).length;
const successRate = (successCount / EMAIL_COUNT) * 100;

console.log(`Throughput: ${throughput.toFixed(1)} emails/second`);
console.log(`Success Rate: ${successRate.toFixed(1)}%`);
console.log(`Total Cost: $${result.costs?.totalCost.toFixed(4)}`);
```

**Key point:** The callback provides real-time completion tracking. After processing, calculate throughput (emails/second) and success rate. Cost tracking is automatic through `result.costs` - Portkey returns token counts and the engine calculates costs using your pricing config.

**[📁 View full source on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/03-advanced/01-portkey)**

## Key Concepts

### 1. Parallel Processing

**Description:**

When processing multiple independent sections (emails), the engine sends requests concurrently up to the concurrency limit:

```typescript
execution: {
  concurrency: 100,  // Process all 100 at once
}
```

With 100 emails and concurrency of 100:
- All 100 emails fire simultaneously
- No batching or queuing
- Maximum parallelism achieved
- Completes in ~3.7 seconds (vs ~37s sequential)

**Characteristics:**

- Fastest possible processing (3.67s vs ~37s sequential) - 10x speedup
- Maximum resource utilization
- High throughput (27+ req/s vs 2.7 req/s)
- Requires gateway for rate limit protection

### 2. Smart Retry with Portkey

**Description:**

Portkey automatically retries failed requests with exponential backoff:

```typescript
gatewayConfig: {
  retry: {
    attempts: 5,
    on_status_codes: [429, 500, 502, 503, 504],
  }
}
```

**How it works:**

1. Request fails with 429 (rate limit)
2. Portkey waits (1s → 2s → 4s → 8s → 16s)
3. Retries request up to 5 times
4. Your code only sees success or final failure

**Characteristics:**

- Transparent to your code
- Exponential backoff prevents thundering herd
- Retry only on retryable errors (429, 5xx)
- All retry attempts logged in Portkey dashboard

### 3. Rate Limit Protection

**Description:**

High concurrency can trigger provider rate limits. Portkey protects against this:

```typescript
// Without Portkey
concurrency: 100  // May hit rate limits
                 // Manual retry logic needed
                 // Requests fail

// With Portkey
concurrency: 100  // Portkey handles rate limits
                 // Automatic retries with backoff
                 // All requests eventually succeed
```

**Characteristics:**

- Automatic detection of 429 responses
- Smart backoff to stay under limits
- No manual rate limit handling needed
- 100% success rate even at high concurrency

## Beyond Parallel Processing

This example focuses on parallel request handling with smart retries. Portkey offers additional production features:

**Load Balancing** - Distribute requests across multiple providers (Anthropic, OpenAI, Google) with custom weights for cost optimization

**Fallback Chains** - Automatic failover between providers when one fails or hits rate limits

**Semantic Caching** - Cache similar requests to reduce costs and latency (up to 90% cost reduction)

**Observability Dashboard** - Track all requests, costs, latency, and errors in real-time at [app.portkey.ai](https://app.portkey.ai)

**Config Management** - Store routing strategies in Portkey dashboard and update without code deployments

**Learn more:** [Portkey Documentation](https://docs.portkey.ai/docs/product/ai-gateway)

## Summary

**What you learned:**

✅ **Parallel Processing** - Process 100 emails simultaneously with controlled concurrency  
✅ **Smart Retries** - Automatic retry on failures with exponential backoff through Portkey  
✅ **Rate Limit Protection** - Handle high-volume workloads without manual rate limit logic  
✅ **Real-Time Metrics** - Track throughput, success rate, and cost automatically

**Key insight:**

Portkey transforms high-concurrency AI workloads from fragile to reliable. Without Portkey, 100 concurrent requests fired simultaneously would hit rate limits and fail. With Portkey, those same 100 requests succeed through automatic retry with exponential backoff. Your code stays simple - no retry loops, no backoff calculations, no rate limit tracking. Process 100 emails in 3.67 seconds with 100% success rate and 100 parallel requests - a 10x speedup over sequential processing. This is how production systems handle AI at scale: maximum throughput, automatic reliability, zero operational complexity.

## Troubleshooting

### Missing Portkey API Key

```
Error: Portkey API key is required when using gateway
```

**Cause:** `gatewayApiKey` not provided in provider config

**Fix:**

```typescript
const PORTKEY_CONFIG = {
	anthropic: {
		apiKey: process.env.ANTHROPIC_API_KEY!,
		gateway: "portkey",
		gatewayApiKey: process.env.PORTKEY_API_KEY!, // Add this
	}
};
```

Get your Portkey API key at: [app.portkey.ai/api-keys](https://app.portkey.ai/api-keys)

### Rate Limits Still Hit

```
Error: All retry attempts exhausted (429)
```

**Cause:** Concurrency too high for your rate limit tier

**Fix:**

```typescript
// Reduce concurrency
execution: {
  concurrency: 25,  // Lower from 50 or 100
}

// Or increase retry attempts
gatewayConfig: {
  retry: {
    attempts: 10,  // More retries
    on_status_codes: [429, 500, 502, 503, 504],
  }
}
```

### Low Throughput

```
Throughput: 5.2 emails/second (expected: 30-40)
```

**Cause:** Concurrency set too low

**Fix:**

```typescript
// Increase concurrency gradually
execution: {
	concurrency: 50,  // Up from 25
}

// Monitor Portkey logs to ensure no rate limits
// https://app.portkey.ai/logs
```