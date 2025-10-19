/**
 * Fundamentals 05: Skip Logic
 *
 * Learn cost optimization through smart skipping.
 *
 * Demonstrates:
 * - shouldSkipDimension() hook
 * - Quality filter pattern (cheap check → skip → expensive analysis)
 * - Real cost savings measurement
 *
 * Run: npm run 05
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
} from "../../src";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface QualityCheckResult {
	is_high_quality: boolean;
	quality_score: number;
	reasoning: string;
}

interface DeepAnalysisResult {
	sentiment: string;
	topics: string[];
	key_insights: string[];
	actionable_recommendations: string[];
	confidence: number;
}

// ============================================================================
// CONFIG
// ============================================================================

const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
	"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
};

const QUALITY_THRESHOLD = 0.6;

// ============================================================================
// PLUGIN
// ============================================================================

class SmartReviewAnalyzer extends Plugin {
	constructor() {
		super(
			"smart-review-analyzer",
			"Smart Review Analyzer",
			"Cost-optimized review analysis"
		);

		this.dimensions = ["quality_check", "deep_analysis"];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			deep_analysis: ["quality_check"]
		};
	}

	shouldSkipDimension(ctx: SectionDimensionContext): boolean {
		if (ctx.dimension !== "deep_analysis") {
			return false;
		}

		const qualityResult = ctx.dependencies.quality_check as
			DimensionResult<QualityCheckResult> | undefined;

		const isHighQuality = qualityResult?.data?.is_high_quality;
		const qualityScore = qualityResult?.data?.quality_score || 0;

		if (!isHighQuality || qualityScore < QUALITY_THRESHOLD) {
			console.log(`   ⏭️  Skipped: Low quality (score: ${qualityScore.toFixed(2)})`);
			return true;
		}

		return false;
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections } = ctx;
		const content = sections[0]?.content || "";

		if (dimension === "quality_check") {
			return `Quick quality check: "${content}"

Is this a legitimate, substantive review worth detailed analysis?

Return JSON:
{
  "is_high_quality": true or false,
  "quality_score": 0.0-1.0,
  "reasoning": "brief explanation"
}

High quality = detailed, specific, helpful
Low quality = spam, very short, no substance`;
		}

		if (dimension === "deep_analysis") {
			return `Comprehensive analysis: "${content}"

Return JSON:
{
  "sentiment": "positive|negative|neutral",
  "topics": ["topic1", "topic2", "topic3"],
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "actionable_recommendations": ["action 1", "action 2"],
  "confidence": 0.0-1.0
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		if (dimension === "quality_check") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",
					temperature: 0.1
				}
			};
		}

		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-sonnet-20241022",
				temperature: 0.3
			}
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 05: Skip Logic\n");

	const reviews: SectionData[] = [
		{ content: "Excellent product! The build quality is outstanding and it has exceeded my expectations. Customer service was responsive and helpful when I had questions.", metadata: { id: 1 } },
		{ content: "Very disappointed. The product broke after just two weeks of normal use. Support was unhelpful and refused to honor the warranty.", metadata: { id: 2 } },
		{ content: "Good value for money. Works as advertised and the features are intuitive. Setup was straightforward and documentation was clear.", metadata: { id: 3 } },
		{ content: "The features are powerful but the learning curve is steep. Documentation could be better. Once you get past the initial setup, it's quite effective.", metadata: { id: 4 } },
		{ content: "Bad", metadata: { id: 5 } },
		{ content: "⭐⭐⭐⭐⭐", metadata: { id: 6 } },
		{ content: "BUY NOW!!! CLICK HERE www.spam.com", metadata: { id: 7 } },
		{ content: "ok i guess", metadata: { id: 8 } },
		{ content: "meh", metadata: { id: 9 } },
		{ content: "terrible", metadata: { id: 10 } }
	];

	const engine = new DagEngine({
		plugin: new SmartReviewAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		pricing: { models: PRICING }
	});

	console.log(`Processing ${reviews.length} reviews...\n`);

	const startTime = Date.now();
	const result = await engine.process(reviews);
	const duration = Date.now() - startTime;

	printResults(result, reviews, duration);
}

// ============================================================================
// DISPLAY
// ============================================================================

function printResults(
	result: ProcessResult,
	reviews: SectionData[],
	duration: number
): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	let analyzedCount = 0;
	let skippedCount = 0;

	result.sections.forEach((section, idx: number) => {
		const review = section.section.content;
		const quality = section.results.quality_check as
			DimensionResult<QualityCheckResult> | undefined;
		const analysis = section.results.deep_analysis as
			DimensionResult<DeepAnalysisResult> | undefined;

		console.log(`${idx + 1}. "${review.slice(0, 50)}${review.length > 50 ? '...' : ''}"`);

		if (quality?.data) {
			const q = quality.data;
			const emoji = q.is_high_quality ? "✅" : "❌";
			console.log(`   ${emoji} Quality: ${q.quality_score.toFixed(2)} - ${q.reasoning}`);
		}

		const wasSkipped = analysis?.metadata?.skipped === true;

		if (analysis?.data && !wasSkipped) {
			analyzedCount++;
			const a = analysis.data;
			console.log(`   📊 Sentiment: ${a.sentiment}`);
			console.log(`   🏷️  Topics: ${a.topics.join(", ")}`);
			console.log(`   💡 Insights: ${a.key_insights.length} found`);
		} else {
			skippedCount++;
			console.log(`   ⏭️  Deep analysis skipped`);
		}

		console.log("");
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log(`📊 Total: ${reviews.length} reviews`);
	console.log(`✅ Analyzed: ${analyzedCount}`);
	console.log(`⏭️  Skipped: ${skippedCount}\n`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
		console.log(`🎫 Tokens: ${result.costs.totalTokens.toLocaleString()}`);
		console.log(`⚡ Duration: ${(duration / 1000).toFixed(2)}s\n`);
	}

	console.log("✨ Skip logic saved money by not analyzing low-quality reviews.\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});