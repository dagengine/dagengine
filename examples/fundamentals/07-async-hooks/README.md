---
title: 07 - Async Hooks
description: All plugin hooks support async/await for database, cache, and API integrations
---

# 07 - Async Hooks

Integrate external services into your plugin with async/await support in all lifecycle hooks.

## What You'll Learn

- ✅ All hooks support async/await
- ✅ Database and cache integration patterns
- ✅ External API enrichment
- ✅ Real-world async operations

**Time:** 5 minutes

## Quick Run

```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 07
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/07-async-hooks)**

## What You'll See

```
📚 Fundamentals 07: Async Hooks

Demonstrating that ALL hooks support async/await.

Processing 2 sections through all hooks...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "Great product! Love it."
   📊 positive (0.90)

2. "Terrible experience."
   📊 negative (0.90)

Global Analysis:
📊 Overall: mixed (0.50)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALL HOOKS CALLED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Async Hooks (can use await):

1. afterDimensionExecute (3x)
2. afterProcessComplete (1x)
3. afterProviderExecute (3x)
4. beforeDimensionExecute (3x)
5. beforeProcessStart (1x)
6. beforeProviderExecute (3x)
7. defineDependencies (1x)
8. finalizeResults (1x)
9. shouldSkipGlobalDimension (1x)
10. shouldSkipSectionDimension (2x)
11. transformDependencies (3x)
12. transformSections (1x)

Required Methods (async optional):

1. createPrompt (3x)
2. selectProvider (3x)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ Duration: 5.61s
💰 Cost: $0.0011
🎫 Tokens: 407
🎯 Total Hook Calls: 29
📋 Async Hooks: 12
```

**What happened?**

- The engine processed 2 sections through the sentiment dimension
- All 12 lifecycle hooks executed with async operations (simulated delays)
- Each hook can integrate with external services like Redis, PostgreSQL, or APIs
- Total of 29 hook calls made during the process (including per-section hooks)

## Code Walkthrough

The plugin demonstrates async/await in every hook by simulating external service calls.

```typescript
class AsyncHooksDemo extends Plugin {
	constructor() {
		super("async-hooks-demo", "Async Hooks Demo", "Demo all async hooks");
		this.dimensions = ["sentiment"];
	}

	// Process lifecycle hooks
	async beforeProcessStart(): Promise<void> {
		await this.simulateAsync("beforeProcessStart");
	}

	async afterProcessComplete(): Promise<void> {
		await this.simulateAsync("afterProcessComplete");
	}

	// Dimension lifecycle hooks
	async defineDependencies(): Promise<Record<string, string[]>> {
		await this.simulateAsync("defineDependencies");
		return {};
	}

	async shouldSkipGlobalDimension(ctx: GlobalDimensionContext): Promise<boolean> {
		await this.simulateAsync("shouldSkipGlobalDimension");
		return false;
	}
}
```

**Key point:** Add `async` to any hook method and use `await` for external operations. The engine handles all async execution automatically.

### Step 1: Transform sections with external data

```typescript
async transformSections(sections: SectionData[]): Promise<SectionData[]> {
	await this.simulateAsync("transformSections");
	// Real use case: Fetch user profiles from database
	// const enriched = await db.users.findMany({ ids: sections.map(s => s.userId) });
	return sections;
}
```

**Key point:** The `transformSections` hook runs before processing starts, ideal for fetching additional data to enrich your sections.

### Step 2: Check cache before execution

```typescript
async shouldSkipSectionDimension(ctx: SectionDimensionContext): Promise<boolean> {
	await this.simulateAsync("shouldSkipSectionDimension");
	// Real use case: Check Redis cache
	// const cached = await redis.get(`${ctx.section.id}:${ctx.dimension}`);
	// if (cached) return true;
	return false;
}
```

**Key point:** Use `shouldSkipSectionDimension` to check caches or databases before processing. Return `true` to skip the dimension for that section.

### Step 3: Enrich dependencies from database

```typescript
async transformDependencies(
	dimension: string,
	dependencies: Record<string, DimensionResult>
): Promise<Record<string, DimensionResult>> {
	await this.simulateAsync("transformDependencies");
	// Real use case: Add historical data from database
	// const history = await db.sentiment.getHistory(section.id);
	// dependencies.history = { data: history };
	return dependencies;
}
```

**Key point:** The `transformDependencies` hook receives results from dependency dimensions and can enrich them with data from external sources before passing to the prompt.

### Step 4: Log execution to database

```typescript
async beforeDimensionExecute(ctx: DimensionExecutionContext): Promise<void> {
	await this.simulateAsync("beforeDimensionExecute");
	// Real use case: Log to PostgreSQL
	// await db.logs.insert({
	//   dimension: ctx.dimension,
	//   section: ctx.section.id,
	//   timestamp: Date.now()
	// });
}

async afterDimensionExecute(ctx: DimensionExecutionContext, result: DimensionResult): Promise<void> {
	await this.simulateAsync("afterDimensionExecute");
	// Real use case: Save results to database
	// await db.results.upsert({
	//   section: ctx.section.id,
	//   dimension: ctx.dimension,
	//   data: result.data
	// });
}
```

**Key point:** Use `beforeDimensionExecute` and `afterDimensionExecute` to log execution and persist results. These hooks run for each section/dimension combination.

### Step 5: Finalize results with external storage

```typescript
async finalizeResults(result: ProcessResult): Promise<ProcessResult> {
	await this.simulateAsync("finalizeResults");
	// Real use case: Upload to S3 or send webhook
	// await s3.upload('results.json', JSON.stringify(result));
	// await webhook.notify('https://api.example.com/results', result);
	return result;
}
```

**Key point:** The `finalizeResults` hook runs last, after all processing completes. Use it for uploading results, sending notifications, or final transformations.

## Key Concepts

### 1. All Hooks Support Async

Every lifecycle hook in the plugin system supports async/await.

```typescript
class MyPlugin extends Plugin {
	async beforeProcessStart(): Promise<void> {
		await database.connect();
	}

