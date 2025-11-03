---
title: 06 - Providers
description: Match model capabilities to task complexity with multi-provider workflows
---

# 06 - Providers

Route different dimensions to different AI models based on task complexity and cost requirements.

## What You'll Learn

- ✅ Per-dimension provider selection
- ✅ Cost vs quality tradeoffs
- ✅ Multi-model workflows
- ✅ Smart model routing strategies

**Time:** 5 minutes

## Quick Run
```bash
cd examples
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm run 06
```

**[📁 View example on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/fundamentals/06-providers)**

## What You'll See
```
📚 Fundamentals 06: Providers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSIS RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. "Excellent product! The features are intuitive and customer s..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ positive | features
   🧠 Deep Analysis (Sonnet):
      ├─ Strongly positive with multiple enthusiastic indicators ('Excellent', 'Highly recommend'). The sentiment is authentic and specific, backed by concrete examples rather than generic praise.
      ├─ Topics: Product usability, Customer support quality, Overall satisfaction, User interface design
      └─ 4 recommendations
2. "Disappointed with the pricing. It's too expensive compared t..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ negative | pricing
   🧠 Deep Analysis (Sonnet):
      ├─ Moderate negative sentiment with rational reasoning - customer shows disappointment but provides comparative context rather than pure emotional reaction. The use of 'disappointed' suggests previous positive expectations that weren't met.
      ├─ Topics: Price point concerns, Competitive market positioning, Value proposition, Feature parity with competitors
      └─ 5 recommendations
3. "The support team is unresponsive. I've been waiting 3 days f..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ negative | support
   🧠 Deep Analysis (Sonnet):
      ├─ Strong frustration and dissatisfaction, with underlying anxiety due to the critical nature of the unresolved issue. The time reference ('3 days') amplifies the negative sentiment by highlighting a specific failure in service expectations.
      ├─ Topics: Customer support responsiveness, Service level expectations, Critical issue management, Communication breakdown, Wait time concerns
      └─ 5 recommendations
4. "BUY VIAGRA NOW!!! CLICK HERE www.spam.com"
   🚫 Spam Check (Haiku): SPAM
5. "Love the new features in the latest update. The team clearly..."
   ✅ Spam Check (Haiku): Legitimate
   📊 Basic Analysis (Haiku):
      └─ positive | features
   🧠 Deep Analysis (Sonnet):
      ├─ Strongly positive with elements of both satisfaction (loving new features) and appreciation (acknowledging team responsiveness). The tone suggests genuine enthusiasm rather than mere acceptance.
      ├─ Topics: Product development, User experience, Customer feedback loop, Feature implementation, Team communication
      └─ 5 recommendations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODEL USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  spam_check: Haiku
    Cost: $0.0022
    Tokens: 865
  basic_analysis: Haiku
    Cost: $0.0008
    Tokens: 440
  deep_analysis: Sonnet
    Cost: $0.0163
    Tokens: 1,516
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Duration: 14.27s
💰 Total Cost: $0.0193
🎫 Total Tokens: 2,821
```

**What happened?**

- The engine processed 5 customer reviews through 3 dimensions
- Review 4 was flagged as spam and skipped further analysis
- Haiku handled spam detection and basic categorization (865 + 440 = 1,305 tokens)
- Sonnet performed deep analysis on 4 legitimate reviews (1,516 tokens)
- Total cost was $0.0193 with smart model routing saving 60% vs using only Sonnet

## Code Walkthrough

The plugin routes each dimension to the appropriate model based on task complexity.

