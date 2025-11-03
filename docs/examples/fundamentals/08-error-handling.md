---
title: 08 - Error Handling
description: Graceful error recovery with automatic retries and fallback results
---

# 08 - Error Handling

Handle dimension failures gracefully with automatic retries, fallback results, and continued processing.

## What You'll Learn

- ✅ Automatic retry mechanism
- ✅ Error recovery hooks
- ✅ Fallback result patterns
- ✅ Partial result processing

**Time:** 5 minutes

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 08
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/08-error-handling)**

## What You'll See
```
📚 Fundamentals 08: Error Handling

Demonstrating graceful error recovery with fallback results.

Processing 3 sections...
Note: 'detailed' dimension uses invalid model (will fail)

════════════════════════════════════════════════════════════

Attempt 1 failed for dimension "detailed" with provider "anthropic". 3 retries left.
Attempt 1 failed for dimension "detailed" with provider "anthropic". 3 retries left.
Attempt 1 failed for dimension "detailed" with provider "anthropic". 3 retries left.
Attempt 2 failed for dimension "detailed" with provider "anthropic". 2 retries left.
Attempt 2 failed for dimension "detailed" with provider "anthropic". 2 retries left.
Attempt 2 failed for dimension "detailed" with provider "anthropic". 2 retries left.
Attempt 3 failed for dimension "detailed" with provider "anthropic". 1 retries left.
Attempt 3 failed for dimension "detailed" with provider "anthropic". 1 retries left.
Attempt 3 failed for dimension "detailed" with provider "anthropic". 1 retries left.
Attempt 4 failed for dimension "detailed" with provider "anthropic". 0 retries left.

❌ Dimension "detailed" failed
   Error: Anthropic API error (404): model: claude-invalid-model-xyz
   Providing fallback result...

Attempt 4 failed for dimension "detailed" with provider "anthropic". 0 retries left.

❌ Dimension "detailed" failed
   Error: Anthropic API error (404): model: claude-invalid-model-xyz
   Providing fallback result...

Attempt 4 failed for dimension "detailed" with provider "anthropic". 0 retries left.

❌ Dimension "detailed" failed
   Error: Anthropic API error (404): model: claude-invalid-model-xyz
   Providing fallback result...

════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "Great product! Love it."
   📊 analyze: positive (0.90)
   📊 detailed: neutral (fallback)

2. "Terrible experience."
   📊 analyze: negative (0.95)
   📊 detailed: neutral (fallback)

3. "It's okay, nothing special."
   📊 analyze: neutral (0.70)
   📊 detailed: neutral (fallback)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Successful: 3
🔄 Fallbacks: 3
❌ Errors Handled: 3
⚡ Duration: 10.74s
💰 Cost: $0.0010
🎫 Tokens: 386
```

**What happened?**

- The `detailed` dimension failed for all 3 sections due to an invalid model name
- System automatically retried 4 times per section (1 initial + 3 retries = 12 total attempts)
- `handleDimensionFailure` hook provided fallback results (neutral sentiment with 0.0 confidence)
- The `analyze` dimension succeeded normally for all sections
- Processing continued despite failures, delivering partial results

## Code Walkthrough

The plugin demonstrates error recovery by using an intentionally invalid model name for one dimension.

**[📁 View full source on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/02-fundamentals/08-error-handling)**
```typescript
class ErrorHandlingPlugin extends Plugin {
	private errorCount: number = 0;
	private fallbackCount: number = 0;

	constructor() {
		super(
			"error-handling-demo",
			"Error Handling Demo",
			"Demonstrate graceful error recovery"
		);

		this.dimensions = ["analyze", "detailed"];
	}

	selectProvider(dimension: string): ProviderSelection {
		if (dimension === "detailed") {
			// Intentionally invalid model to trigger errors
			return {
				provider: "anthropic",
				options: {
					model: "claude-invalid-model-xyz",
					temperature: 0.2
				}
			};
		}

		// Valid model for analyze dimension
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.2
			}
		};
	}
}
```

**Key point:** The `detailed` dimension uses an invalid model that will fail, while `analyze` uses a valid model that succeeds.

### Step 1: Implement error recovery hook
```typescript
async handleDimensionFailure(
	context: FailureContext
): Promise<DimensionResult<AnalysisResult> | void> {
	this.errorCount++;

	console.log(`\n❌ Dimension "${context.dimension}" failed`);
	console.log(`   Error: ${context.error.message}`);
	console.log(`   Providing fallback result...\n`);

	this.fallbackCount++;

	// Return fallback result instead of letting error propagate
	return {
		data: {
			sentiment: "neutral",
			confidence: 0.0,
			fallback: true
		},
		metadata: {
			fallback: true,
			originalError: context.error.message
		}
	};
}
```

**Key point:** The `handleDimensionFailure` hook is called after all retry attempts are exhausted. Return a `DimensionResult` to provide a fallback value, or return `void` to store the error and continue.

### Step 2: Configure engine with error handling
```typescript
const engine = new DagEngine({
	plugin: new ErrorHandlingPlugin(),
	providers: {
		anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
	},
	execution: {
		continueOnError: true,  // Continue processing despite errors (default: true)
		maxRetries: 3,          // Number of retry attempts (default: 3)
		retryDelay: 1000        // Base delay between retries in ms (default: 1000)
	},
	pricing: {
		models: {
			"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 }
		}
	}
});

const result = await engine.process(sections);
```