	async transformSections(sections: SectionData[]): Promise<SectionData[]> {
		const enriched = await api.enrichData(sections);
		return enriched;
	}

	async afterProcessComplete(): Promise<void> {
		await database.disconnect();
	}
}
```

**Characteristics:**

- Add `async` to any hook method
- Use `await` for database queries, API calls, file operations
- Engine handles all async execution automatically
- No callback hell or promise chaining needed

### 2. Hook Categories

The plugin system provides 16 async hooks organized into 4 categories.

**Process Lifecycle (3 hooks):**

- `beforeProcessStart` - Initialize connections, load config
- `afterProcessComplete` - Send notifications, cleanup
- `handleProcessFailure` - Error recovery, rollback

**Dimension Lifecycle (6 hooks):**

- `defineDependencies` - Load dependency rules from database
- `shouldSkipGlobalDimension` - Check if dimension should run at all
- `shouldSkipSectionDimension` - Cache check per section
- `transformDependencies` - Enrich dependency results
- `beforeDimensionExecute` - Log execution start
- `afterDimensionExecute` - Save results, update cache

**Provider Lifecycle (5 hooks):**

- `beforeProviderExecute` - Modify request, add headers
- `afterProviderExecute` - Transform response, extract metadata
- `handleRetry` - Custom retry logic with backoff
- `handleProviderFallback` - Decide fallback provider
- `handleDimensionFailure` - Final error handling

**Transformation (2 hooks):**

- `transformSections` - Fetch additional data before processing
- `finalizeResults` - Upload to S3, send webhooks

### 3. Error Recovery Hooks

Four additional async hooks handle failures during processing.

```typescript
async handleProcessFailure(error: Error): Promise<void> {
	// Log error to monitoring service
	await monitoring.logError(error);
	
	// Send alert
	await slack.notify('Process failed: ' + error.message);
}

async handleRetry(error: Error, attempt: number): Promise<boolean> {
	// Custom retry logic
	if (attempt < 3 && error.message.includes('rate limit')) {
		await sleep(1000 * attempt);  // Exponential backoff
		return true;  // Retry
	}
	return false;  // Don't retry
}

async handleProviderFallback(
	dimension: string,
	error: Error
): Promise<ProviderSelection | null> {
	// Fallback to different provider
	if (error.message.includes('overloaded')) {
		return {
			provider: 'openai',
			options: { model: 'gpt-4o-mini' }
		};
	}
	return null;  // No fallback
}

async handleDimensionFailure(
	dimension: string,
	section: SectionData,
	error: Error
): Promise<DimensionResult | null> {
	// Log failure
	await db.failures.insert({ dimension, section: section.id, error: error.message });
	
	// Return fallback result
	return { data: { error: 'processing_failed' } };
}
```

**Characteristics:**

- Only called when errors occur
- Not shown in the example output (no errors happened)
- Enable graceful degradation and error recovery
- Can integrate with monitoring and alerting systems

## Summary

**What you learned:**

✅ **All 16 hooks support async/await** - No callbacks or promise chaining required  
✅ **Database integration** - Query PostgreSQL, MongoDB in any hook  
✅ **Cache integration** - Check Redis before processing, save after  
✅ **API integration** - Enrich data from external services

**Key insight:**

The DAG engine's comprehensive async support enables real-world integrations at every stage of processing. From initializing database connections in `beforeProcessStart`, to checking caches in `shouldSkipSectionDimension`, to uploading results in `finalizeResults`, every hook can perform async operations. This eliminates the need for synchronous workarounds and enables clean integration with databases, caches, APIs, and external services throughout the entire processing pipeline.

## Troubleshooting

### Hook Not Being Called

```typescript
// Hook defined but never executes
async myCustomHook(): Promise<void> {
	console.log('Never called');
}
```

**Cause:** Hook name doesn't match the plugin system's hook names.

**Fix:**

```typescript
// Use exact hook names from the plugin system
async beforeProcessStart(): Promise<void> {
	console.log('Called!');
}
```

### Async Operation Blocking

```
Process hangs indefinitely
```

**Cause:** Async operation in hook never resolves (missing `await` or unresolved promise).

**Fix:**

```typescript
// Bad: Missing await
async transformSections(sections: SectionData[]): Promise<SectionData[]> {
	fetch('/api/data');  // ❌ Fire and forget
return sections;
}

// Good: Proper await
async transformSections(sections: SectionData[]): Promise<SectionData[]> {
	await fetch('/api/data');  // ✅ Wait for completion
	return sections;
}
```

### Error Not Caught

```
UnhandledPromiseRejectionWarning: Error: Database connection failed
```

**Cause:** Async error in hook not properly handled.

**Fix:**

```typescript
async beforeProcessStart(): Promise<void> {
	try {
		await database.connect();
	} catch (error) {
		console.error('Failed to connect:', error);
		throw error;  // Re-throw if critical
	}
}
```