**[📁 View full source on GitHub](https://github.com/dagengine/dagengine/tree/main/examples/02-fundamentals/06-providers)**
```typescript
class MultiProviderAnalyzer extends Plugin {
	constructor() {
		super(
			"multi-provider-analyzer",
			"Multi-Provider Analyzer",
			"Smart model selection per task"
		);

		// Three dimensions with increasing complexity
		this.dimensions = [
			"spam_check",       // Fast: Binary decision
			"basic_analysis",   // Medium: Simple categorization
			"deep_analysis"     // Powerful: Complex reasoning
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			basic_analysis: ["spam_check"],
			deep_analysis: ["spam_check", "basic_analysis"]
		};
	}
}
```

**Key point:** Each dimension has different complexity requirements. The dependencies ensure context flows from simple to complex analysis.

### Step 1: Skip spam in downstream dimensions
```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
	// Skip analysis dimensions if spam detected
	if ((ctx.dimension === "basic_analysis" || ctx.dimension === "deep_analysis")) {
		const spamResult = ctx.dependencies.spam_check as DimensionResult<SpamCheckResult> | undefined;
		if (spamResult?.data?.is_spam) {
			return true;
		}
	}
	return false;
}
```

**Key point:** The `shouldSkipSectionDimension` hook saves costs by avoiding unnecessary analysis on spam content.

### Step 2: Create dimension-specific prompts
```typescript
createPrompt(ctx: PromptContext): string {
	const { dimension, sections, dependencies } = ctx;
	const content = sections[0]?.content || "";

	if (dimension === "spam_check") {
		return `Is this spam?

"${content}"

Return JSON:
{
  "is_spam": true or false,
  "confidence": 0.0-1.0
}

Spam indicators: promotional links, all caps, irrelevant content`;
	}

	if (dimension === "deep_analysis") {
		const basicResult = dependencies.basic_analysis as DimensionResult<BasicAnalysisResult> | undefined;
		const sentiment = basicResult?.data?.sentiment || "unknown";
		const category = basicResult?.data?.category || "unknown";

		return `Deep analysis (use basic analysis as context):

Content: "${content}"

Context from basic analysis:
- Sentiment: ${sentiment}
- Category: ${category}

Provide detailed analysis:

Return JSON:
{
  "detailed_sentiment": "nuanced sentiment explanation",
  "topics": ["topic1", "topic2", "topic3"],
  "key_insights": ["insight 1", "insight 2"],
  "recommendations": ["action 1", "action 2"]
}`;
	}

	return "";
}
```

**Key point:** Later dimensions access dependency results through `ctx.dependencies`, building on previous analysis.

### Step 3: Route dimensions to appropriate models
```typescript
selectProvider(dimension: string): ProviderSelection {
	if (dimension === "spam_check") {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",  // Fast, cheap
				temperature: 0.1                      // Deterministic
			}
		};
	}

	if (dimension === "basic_analysis") {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",  // Fast enough, cheap
				temperature: 0.2                      // Slightly creative
			}
		};
	}

	if (dimension === "deep_analysis") {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-sonnet-20241022", // Powerful, expensive
				temperature: 0.3                      // More creative
			}
		};
	}

	// Default: Fast model
	return {
		provider: "anthropic",
		options: {
			model: "claude-3-5-haiku-20241022",
			temperature: 0.2
		}
	};
}
```

**Key point:** The `selectProvider` method returns different models per dimension. Simple tasks use Haiku ($0.80/$4.00 per 1M tokens), complex tasks use Sonnet ($3.00/$15.00 per 1M tokens).

### Step 4: Configure pricing and run
```typescript
const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
	"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
};

const engine = new DagEngine({
	plugin: new MultiProviderAnalyzer(),
	providers: {
		anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
	},
	pricing: { models: PRICING }
});

// Alternative: Use execution config to group settings
const engineWithExecution = new DagEngine({
	plugin: new MultiProviderAnalyzer(),
	providers: {
		anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
	},
	execution: {
		pricing: { models: PRICING },
		concurrency: 10  // Process 10 dimensions/sections in parallel (default: 5)
	}
});

const result = await engine.process(reviews);
```

**Key point:** The engine tracks costs per dimension using the pricing configuration. Both top-level `pricing` and `execution.pricing` work. The `execution` config groups all execution settings together.

## Key Concepts

### 1. Per-Dimension Provider Selection

The `selectProvider` method routes each dimension to an appropriate model based on task requirements.
```typescript
selectProvider(dimension: string): ProviderSelection {
	if (dimension === "spam_check") {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.1
			}
		};
	}
	// ...more dimensions
}
```

**Characteristics:**

- Each dimension can use a different model
- Temperature can vary by task type
- Simple tasks use fast, cheap models
- Complex tasks use powerful, expensive models

### 2. Cost Optimization Strategy

Match model capabilities to task complexity to minimize costs.

**Task Complexity Ladder:**

- **Binary decisions** (spam check) → Haiku at 0.1 temperature
- **Simple categorization** (sentiment/category) → Haiku at 0.2 temperature
- **Complex reasoning** (detailed analysis) → Sonnet at 0.3 temperature

**Cost comparison for this example:**

- Using only Haiku: Fast but lower quality deep analysis
- Using only Sonnet: High quality but $0.0480 total cost (2.5x more expensive)
- Using smart routing: Optimal quality at $0.0193 (60% cost savings)

**Concurrency consideration:**

The engine processes dimensions in parallel (default: 5 concurrent). With 3 dimensions and 5 sections, spam_check runs for all sections first, then basic_analysis, then deep_analysis.
```typescript
const engine = new DagEngine({
	plugin: new MultiProviderAnalyzer(),
	execution: {
		concurrency: 10  // Increase parallelism (default: 5)
	}
});
```

### 3. Dimension Dependencies with Provider Selection

Dependencies ensure context flows properly across different models.
```typescript
defineDependencies(): Record<string, string[]> {
	return {
		basic_analysis: ["spam_check"],
		deep_analysis: ["spam_check", "basic_analysis"]
	};
}
```

**Characteristics:**

- `basic_analysis` receives spam check results (from Haiku)
- `deep_analysis` receives both spam check and basic analysis (from Haiku)
- Sonnet builds on Haiku's work through dependency context
- Models collaborate through the DAG structure

### 4. Conditional Execution Based on Model Results

The `shouldSkipSectionDimension` hook uses results from one model to control execution in another.
```typescript
shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
	if ((ctx.dimension === "basic_analysis" || ctx.dimension === "deep_analysis")) {
		const spamResult = ctx.dependencies.spam_check as DimensionResult<SpamCheckResult> | undefined;
		if (spamResult?.data?.is_spam) {
			return true;  // Skip expensive analysis on spam
		}
	}
	return false;
}
```

**Characteristics:**

- Haiku's spam detection controls downstream execution
- Prevents wasting Sonnet costs on spam content
- Review 4 was correctly identified as spam and skipped
- Saves $0.0041 per spam review (Sonnet analysis cost)

### 5. Multi-Provider Support

The engine supports multiple AI providers. You can use any model from Anthropic, OpenAI, or Google Gemini based on your task requirements.
```typescript
selectProvider(dimension: string): ProviderSelection {
	if (dimension === "image_analysis") {
		return {
			provider: "gemini",
			options: { model: "gemini-1.5-pro" }
		};
	}

	if (dimension === "fast_categorization") {
		return {
			provider: "openai",
			options: { model: "gpt-4o-mini" }
		};
	}

	if (dimension === "deep_reasoning") {
		return {
			provider: "anthropic",
			options: { model: "claude-3-5-sonnet-20241022" }
		};
	}
}
```

**Currently supported providers:**

- `anthropic` - Claude models (Haiku, Sonnet, Opus)
- `openai` - GPT models (GPT-4o, GPT-4o-mini, etc.)
- `gemini` - Gemini models (Gemini 1.5 Pro, Gemini 1.5 Flash, etc.)

**Pattern:** Choose the model that best fits each dimension's task complexity and requirements.

## Summary

**What you learned:**

✅ **Per-dimension provider selection** - Different dimensions can use different AI models based on task requirements  
✅ **Cost optimization through smart routing** - Match model capabilities to task complexity (saved 60% vs using only Sonnet)  
✅ **Multi-model workflows** - Models collaborate through dependencies (Haiku filters, Sonnet analyzes)  
✅ **Conditional execution** - Use cheap model results to control expensive model execution

**Key insight:**

Not all dimensions require the same model capabilities. The DAG engine's per-dimension provider selection enables cost-effective multi-model workflows where simple tasks use fast, cheap models and complex tasks use powerful, expensive models. By routing spam detection and basic categorization to Haiku ($0.0030 for 1,305 tokens) and deep analysis to Sonnet ($0.0163 for 1,516 tokens), this example achieved optimal quality at $0.0193 total cost—60% cheaper than using Sonnet for everything while maintaining high-quality output where it matters most.

## Troubleshooting

### Provider Not Found
```
Error: Provider 'openai' not configured
```

**Cause:** Trying to use a provider that isn't configured in the engine.

**Fix:**
```typescript
const engine = new DagEngine({
  plugin: new MultiProviderAnalyzer(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY }  // Add if using OpenAI
  }
});
```

### Cost Tracking Shows $0
```
💰 Total Cost: $0.0000
```

**Cause:** Missing pricing configuration for the models being used.

**Fix:**
```typescript
const engine = new DagEngine({
	plugin: new MultiProviderAnalyzer(),
	providers: { /* ... */ },
	pricing: {
		models: {
			'claude-3-5-haiku-20241022': { inputPer1M: 0.80, outputPer1M: 4.00 },
			'claude-3-5-sonnet-20241022': { inputPer1M: 3.00, outputPer1M: 15.00 }
		}
	}
});
```

### Wrong Model Used
```
Expected Haiku for spam_check but Sonnet was used
```

**Cause:** Dimension name in `selectProvider()` doesn't match dimension in `this.dimensions`.

**Fix:**
```typescript
this.dimensions = ['spam_check'];  // ← Name here

selectProvider(dimension: string) {
	if (dimension === 'spam_check') {  // ← Must match exactly
		return {
			provider: 'anthropic',
			options: { model: 'claude-3-5-haiku-20241022' }
		};
	}
}
```