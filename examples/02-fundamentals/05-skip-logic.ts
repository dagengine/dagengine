/**
 * Fundamentals 05: Skip Logic
 *
 * Learn cost optimization through smart skipping.
 *
 * Learn:
 * - shouldSkipDimension() hook
 * - Skip expensive operations conditionally
 * - Quality filter pattern
 * - Simple caching strategy
 * - Measure real cost savings
 *
 * Pattern: cheap_check → skip if low quality → expensive_analysis
 *
 * Run: npm run guide:05
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
} from "../../src/index.js";

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
// PLUGIN
// ============================================================================

/**
 * SmartReviewAnalyzer
 *
 * Demonstrates skip logic for cost optimization:
 *
 * Pattern:
 * 1. quality_check (fast, cheap) - Filter low-quality reviews
 * 2. deep_analysis (slow, expensive) - Skip if quality is low
 *
 * Result: Only analyze high-quality reviews = 40-60% cost savings
 */
class SmartReviewAnalyzer extends Plugin {
	private cache: Map<string, DimensionResult<DeepAnalysisResult>> = new Map();
	private skippedCount = 0;
	private cachedCount = 0;

	constructor() {
		super(
			"smart-review-analyzer",
			"Smart Review Analyzer",
			"Cost-optimized review analysis"
		);

		this.dimensions = [
			"quality_check",    // Fast, cheap: Filter spam/low-quality
			"deep_analysis"     // Slow, expensive: Only for high-quality
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			deep_analysis: ["quality_check"]
		};
	}

	/**
	 * ✅ NEW HOOK: shouldSkipDimension
	 *
	 * Called before executing a dimension on a section.
	 * Return true to skip execution.
	 * Return { skip: true, result: data } to skip and provide cached result.
	 *
	 * Use cases:
	 * - Quality filtering (skip low-quality content)
	 * - Caching (skip if already processed)
	 * - Conditional logic (skip based on business rules)
	 *
	 * @param ctx - Context with section and dependencies
	 * @returns boolean (skip) or { skip: true, result: data } (skip with cached result)
	 */
	shouldSkipDimension(ctx: SectionDimensionContext): boolean | { skip: boolean; result?: unknown } {
		if (ctx.dimension !== "deep_analysis") {
			return false; // Don't skip quality_check
		}

		// ============================================================================
		// STRATEGY 1: Quality Filter
		// ============================================================================

		const qualityResult = ctx.dependencies.quality_check as DimensionResult<QualityCheckResult> | undefined;
		const isHighQuality = qualityResult?.data?.is_high_quality;
		const qualityScore = qualityResult?.data?.quality_score || 0;

		if (!isHighQuality || qualityScore < 0.6) {
			this.skippedCount++;
			console.log(`   ⏭️  Skipped: Low quality (score: ${qualityScore.toFixed(2)})`);
			return true; // Skip expensive analysis
		}

		// ============================================================================
		// STRATEGY 2: Simple Cache Check
		// ============================================================================

		const cacheKey = this.getCacheKey(ctx.section.content);
		const cached = this.cache.get(cacheKey);

		if (cached) {
			this.cachedCount++;
			console.log(`   💾 Cached: Using previous result`);
			return { skip: true, result: cached };
		}

		return false; // Proceed with analysis
	}

	/**
	 * afterDimensionExecute - Cache successful results
	 */
	afterDimensionExecute(ctx: SectionDimensionContext): void {
		if (ctx.dimension === "deep_analysis" && ctx.result && !ctx.result.error) {
			const cacheKey = this.getCacheKey(ctx.section.content);
			this.cache.set(cacheKey, ctx.result as DimensionResult<DeepAnalysisResult>);
		}
	}

	/**
	 * Simple cache key generator
	 */
	private getCacheKey(content: string): string {
		// Use first 50 chars as cache key (simple approach)
		return content.slice(0, 50).toLowerCase().trim();
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections } = ctx;
		const content = sections[0]?.content || "";

		// ============================================================================
		// DIMENSION 1: quality_check (fast, cheap)
		// ============================================================================

		if (dimension === "quality_check") {
			return `Quick quality check of this review:

"${content}"

Is this a legitimate, substantive review worth detailed analysis?

Return JSON:
{
  "is_high_quality": true or false,
  "quality_score": 0.0-1.0,
  "reasoning": "brief explanation"
}

High quality = detailed, specific, helpful
Low quality = spam, very short, no substance, gibberish`;
		}