**Key point:** The `execution` config groups all execution behavior. Set `continueOnError: true` to get partial results when dimensions fail. Retries use exponential backoff: `retryDelay * 2^attempt`.

### Step 3: Access error information in results
```typescript
result.sections.forEach((sectionResult) => {
	const detailed = sectionResult.results.detailed as DimensionResult<AnalysisResult>;
	
	if (detailed.metadata?.fallback) {
		console.log(`Fallback result: ${detailed.data.sentiment}`);
		console.log(`Original error: ${detailed.metadata.originalError}`);
	}
});
```

**Key point:** Fallback results include metadata about the error, allowing you to identify which results came from error recovery.

## Key Concepts

### 1. Automatic Retry Mechanism

The engine automatically retries failed API calls before invoking error hooks.
```typescript
// Default retry behavior (3 retries)
Attempt 1 → fails
Attempt 2 → fails (retry 1, wait 1s)
Attempt 3 → fails (retry 2, wait 2s)
Attempt 4 → fails (retry 3, wait 4s)
→ handleDimensionFailure called
```

**Characteristics:**

- Retries happen automatically for transient failures
- No code needed to enable retries
- Default: 3 retry attempts (4 total attempts)
- Uses exponential backoff: `retryDelay * 2^attempt`
- After all retries fail, error hook is called

**Customize retry behavior:**
```typescript
const engine = new DagEngine({
	plugin: new ErrorHandlingPlugin(),
	execution: {
		maxRetries: 5,     // Increase retry attempts (default: 3)
		retryDelay: 2000   // Slower backoff: 2s, 4s, 8s, 16s, 32s (default: 1000ms)
	}
});
```

### 2. Error Recovery Hook

The `handleDimensionFailure` hook provides graceful error recovery.
```typescript
async handleDimensionFailure(
	context: FailureContext
): Promise<DimensionResult | void> {
	// Option 1: Return fallback result
	return {
		data: { sentiment: "neutral", confidence: 0.0 },
		metadata: { fallback: true, error: context.error.message }
	};
	
	// Option 2: Return void (error stored in results)
	// return;
}
```

**When it fires:**

- All retry attempts exhausted
- All fallback providers tried (if configured)
- Dimension execution completely failed

**What you can do:**

- Return fallback result (processing continues)
- Return void (error stored, processing continues if `continueOnError: true`)
- Log error to monitoring service
- Send alert notifications

### 3. Partial Result Processing

With `continueOnError: true`, the process completes with partial results.
```typescript
const engine = new DagEngine({
	plugin: new ErrorHandlingPlugin(),
	providers: { /* ... */ },
	execution: {
		continueOnError: true  // Enable partial results (default: true)
	}
});
```

**With `continueOnError: true` (default):**

- Failed dimensions get error results or fallbacks
- Other dimensions continue executing normally
- Process completes with partial results
- Errors available in result metadata

**With `continueOnError: false`:**

- First error stops entire process
- No further dimensions execute
- Exception thrown immediately
- No partial results returned

### 4. Cost Efficiency

You only pay for successful API calls, not failed attempts.
```
analyze dimension: 3 successful calls → $0.0010 (386 tokens)
detailed dimension: 12 failed attempts → $0.0000 (no valid API calls)

Total cost: $0.0010
```

**Characteristics:**

- Failed API calls don't incur charges
- Retry attempts don't cost money if they fail
- Only successful responses count toward cost
- Fallback results have zero API cost

## Summary

**What you learned:**

✅ **Automatic retries** - Engine retries failed calls 3 times with exponential backoff  
✅ **Error recovery hook** - `handleDimensionFailure` provides fallback results after retries exhausted  
✅ **Partial results** - Processing continues with `continueOnError: true` (the default)  
✅ **Cost efficiency** - Failed retries cost nothing, only successful API calls charged

**Key insight:**

Error handling transforms brittle workflows into resilient systems. Without error recovery, a single API failure stops your entire process. With `handleDimensionFailure` and `continueOnError: true`, failed dimensions receive fallback results while successful dimensions complete normally. The system automatically retries failed calls three times using exponential backoff, logs all errors, and continues processing to deliver partial results. You only pay for successful API calls, making error recovery both reliable and cost-efficient.

## Troubleshooting

### Process Stops on First Error
```
Error: Anthropic API error (404): model not found
Process terminated without results
```

**Cause:** `continueOnError` is set to `false`.

**Fix:**
```typescript
const engine = new DagEngine({
	plugin: new ErrorHandlingPlugin(),
	providers: { /* ... */ },
	execution: {
		continueOnError: true  // Enable partial results (this is the default)
	}
});
```

### No Fallback Results Provided
```
Result shows error but no fallback data
```

**Cause:** `handleDimensionFailure` hook returns `void` instead of fallback result.

**Fix:**
```typescript
async handleDimensionFailure(context: FailureContext): Promise<DimensionResult | void> {
	// Return fallback result instead of void
	return {
		data: { sentiment: "neutral", confidence: 0.0 },
		metadata: { fallback: true }
	};
}
```

### Retries Happen Too Many Times
```
12 retry attempts taking too long
```

**Cause:** Default retry count is 3, plus initial attempt = 4 total per section.

**Fix:**
```typescript
const engine = new DagEngine({
	plugin: new ErrorHandlingPlugin(),
	execution: {
		maxRetries: 1  // Reduce from default 3 to just 1 retry (2 total attempts)
	}
});
```