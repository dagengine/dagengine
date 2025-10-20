You're right! I only provided the code, not the separate README. Here's the clean, focused README:

---

# Fundamentals 07: Async Hooks

All plugin hooks support async/await, enabling integration with databases, caches, APIs, and external services.

## Quick Run

```bash
npm run 07
```

## Real Output

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

## What This Shows

All 12 lifecycle hooks executed with async operations. Each hook can integrate with external services like Redis for caching, PostgreSQL for persistence, or webhooks for notifications.

The example also shows 4 additional error recovery hooks that support async (triggered only on failures):
- `handleProcessFailure`
- `handleRetry`
- `handleProviderFallback`
- `handleDimensionFailure`

Total: 16 async hooks available.

## Why Async Hooks Matter

Async support enables real-world integrations:
- **Databases**: Query PostgreSQL, MongoDB for cached results
- **Caches**: Check Redis, Memcached before processing
- **APIs**: Enrich data from external services
- **Webhooks**: Send notifications on completion
- **File Systems**: Read config, save results

Without async, these operations would block execution.

## Hook Categories

**Process Lifecycle (3 hooks):**
- `beforeProcessStart` - Initialize connections
- `afterProcessComplete` - Send notifications
- `handleProcessFailure` - Error recovery

**Dimension Lifecycle (6 hooks):**
- `defineDependencies` - Load dependency rules
- `shouldSkipGlobalDimension` - Cache check
- `shouldSkipSectionDimension` - Cache check per section
- `transformDependencies` - Enrich from database
- `beforeDimensionExecute` - Log to database
- `afterDimensionExecute` - Save results

**Provider Lifecycle (5 hooks):**
- `beforeProviderExecute` - Modify request
- `afterProviderExecute` - Transform response
- `handleRetry` - Custom retry logic
- `handleProviderFallback` - Fallback decisions
- `handleDimensionFailure` - Final error handling

**Transformation (2 hooks):**
- `transformSections` - Fetch additional data
- `finalizeResults` - Upload to S3

## Summary

✅ 16 hooks total, all support async/await  
✅ 12 lifecycle hooks (shown in output)  
✅ 4 error recovery hooks (called on failures)  
✅ Replace delays with real async operations

Add `async` to any hook and use `await` for external calls.