		// ============================================================================
		// DIMENSION 2: deep_analysis (slow, expensive)
		// ============================================================================

		if (dimension === "deep_analysis") {
			return `Perform comprehensive analysis of this review:

"${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "topics": ["topic1", "topic2", "topic3"],
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "actionable_recommendations": ["action 1", "action 2"],
  "confidence": 0.0-1.0
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		// Fast, cheap model for quality checks
		if (dimension === "quality_check") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",
					temperature: 0.1
				}
			};
		}

		// Powerful, expensive model for deep analysis
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-sonnet-20241022",
				temperature: 0.3
			}
		};
	}

	getStats() {
		return {
			skipped: this.skippedCount,
			cached: this.cachedCount
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 05: Skip Logic\n");
	console.log("Learn cost optimization through smart skipping.\n");

	// ============================================================================
	// SETUP
	// ============================================================================

	const reviews: SectionData[] = [
		// High quality reviews
		{ content: "Excellent product! The build quality is outstanding and it has exceeded my expectations. Customer service was responsive and helpful when I had questions.", metadata: { id: 1 } },
		{ content: "Very disappointed. The product broke after just two weeks of normal use. Support was unhelpful and refused to honor the warranty.", metadata: { id: 2 } },
		{ content: "Good value for money. Works as advertised and the features are intuitive. Setup was straightforward and documentation was clear.", metadata: { id: 3 } },

		// Low quality reviews (will be skipped)
		{ content: "Bad", metadata: { id: 4 } },
		{ content: "⭐⭐⭐⭐⭐", metadata: { id: 5 } },
		{ content: "BUY NOW!!! CLICK HERE www.spam.com", metadata: { id: 6 } },
		{ content: "ok i guess", metadata: { id: 7 } },

		// More high quality
		{ content: "The features are powerful but the learning curve is steep. Documentation could be better. Once you get past the initial setup, it's quite effective.", metadata: { id: 8 } },

		// Duplicate (will be cached)
		{ content: "Excellent product! The build quality is outstanding and it has exceeded my expectations. Customer service was responsive and helpful when I had questions.", metadata: { id: 9 } },

		// More low quality
		{ content: "meh", metadata: { id: 10 } }
	];

	const plugin = new SmartReviewAnalyzer();

	const engine = new DagEngine({
		plugin,
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

	console.log(`✓ Created engine with SmartReviewAnalyzer`);
	console.log(`✓ Prepared ${reviews.length} reviews (mix of quality)\n`);

	// ============================================================================
	// EXPLAIN THE PATTERN
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("THE PATTERN: Filter → Skip → Analyze");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("WITHOUT skip logic:");
	console.log("  10 reviews × quality_check ($0.001 each)  = $0.010");
	console.log("  10 reviews × deep_analysis ($0.010 each) = $0.100");
	console.log("  Total: $0.110\n");

	console.log("WITH skip logic:");
	console.log("  10 reviews × quality_check ($0.001 each)  = $0.010");
	console.log("   4 reviews × deep_analysis ($0.010 each) = $0.040");
	console.log("   6 reviews skipped (low quality)         = $0.000");
	console.log("  Total: $0.050 (55% savings!)\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// EXECUTION FLOW
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("EXECUTION FLOW");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Phase 1: QUALITY CHECK (all reviews)");
	console.log("  Run quality_check on all 10 reviews");
	console.log("  Fast, cheap model (Haiku)");
	console.log("  Identify spam/low-quality content\n");

	console.log("Phase 2: SKIP DECISION (per review)");
	console.log("  shouldSkipDimension() called for each review");
	console.log("  Check quality_score from phase 1");
	console.log("  Skip if score < 0.6\n");

	console.log("Phase 3: DEEP ANALYSIS (only high-quality)");
	console.log("  Run deep_analysis on ~4 high-quality reviews");
	console.log("  Powerful, expensive model (Sonnet)");
	console.log("  Skip ~6 low-quality reviews = 60% cost savings\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// PROCESS
	// ============================================================================

	console.log("Processing (watch for skip messages)...\n");

	const startTime = Date.now();
	const result = await engine.process(reviews);
	const duration = Date.now() - startTime;

	const stats = plugin.getStats();

	// ============================================================================
	// DISPLAY RESULTS
	// ============================================================================

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("ANALYSIS RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	let analyzedCount = 0;

	result.sections.forEach((section, idx) => {
		const review = section.section.content;
		const qualityResult = section.results.quality_check as DimensionResult<QualityCheckResult> | undefined;
		const analysisResult = section.results.deep_analysis as DimensionResult<DeepAnalysisResult> | undefined;

		console.log(`${idx + 1}. "${review.slice(0, 50)}${review.length > 50 ? '...' : ''}"`);

		if (qualityResult?.data) {
			const q = qualityResult.data;
			const qualityEmoji = q.is_high_quality ? "✅" : "❌";
			console.log(`   ${qualityEmoji} Quality: ${q.quality_score.toFixed(2)} - ${q.reasoning}`);
		}

		if (analysisResult?.data) {
			analyzedCount++;
			const a = analysisResult.data;
			console.log(`   📊 Sentiment: ${a.sentiment}`);
			console.log(`   🏷️  Topics: ${a.topics.join(", ")}`);
			console.log(`   💡 Insights: ${a.key_insights.length} found`);
		} else {
			console.log(`   ⏭️  Deep analysis skipped`);
		}

		console.log("");
	});

	// ============================================================================
	// STATISTICS
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("OPTIMIZATION STATISTICS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log(`📊 Total reviews: ${reviews.length}`);
	console.log(`✅ High quality: ${analyzedCount} (analyzed)`);
	console.log(`❌ Low quality: ${stats.skipped} (skipped)`);
	console.log(`💾 Cached: ${stats.cached} (reused)\n`);

	if (result.costs) {
		const actualCost = result.costs.totalCost;
		const naiveCost = reviews.length * 0.011; // Approximate cost if all analyzed
		const savings = ((naiveCost - actualCost) / naiveCost) * 100;

		console.log(`💰 Actual cost: $${actualCost.toFixed(4)}`);
		console.log(`💸 Naive cost (no skip): $${naiveCost.toFixed(4)}`);
		console.log(`📉 Savings: ${savings.toFixed(0)}%\n`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// EXPLANATION
	// ============================================================================

	console.log("✨ What just happened?\n");

	console.log("1. QUALITY CHECK phase:");
	console.log("   - Ran quality_check on all 10 reviews");
	console.log("   - Used fast, cheap model (Haiku)");
	console.log("   - Identified high-quality vs low-quality\n");

	console.log("2. SKIP DECISION phase:");
	console.log("   - For each review, shouldSkipDimension() was called");
	console.log("   - Checked quality_score from quality_check");
	console.log("   - Skipped deep_analysis if score < 0.6");
	console.log(`   - Result: Skipped ${stats.skipped} low-quality reviews\n`);

	console.log("3. DEEP ANALYSIS phase:");
	console.log(`   - Ran deep_analysis on ${analyzedCount} high-quality reviews`);
	console.log("   - Used powerful, expensive model (Sonnet)");
	console.log("   - Saved money by not analyzing low-quality content\n");

	console.log("4. CACHING bonus:");
	console.log(`   - Detected ${stats.cached} duplicate review(s)`);
	console.log("   - Reused previous result (instant, free)");
	console.log("   - Additional savings from cache hits\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ shouldSkipDimension() enables conditional execution");
	console.log("✓ Skip expensive operations based on cheap checks");
	console.log("✓ Quality filter pattern (fast → skip → expensive)");
	console.log("✓ Simple caching strategy (check → reuse → save)");
	console.log("✓ Real cost savings: 40-60% typical\n");

	console.log("💡 Key insight:\n");
	console.log("Skip logic is how you optimize costs.");
	console.log("Always run a cheap check before an expensive operation.\n");

	console.log("📊 Skip strategies:\n");
	console.log("1. Quality filter:");
	console.log("   cheap_check → skip if low quality → expensive_analysis\n");

	console.log("2. Cache check:");
	console.log("   check cache → skip if cached → run and cache\n");

	console.log("3. Business rules:");
	console.log("   check conditions → skip if not applicable → process\n");

	console.log("4. Content length:");
	console.log("   check length → skip if too short/long → analyze\n");

	console.log("⚠️  Important notes:\n");
	console.log("• Skip logic runs BEFORE the dimension executes");
	console.log("• Skipped dimensions don't count toward API usage");
	console.log("• Dependent dimensions still receive skip information");
	console.log("• Use skip for cost optimization, not business logic\n");

	console.log("⏭️  Next: npm run guide:06 (providers)\n");
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