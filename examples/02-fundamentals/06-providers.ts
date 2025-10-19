/**
 * Fundamentals 06: Providers
 *
 * Learn multi-provider strategies.
 *
 * Learn:
 * - Using multiple AI providers
 * - Per-dimension provider selection
 * - Cost vs quality tradeoffs
 * - Multi-model workflows
 *
 * Pattern: Fast model → Medium model → Powerful model
 *
 * Run: npm run guide:06
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionData,
	type DimensionResult,
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface SpamCheckResult {
	is_spam: boolean;
	confidence: number;
}

interface BasicAnalysisResult {
	sentiment: "positive" | "negative" | "neutral";
	category: string;
}

interface DeepAnalysisResult {
	detailed_sentiment: string;
	topics: string[];
	key_insights: string[];
	recommendations: string[];
}

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * MultiProviderAnalyzer
 *
 * Demonstrates smart provider selection:
 *
 * 1. spam_check → Fast model (Haiku) - Simple binary decision
 * 2. basic_analysis → Medium model (Haiku) - Basic categorization
 * 3. deep_analysis → Powerful model (Sonnet) - Complex reasoning
 *
 * Result: Optimal cost/quality balance
 */
class MultiProviderAnalyzer extends Plugin {
	constructor() {
		super(
			"multi-provider-analyzer",
			"Multi-Provider Analyzer",
			"Smart model selection per task"
		);

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

	shouldSkipDimension(ctx: any): boolean {
		// Skip analysis dimensions if spam detected
		if ((ctx.dimension === "basic_analysis" || ctx.dimension === "deep_analysis")) {
			const spamResult = ctx.dependencies.spam_check as DimensionResult<SpamCheckResult> | undefined;
			if (spamResult?.data?.is_spam) {
				console.log(`   ⏭️  Skipped: Spam detected`);
				return true;
			}
		}
		return false;
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;
		const content = sections[0]?.content || "";

		// ============================================================================
		// DIMENSION 1: spam_check (FAST model)
		// ============================================================================

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

		// ============================================================================
		// DIMENSION 2: basic_analysis (MEDIUM model)
		// ============================================================================

		if (dimension === "basic_analysis") {
			return `Quick analysis:

"${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "category": "pricing" or "support" or "features" or "other"
}`;
		}

		// ============================================================================
		// DIMENSION 3: deep_analysis (POWERFUL model)
		// ============================================================================

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

	/**
	 * ✅ CORE CONCEPT: Per-dimension provider selection
	 *
	 * Match model capabilities to task complexity:
	 * - Simple tasks → Fast, cheap models
	 * - Medium tasks → Balanced models
	 * - Complex tasks → Powerful, expensive models
	 *
	 * @param dimension - The dimension being processed
	 * @returns Provider configuration
	 */
	selectProvider(dimension: string): ProviderSelection {
		// ============================================================================
		// STRATEGY 1: Fast model for simple binary decisions
		// ============================================================================

		if (dimension === "spam_check") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",  // Fast, cheap
					temperature: 0.1                      // Deterministic
				}
			};
		}

		// ============================================================================
		// STRATEGY 2: Medium model for basic categorization
		// ============================================================================

