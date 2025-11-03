---
title: 01 - Hello World
description: Build your first dag-engine plugin with a single dimension
---

# 01 - Hello World

Build your first dag-engine plugin with a single dimension and parallel processing.

## What You'll Learn

- ✅ Plugin class structure and required methods
- ✅ Single dimension workflow
- ✅ Prompt creation with context
- ✅ Provider selection and configuration
- ✅ Automatic parallel processing

**Time:** 5 minutes

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run guide:01
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/01-hello-world)**

## What You'll See
```
📚 Fundamentals 01: Hello World

The simplest possible dag-engine plugin.

Step 1: Creating engine with HelloWorldPlugin...
✓ Engine created

Step 2: Preparing input sections...
✓ Prepared 3 sections

Step 3: Processing...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Alice
   → Hi Alice! It's great to see you today!
   Language: english

2. Bob
   → Hey Bob, how's it going? Great to see you!
   Language: english

3. Charlie
   → Hey Charlie! How's it going today? Great to see you!
   Language: english

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Completed in 1.43s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ What just happened?

1. Engine created with HelloWorldPlugin
2. Plugin defined ONE dimension: 'greet'
3. Engine processed 3 sections (names)
4. For each section:
   - Called createPrompt() to build request
   - Called selectProvider() to choose AI
   - Sent request to Anthropic Claude
   - Parsed JSON response
5. All 3 sections processed IN PARALLEL (automatically)

🎓 What you learned:

✓ Plugin structure (extends Plugin)
✓ Dimensions (tasks in your workflow)
✓ createPrompt() method (what to ask AI)
✓ selectProvider() method (which AI to use)
✓ Automatic parallelization (no code needed)
```

**What happened?**
- 3 sections processed (Alice, Bob, Charlie)
- Each received a personalized greeting from Claude
- All requests sent in parallel automatically
- Completed in 1.43 seconds total

## Code Walkthrough

**Step 1: Define the Plugin Class**
```typescript
class HelloWorldPlugin extends Plugin {
	constructor() {
		super(
			"hello-world",           // Unique plugin ID
			"Hello World",           // Display name
			"Say hello to names"     // Description
		);

		// Define ONE dimension: the "greet" task
		this.dimensions = ["greet"];
	}
}
```

**Key point:** Every plugin extends `Plugin` and defines dimensions. Dimensions are the tasks in your workflow. This plugin has one task: greet people.

**Step 2: Implement createPrompt**
```typescript
createPrompt(ctx: PromptContext): string {
	// Extract the name from section content
	const name = ctx.sections[0]?.content || "World";

	// Build the prompt with JSON structure
	return `Say hello to ${name} in a friendly way.

Return JSON with this structure:
{
  "greeting": "your greeting here",
  "language": "english"
}`;
}
```

**Key point:** `createPrompt()` receives context and returns a string prompt. The engine calls this once per section, automatically injecting the section data through `ctx.sections`.

**Step 3: Implement selectProvider**
```typescript
selectProvider(dimension: string): ProviderSelection {
	return {
		provider: "anthropic",
		options: {
			model: "claude-3-5-haiku-20241022",  // Fast, cheap model
			temperature: 0.7                      // Slightly creative
		}
	};
}
```

**Key point:** `selectProvider()` tells the engine which AI provider and model to use. This runs once per dimension. Different dimensions can use different providers.

**Step 4: Create and Configure Engine**
```typescript
const engine = new DagEngine({
	plugin: new HelloWorldPlugin(),
	providers: {
		anthropic: {
			apiKey: process.env.ANTHROPIC_API_KEY!
		}
	}
});
```

**Key point:** The engine needs your plugin and provider credentials. Each provider needs its API key configured.

**Step 5: Process Sections**
```typescript
const sections: SectionData[] = [
	{ content: "Alice", metadata: { id: 1 } },
	{ content: "Bob", metadata: { id: 2 } },
	{ content: "Charlie", metadata: { id: 3 } }
];

const result = await engine.process(sections);
```

**Key point:** Call `engine.process()` with your input data. The engine automatically processes all sections in parallel and returns structured results.

## Key Concepts

### 1. Plugin Structure

**Description:** Plugins extend the `Plugin` base class and implement two required methods.
```typescript
class MyPlugin extends Plugin {
	constructor() {
		super("id", "name", "description");
		this.dimensions = ["task1", "task2"];
	}

	createPrompt(ctx: PromptContext): string { }
	selectProvider(dimension: string): ProviderSelection { }
}
```

**Characteristics:**
- Constructor defines plugin identity and dimensions
- `createPrompt()` builds the AI request
- `selectProvider()` chooses which AI to use
- Both methods are called automatically by the engine

### 2. Dimensions

**Description:** Dimensions are the tasks in your workflow. Each dimension represents one AI call per section.
```typescript
this.dimensions = ["greet"];  // One task: greet
```

**Characteristics:**
- Defined as string array in constructor
- Each dimension processes independently
- Can depend on other dimensions (covered in later examples)
- Processed in parallel when possible

### 3. Section Data

**Description:** Sections are your input units. Each section flows through all dimensions.
```typescript
const sections: SectionData[] = [
	{ content: "Alice", metadata: { id: 1 } }
];
```

**Characteristics:**
- `content` holds the main data (string)
- `metadata` stores additional information (optional)
- Each section processed independently
- Results maintain section order

### 4. Prompt Context

**Description:** The context passed to `createPrompt()` contains section data and dependencies.
```typescript
createPrompt(ctx: PromptContext): string {
	const name = ctx.sections[0]?.content;
	return `Say hello to ${name}`;
}
```

**Characteristics:**
- `ctx.sections` array contains current section(s)
- `ctx.dependencies` contains results from other dimensions (when applicable)
- Access via index: `ctx.sections[0]` for single section
- Type-safe with TypeScript

### 5. Provider Configuration

**Description:** Configure API keys and select models for AI providers.
```typescript
providers: {
	anthropic: {
		apiKey: process.env.ANTHROPIC_API_KEY!
	}
}
```

**Characteristics:**
- Each provider needs API key in environment
- Model selection happens in `selectProvider()`
- Different models have different speed/cost tradeoffs
- Temperature controls response creativity

## Summary

**What you learned:**

✅ Plugin structure - Extend Plugin class with constructor and two methods  
✅ Dimensions - Define tasks as string array for AI calls  
✅ Prompt creation - Access section data through context  
✅ Provider selection - Return provider name and model config  
✅ Parallel processing - Engine handles concurrency automatically

**Key insight:**

The dag-engine engine handles all the complexity of parallel processing, error handling, and result aggregation. You define what to ask the AI (`createPrompt`) and which AI to use (`selectProvider`). The engine does the rest - batching requests, managing concurrency, and structuring results. This lets you focus on your workflow logic instead of infrastructure.

## Troubleshooting

### Missing API Key
```
Error: Missing API key for provider: anthropic
```

**Cause:** `ANTHROPIC_API_KEY` not found in environment variables

**Fix:**
```bash
# Create examples/.env file
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > examples/.env
```

### Invalid JSON Response
```
Error: Failed to parse JSON response from provider
```

**Cause:** AI returned text instead of valid JSON

**Fix:** Make your JSON structure request more explicit in the prompt:
```typescript
return `Say hello to ${name}.

IMPORTANT: Return ONLY valid JSON with no additional text.

{
  "greeting": "your greeting here",
  "language": "english"
}`;
```