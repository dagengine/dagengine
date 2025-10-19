---
title: 01 - Hello World
description: Your first dag-ai plugin in 5 minutes
---

# 01 - Hello World

The absolute simplest dag-ai plugin. Learn the core structure in 5 minutes.

---

## What You'll Learn

- ✅ Plugin class structure
- ✅ Single dimension workflow
- ✅ Creating prompts
- ✅ Selecting AI providers
- ✅ Automatic parallelization

**Time:** 5 minutes

---

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 01
```

---

## What You'll See
```
📚 Fundamentals 01: Hello World

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Alice
   → Hello Alice! It's wonderful to meet you!
   Language: english

2. Bob
   → Hey Bob! Great to see you!
   Language: english

3. Charlie
   → Hi Charlie! Hope you're having a fantastic day!
   Language: english

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Completed in 1.5s
💰 Cost: $0.0012
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What happened?**
- 3 names processed **in parallel** (automatically!)
- 1 dimension executed: `greet`
- 3 API calls total

---

## The Complete Code

This example is ~150 lines. Here's the structure:

### Step 1: Create Your Plugin
```typescript
class HelloWorldPlugin extends Plugin {
	constructor() {
		super(
			'hello-world',           // Unique ID
			'Hello World',           // Display name
			'Say hello to names'     // Description
		);

		// Define ONE task
		this.dimensions = ['greet'];
	}

	// Tell dag-ai what to ask the AI
	createPrompt(ctx) {
		const name = ctx.sections[0]?.content || 'World';

		return `Say hello to ${name} in a friendly way.
    
    Return JSON:
    {
      "greeting": "your greeting here",
      "language": "english"
    }`;
	}

	// Tell dag-ai which AI to use
	selectProvider(dimension) {
		return {
			provider: 'anthropic',
			options: {
				model: 'claude-3-5-haiku-20241022',
				temperature: 0.7
			}
		};
	}
}
```

### Step 2: Create the Engine
```typescript
const engine = new DagEngine({
	plugin: new HelloWorldPlugin(),
	providers: {
		anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
	}
});
```

### Step 3: Process Your Data
```typescript
const sections = [
	{ content: 'Alice', metadata: { id: 1 } },
	{ content: 'Bob', metadata: { id: 2 } },
	{ content: 'Charlie', metadata: { id: 3 } }
];

const result = await engine.process(sections);
```

### Step 4: Access Results
```typescript
result.sections.forEach(section => {
	const name = section.section.content;
	const greeting = section.results.greet?.data;

	console.log(`${name} → ${greeting.greeting}`);
});
```

**[📁 View full source on GitHub](https://github.com/ivan629/dag-ai/tree/main/examples/01-hello-world)**

---

## Key Concepts

### 1. Plugin Structure

Every plugin extends `Plugin` and needs:
```typescript
class MyPlugin extends Plugin {
  constructor() {
    super(id, name, description);
    this.dimensions = ['task1', 'task2'];
  }
  
  createPrompt(ctx) { /* ... */ }
  selectProvider(dimension) { /* ... */ }
}
```

**Three required parts:**
- `dimensions` - Array of tasks to perform
- `createPrompt()` - What to ask the AI
- `selectProvider()` - Which AI provider to use

---

### 2. Dimensions

**Dimensions are the "tasks" in your workflow.**
```typescript
this.dimensions = ['greet'];  // One task
```

This plugin has **one dimension**: `greet`

Each dimension:
- Runs once per section
- Gets its own prompt
- Can use different AI models
- Results stored by dimension name

---

### 3. Creating Prompts

**The `createPrompt()` method builds the AI request:**
```typescript
createPrompt(ctx: PromptContext): string {
  // Access section data
  const name = ctx.sections[0]?.content;
  
  // Build your prompt
  return `Say hello to ${name}...`;
}
```

**Tips:**
- Keep prompts clear and specific
- Request JSON for structured output
- Use section content and metadata

---

### 4. Selecting Providers

**The `selectProvider()` method chooses the AI:**
```typescript
selectProvider(dimension: string): ProviderSelection {
  return {
    provider: 'anthropic',  // or 'openai', 'gemini'
    options: {
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.7
    }
  };
}
```

**Available providers:**
- `anthropic` - Claude models
- `openai` - GPT models
- `gemini` - Gemini models

---

### 5. Automatic Parallelization

**dag-ai runs independent tasks in parallel automatically:**
```
Section 1 → greet → Result 1
Section 2 → greet → Result 2  } All 3 run together
Section 3 → greet → Result 3
```

**No code needed!** Just define your dimensions.

---

## Customization

### Use Different Names
```typescript
const sections = [
  { content: 'Emma', metadata: { id: 1 } },
  { content: 'Oliver', metadata: { id: 2 } }
];
```

### Change the Greeting Style
```typescript
createPrompt(ctx) {
  const name = ctx.sections[0]?.content;
  
  return `Say hello to ${name} in a FORMAL business style.
  
  Return JSON:
  {
    "greeting": "your greeting",
    "language": "english"
  }`;
}
```

### Use OpenAI Instead
```typescript
selectProvider() {
  return {
    provider: 'openai',
    options: {
      model: 'gpt-4o',
      temperature: 0.7
    }
  };
}
```

---

## Next Steps

**Ready to learn more?**

1. **[02 - Dependencies](/examples/02-dependencies)** - Control execution order
2. **[03 - Section vs Global](/examples/03-section-vs-global)** - Two types of dimensions
3. **[Production Quickstart](/examples/00-quickstart)** - See all features together

**Want to experiment?**

- Add more dimensions: `['greet', 'compliment', 'joke']`
- Use different languages: Ask for greetings in Spanish, French, etc.
- Add metadata: Store timestamps, user IDs, etc.

---

## Troubleshooting

### "API key not set"
```bash
# Add to examples/.env
ANTHROPIC_API_KEY=sk-ant-xxx
```

Get your key at [console.anthropic.com](https://console.anthropic.com/)

### "Provider not found"

Make sure provider is configured in engine:
```typescript
const engine = new DagEngine({
  plugin: new HelloWorldPlugin(),
  providers: {
    anthropic: { apiKey: 'your-key' }  // ← Must match selectProvider()
  }
});
```

### Result is undefined

Check dimension name matches:
```typescript
this.dimensions = ['greet'];  // ← Must match
result.sections[0].results.greet  // ← Access with same name
```

---

## Summary

**What you learned:**

✅ Plugin structure - Extend `Plugin` class  
✅ Dimensions - Define tasks in your workflow  
✅ Prompts - Use `createPrompt()` to build requests  
✅ Providers - Use `selectProvider()` to choose AI  
✅ Parallelization - Automatic, no configuration needed

**Next:** [02 - Dependencies →](/examples/02-dependencies)

Learn how to control execution order when tasks depend on each other!