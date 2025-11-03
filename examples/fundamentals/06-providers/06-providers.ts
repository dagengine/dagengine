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
 * Run: npm run 06
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
	type SectionDimensionContext,
	type ProcessResult,
} from "@dagengine/core";

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
// CONFIG
// ============================================================================

const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
	"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
};

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

		if (dimension === "basic_analysis") {
			return `Quick analysis:

"${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "category": "pricing" or "support" or "features" or "other"
}`;
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

	/**
	 * Core concept: Per-dimension provider selection
	 *
	 * Match model capabilities to task complexity:
	 * - Simple tasks → Fast, cheap models
	 * - Medium tasks → Balanced models
	 * - Complex tasks → Powerful, expensive models
	 */
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
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 06: Providers\n");

	const reviews: SectionData[] = [
		{ content: "Excellent product! The features are intuitive and customer support responded within an hour. Highly recommend.", metadata: { id: 1 } },
		{ content: "Disappointed with the pricing. It's too expensive compared to competitors offering similar features.", metadata: { id: 2 } },
		{ content: "The support team is unresponsive. I've been waiting 3 days for a reply to a critical issue.", metadata: { id: 3 } },
		{ content: "BUY VIAGRA NOW!!! CLICK HERE www.spam.com", metadata: { id: 4 } },
		{ content: "Love the new features in the latest update. The team clearly listens to user feedback.", metadata: { id: 5 } }
	];

	const engine = new DagEngine({
		plugin: new MultiProviderAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		pricing: { models: PRICING },
		progressDisplay: {
			display: 'bar'
		}
	});

	const startTime = Date.now();
	const result = await engine.process(reviews);
	const duration = Date.now() - startTime;

	displayResults(result, reviews, duration);
}

// ============================================================================
// DISPLAY
// ============================================================================

function displayResults(
	result: ProcessResult,
	reviews: SectionData[],
	duration: number
): void {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("ANALYSIS RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((section, reviewIndex: number) => {
		const review = section.section.content;
		const spamResult = section.results.spam_check as DimensionResult<SpamCheckResult> | undefined;
		const basicResult = section.results.basic_analysis as DimensionResult<BasicAnalysisResult> | undefined;
		const deepResult = section.results.deep_analysis as DimensionResult<DeepAnalysisResult> | undefined;

		console.log(`${reviewIndex + 1}. "${review.slice(0, 60)}${review.length > 60 ? '...' : ''}"`);

		if (spamResult?.data) {
			const emoji = spamResult.data.is_spam ? "🚫" : "✅";
			console.log(`   ${emoji} Spam Check (Haiku): ${spamResult.data.is_spam ? "SPAM" : "Legitimate"}`);
		}

		if (basicResult?.data && !basicResult.metadata?.skipped) {
			console.log(`   📊 Basic Analysis (Haiku):`);
			console.log(`      └─ ${basicResult.data.sentiment} | ${basicResult.data.category}`);
		}

		if (deepResult?.data && !deepResult.metadata?.skipped) {
			console.log(`   🧠 Deep Analysis (Sonnet):`);
			console.log(`      ├─ ${deepResult.data.detailed_sentiment}`);
			console.log(`      ├─ Topics: ${deepResult.data.topics.join(", ")}`);
			console.log(`      └─ ${deepResult.data.recommendations.length} recommendations`);
		}

		console.log("");
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("MODEL USAGE");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	if (result.costs?.byDimension) {
		Object.entries(result.costs.byDimension).forEach(([dimension, dimensionCost]) => {
			const model = dimension === "deep_analysis" ? "Sonnet" : "Haiku";
			console.log(`  ${dimension}: ${model}`);
			console.log(`    Cost: $${dimensionCost.cost.toFixed(4)}`);
			console.log(`    Tokens: ${dimensionCost.tokens.totalTokens.toLocaleString()}\n`);
		});
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log(`⚡ Duration: ${(duration / 1000).toFixed(2)}s`);
	console.log(`💰 Total Cost: $${result.costs?.totalCost.toFixed(4)}`);
	console.log(`🎫 Total Tokens: ${result.costs?.totalTokens.toLocaleString()}\n`);
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});