		if (dimension === "basic_analysis") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",  // Fast enough, cheap
					temperature: 0.2                      // Slightly creative
				}
			};
		}

		// ============================================================================
		// STRATEGY 3: Powerful model for complex reasoning
		// ============================================================================

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
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 06: Providers\n");
	console.log("Learn multi-provider strategies.\n");

	// ============================================================================
	// SETUP
	// ============================================================================

	const reviews: SectionData[] = [
		// Legitimate reviews
		{ content: "Excellent product! The features are intuitive and customer support responded within an hour. Highly recommend.", metadata: { id: 1 } },
		{ content: "Disappointed with the pricing. It's too expensive compared to competitors offering similar features.", metadata: { id: 2 } },
		{ content: "The support team is unresponsive. I've been waiting 3 days for a reply to a critical issue.", metadata: { id: 3 } },

		// Spam (will be skipped for analysis)
		{ content: "BUY VIAGRA NOW!!! CLICK HERE www.spam.com", metadata: { id: 4 } },

		// More legitimate
		{ content: "Love the new features in the latest update. The team clearly listens to user feedback.", metadata: { id: 5 } }
	];

	const engine = new DagEngine({
		plugin: new MultiProviderAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		pricing: {
			models: {
				"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
				"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
			}
		}
	});

	console.log(`✓ Created engine with MultiProviderAnalyzer`);
	console.log(`✓ Prepared ${reviews.length} reviews\n`);

	// ============================================================================
	// EXPLAIN THE STRATEGY
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("PROVIDER SELECTION STRATEGY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Match model to task complexity:\n");

	console.log("🚀 FAST MODEL (Haiku - $0.80/$4.00 per 1M tokens)");
	console.log("   Use for: Simple binary decisions");
	console.log("   Example: spam_check");
	console.log("   ├─ Is this spam? Yes/No");
	console.log("   └─ Fast, cheap, good enough\n");

	console.log("⚡ MEDIUM MODEL (Haiku - $0.80/$4.00 per 1M tokens)");
	console.log("   Use for: Basic categorization");
	console.log("   Example: basic_analysis");
	console.log("   ├─ What's the sentiment?");
	console.log("   ├─ What category is this?");
	console.log("   └─ Still fast, still cheap\n");

	console.log("🧠 POWERFUL MODEL (Sonnet - $3.00/$15.00 per 1M tokens)");
	console.log("   Use for: Complex reasoning");
	console.log("   Example: deep_analysis");
	console.log("   ├─ Detailed sentiment analysis");
	console.log("   ├─ Extract key insights");
	console.log("   ├─ Generate recommendations");
	console.log("   └─ 3.75x more expensive, worth it for complex tasks\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// COST COMPARISON
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("COST COMPARISON");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Scenario: 5 reviews\n");

	console.log("Option A: Use Sonnet for everything");
	console.log("  5 × spam_check (Sonnet)     = $0.015");
	console.log("  5 × basic_analysis (Sonnet) = $0.015");
	console.log("  5 × deep_analysis (Sonnet)  = $0.020");
	console.log("  Total: $0.050\n");

	console.log("Option B: Smart model selection (this example)");
	console.log("  5 × spam_check (Haiku)      = $0.004");
	console.log("  4 × basic_analysis (Haiku)  = $0.003  (1 spam skipped)");
	console.log("  4 × deep_analysis (Sonnet)  = $0.016  (1 spam skipped)");
	console.log("  Total: $0.023\n");

	console.log("Savings: $0.027 (54%)\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// PROCESS
	// ============================================================================

	console.log("Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(reviews);
	const duration = Date.now() - startTime;

	// ============================================================================
	// DISPLAY RESULTS
	// ============================================================================

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("ANALYSIS RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((section, idx) => {
		const review = section.section.content;
		const spamResult = section.results.spam_check as DimensionResult<SpamCheckResult> | undefined;
		const basicResult = section.results.basic_analysis as DimensionResult<BasicAnalysisResult> | undefined;
		const deepResult = section.results.deep_analysis as DimensionResult<DeepAnalysisResult> | undefined;

		console.log(`${idx + 1}. "${review.slice(0, 60)}${review.length > 60 ? '...' : ''}"`);

		// Spam check (Haiku)
		if (spamResult?.data) {
			const emoji = spamResult.data.is_spam ? "🚫" : "✅";
			console.log(`   ${emoji} Spam Check (Haiku): ${spamResult.data.is_spam ? "SPAM" : "Legitimate"}`);
		}

		// Basic analysis (Haiku)
		if (basicResult?.data) {
			console.log(`   📊 Basic Analysis (Haiku):`);
			console.log(`      └─ ${basicResult.data.sentiment} | ${basicResult.data.category}`);
		}

		// Deep analysis (Sonnet)
		if (deepResult?.data) {
			console.log(`   🧠 Deep Analysis (Sonnet):`);
			console.log(`      ├─ ${deepResult.data.detailed_sentiment}`);
			console.log(`      ├─ Topics: ${deepResult.data.topics.join(", ")}`);
			console.log(`      └─ ${deepResult.data.recommendations.length} recommendations`);
		}

		console.log("");
	});

	// ============================================================================
	// STATISTICS
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("MODEL USAGE STATISTICS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	if (result.costs && result.costs.byDimension) {
		console.log("Cost breakdown by dimension:\n");

		Object.entries(result.costs.byDimension).forEach(([dimension, cost]) => {
			const model = dimension === "deep_analysis" ? "Sonnet" : "Haiku";
			console.log(`  ${dimension}:`);
			console.log(`    Model: ${model}`);
			console.log(`    Cost: $${(cost as number).toFixed(4)}\n`);
		});

		console.log(`💰 Total cost: $${result.costs.totalCost.toFixed(4)}`);

		const naiveCost = reviews.length * 0.010; // If all used Sonnet
		const savings = ((naiveCost - result.costs.totalCost) / naiveCost) * 100;
		console.log(`📉 Savings vs all-Sonnet: ${savings.toFixed(0)}%\n`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// EXPLANATION
	// ============================================================================

	console.log("✨ What just happened?\n");

	console.log("1. SPAM CHECK (Haiku):");
	console.log("   - Simple binary decision");
	console.log("   - Fast, cheap model is perfect");
	console.log("   - No need for expensive model here\n");

	console.log("2. BASIC ANALYSIS (Haiku):");
	console.log("   - Simple categorization");
	console.log("   - Haiku handles this well");
	console.log("   - Save money for complex tasks\n");

	console.log("3. DEEP ANALYSIS (Sonnet):");
	console.log("   - Complex reasoning required");
	console.log("   - Insights and recommendations");
	console.log("   - Worth the extra cost\n");

	console.log("4. SKIP LOGIC:");
	console.log("   - Spam reviews skipped analysis");
	console.log("   - Saved expensive Sonnet calls");
	console.log("   - Combined savings: 50-60%\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ selectProvider() chooses model per dimension");
	console.log("✓ Match model capability to task complexity");
	console.log("✓ Simple tasks → Fast models (save money)");
	console.log("✓ Complex tasks → Powerful models (worth it)");
	console.log("✓ Combine with skip logic for max savings\n");

	console.log("💡 Key insight:\n");
	console.log("You don't need the most powerful model for everything.");
	console.log("Use cheap models for simple tasks, save expensive models for complex reasoning.\n");

	console.log("📊 Model selection guide:\n");
	console.log("FAST models (Haiku, GPT-4o-mini):");
	console.log("  ✓ Binary decisions (yes/no, true/false)");
	console.log("  ✓ Simple categorization (A/B/C)");
	console.log("  ✓ Spam/quality filtering");
	console.log("  ✓ Basic sentiment analysis");
	console.log("  ✓ Keyword extraction\n");

	console.log("POWERFUL models (Sonnet, GPT-4o):");
	console.log("  ✓ Complex reasoning");
	console.log("  ✓ Detailed insights");
	console.log("  ✓ Nuanced analysis");
	console.log("  ✓ Strategic recommendations");
	console.log("  ✓ Creative tasks\n");

	console.log("🔧 Multi-provider examples:\n");
	console.log("Example 1: OpenAI + Anthropic");
	console.log("  selectProvider(dimension) {");
	console.log("    if (dimension === 'fast_task') {");
	console.log("      return { provider: 'openai', options: { model: 'gpt-4o-mini' } };");
	console.log("    }");
	console.log("    return { provider: 'anthropic', options: { model: 'claude-3-5-sonnet' } };");
	console.log("  }\n");

	console.log("Example 2: Gemini for specific tasks");
	console.log("  selectProvider(dimension) {");
	console.log("    if (dimension === 'image_analysis') {");
	console.log("      return { provider: 'google', options: { model: 'gemini-pro-vision' } };");
	console.log("    }");
	console.log("    return { provider: 'anthropic', options: { model: 'claude-3-5-haiku' } };");
	console.log("  }\n");

	console.log("🎉 Congratulations!\n");
	console.log("You've completed all 6 fundamental examples!\n");
	console.log("You now understand:");
	console.log("  ✓ Plugin structure (01)");
	console.log("  ✓ Dependencies & parallelization (02)");
	console.log("  ✓ Section vs Global scope (03)");
	console.log("  ✓ Transformations (04)");
	console.log("  ✓ Skip logic (05)");
	console.log("  ✓ Provider selection (06)\n");

	console.log("⏭️  Next steps:");
	console.log("   → Explore patterns: examples/02-complete-guide/patterns/");
	console.log("   → Build something: examples/02-complete-guide/production/");
	console.log("   → Reference use cases: examples/02-complete-guide/use-cases/\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);

	if (error.message.includes("API key")) {
		console.error("\n💡 Fix: Add ANTHROPIC_API_KEY to examples/.env");
		console.error("   Get your key at: https://console.anthropic.com/\n");
	}

	process.exit(1);
});