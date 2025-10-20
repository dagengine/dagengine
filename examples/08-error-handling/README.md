# Fundamentals 08: Error Handling

Demonstrates graceful error recovery when dimensions fail.

## Quick Run

```bash
npm run 08
```

## Real Output

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

## What Happened

The `detailed` dimension failed for all 3 sections due to an invalid model name. The system:

1. **Retried automatically** - 4 attempts per section (1 initial + 3 retries)
2. **Called error hook** - `handleDimensionFailure` invoked 3 times
3. **Provided fallbacks** - Returned neutral sentiment with confidence 0.0
4. **Continued processing** - Other dimensions completed successfully

The `analyze` dimension succeeded normally. Total cost only reflects successful API calls.

## Code Example

```typescript
class ErrorHandlingPlugin extends Plugin {
	private errorCount: number = 0;
	private fallbackCount: number = 0;

	async handleDimensionFailure(
		context: FailureContext
	): Promise<DimensionResult<AnalysisResult> | void> {
		this.errorCount++;

		console.log(`\n❌ Dimension "${context.dimension}" failed`);
		console.log(`   Error: ${context.error.message}`);
		console.log(`   Providing fallback result...\n`);

		this.fallbackCount++;

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
}
```

## When Hook Fires

`handleDimensionFailure` is called when:
- All retry attempts exhausted
- All fallback providers tried
- Dimension execution completely failed

The hook receives full context including error details and can:
- Return fallback result (process continues)
- Return void (error stored, process continues if `continueOnError: true`)

## Engine Configuration

```typescript
const engine = new DagEngine({
	plugin: new ErrorHandlingPlugin(),
	providers: { /* ... */ },
	continueOnError: true  // Process continues despite errors
});
```

With `continueOnError: true`:
- Failed dimensions get error results or fallbacks
- Other dimensions continue executing
- Process completes with partial results

With `continueOnError: false`:
- First error stops entire process
- No further dimensions execute
- Exception thrown

## Why This Matters

Without error handling, a single API failure stops your entire workflow. With `handleDimensionFailure`:

- **Resilience** - Process completes despite failures
- **Partial results** - Get data from successful dimensions
- **Cost efficiency** - Only pay for successful API calls
- **Graceful degradation** - Fallback values better than nothing

## Summary

✅ Automatic retries (4 attempts)  
✅ Error recovery hook (`handleDimensionFailure`)  
✅ Fallback results on failure  
✅ Process continues with `continueOnError: true`  
✅ Cost only for successful dimensions ($0.0010 for 386 tokens)
