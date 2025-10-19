/**
 * Fundamentals 03: Section vs Global
 *
 * THE killer feature of dag-ai.
 *
 * Learn:
 * - Section dimensions (per-item, parallel)
 * - Global dimensions (cross-item, sequential)
 * - When to use each scope
 * - How data flows between scopes
 *
 * This is what makes dag-ai different from other frameworks.
 *
 * Run: npm run guide:03
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

interface SentimentResult {
	sentiment: "positive" | "negative" | "neutral";
	score: number;
}

interface AggregatedSentiments {
	sections: Array<DimensionResult<SentimentResult>>;
	aggregated: boolean;
	totalSections: number;
}

interface OverallAnalysis {
	total_reviews: number;
	positive_count: number;
	negative_count: number;
	neutral_count: number;
	average_score: number;
	overall_sentiment: "positive" | "negative" | "neutral";
	recommendation: string;
}

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * ReviewAnalyzer
 *
 * Demonstrates section vs global scope:
 *
 * SECTION dimension: "analyze_sentiment"
 * - Runs once PER review (parallel)
 * - Analyzes each review independently
 * - Fast, distributed processing
 *
 * GLOBAL dimension: "overall_analysis"
 * - Runs once ACROSS ALL reviews (sequential)
 * - Aggregates all sentiment results
 * - Cross-review synthesis
 */
class ReviewAnalyzer extends Plugin {
	constructor() {
		super(
			"review-analyzer",
			"Review Analyzer",
			"Section vs Global demonstration"
		);

		this.dimensions = [
			// ✅ SECTION DIMENSION (default scope)
			// Runs once per review, in parallel
			"analyze_sentiment",

			// ✅ GLOBAL DIMENSION (explicit scope)
			// Runs once across all reviews, sequentially
			{
				name: "overall_analysis",
				scope: "global"
			}
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			// overall_analysis needs all sentiment results
			overall_analysis: ["analyze_sentiment"]
		};
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;

		// ============================================================================
		// SECTION DIMENSION: analyze_sentiment
		// ============================================================================

		if (dimension === "analyze_sentiment") {
			// ✅ SECTION SCOPE: ctx.sections contains ONE review
			const review = sections[0]?.content || "";

			return `Analyze the sentiment of this review:

"${review}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0
}`;
		}

		// ============================================================================
		// GLOBAL DIMENSION: overall_analysis
		// ============================================================================

		if (dimension === "overall_analysis") {
			// ✅ GLOBAL SCOPE: ctx.dependencies contains ALL sentiment results
			const sentimentData = dependencies.analyze_sentiment as DimensionResult<AggregatedSentiments> | undefined;

			if (!sentimentData?.data?.aggregated) {
				return "Error: Expected aggregated sentiment data";
			}

			// Extract all sentiment results
			const allSentiments = sentimentData.data.sections.map((s) => ({
				sentiment: s.data?.sentiment || "neutral",
				score: s.data?.score || 0
			}));

			return `Analyze these sentiment results from ${allSentiments.length} reviews:

${JSON.stringify(allSentiments, null, 2)}

Return JSON:
{
  "total_reviews": ${allSentiments.length},
  "positive_count": count of positive reviews,
  "negative_count": count of negative reviews,
  "neutral_count": count of neutral reviews,
  "average_score": average sentiment score,
  "overall_sentiment": "positive" or "negative" or "neutral",
  "recommendation": "business recommendation based on analysis"
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		// Use fast model for sentiment (simple task)
		if (dimension === "analyze_sentiment") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",
					temperature: 0.1
				}
			};
		}

		// Use powerful model for analysis (complex task)
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
	console.log("\n📚 Fundamentals 03: Section vs Global\n");
	console.log("THE killer feature of dag-ai.\n");

	// ============================================================================
	// SETUP
	// ============================================================================

	const sections: SectionData[] = [
		{ content: "Amazing product! Exceeded all expectations.", metadata: { id: 1 } },
		{ content: "Good quality, fair price. Happy with purchase.", metadata: { id: 2 } },
		{ content: "Terrible. Broke after one day.", metadata: { id: 3 } },
		{ content: "It's okay. Nothing special.", metadata: { id: 4 } },
		{ content: "Love it! Best purchase this year.", metadata: { id: 5 } }
	];

	const engine = new DagEngine({
		plugin: new ReviewAnalyzer(),
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

	console.log(`✓ Created engine with ReviewAnalyzer`);
	console.log(`✓ Prepared ${sections.length} reviews\n`);

	// ============================================================================
	// EXPLAIN THE CONCEPT
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("THE CONCEPT: Section vs Global");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("📦 SECTION DIMENSIONS (default)");
	console.log("   - Run once PER item");
	console.log("   - Execute in PARALLEL");
	console.log("   - Independent analysis");
	console.log("   - Fast, distributed\n");

	console.log("   Example: analyze_sentiment");
	console.log("   ├─ Review 1 → sentiment (parallel)");
	console.log("   ├─ Review 2 → sentiment (parallel)");
	console.log("   ├─ Review 3 → sentiment (parallel)");
	console.log("   ├─ Review 4 → sentiment (parallel)");
	console.log("   └─ Review 5 → sentiment (parallel)\n");

	console.log("🌍 GLOBAL DIMENSIONS");
	console.log("   - Run once ACROSS ALL items");
	console.log("   - Execute SEQUENTIALLY (after dependencies)");
	console.log("   - Cross-item synthesis");
	console.log("   - Aggregation, comparison\n");

	console.log("   Example: overall_analysis");
	console.log("   └─ All 5 sentiments → overall analysis (1 call)\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// EXECUTION FLOW
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("EXECUTION FLOW");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Phase 1: SECTION dimension (parallel)");
	console.log("────────────────────────────────────────");
	console.log("  analyze_sentiment runs 5 times (one per review)");
	console.log("  All 5 run in parallel");
	console.log("  Time: ~1-2 seconds\n");

	console.log("Phase 2: GLOBAL dimension (sequential)");
	console.log("────────────────────────────────────────");
	console.log("  overall_analysis runs 1 time (across all reviews)");
	console.log("  Receives ALL 5 sentiment results automatically");
	console.log("  Time: ~1-2 seconds\n");

	console.log("Total: ~3 seconds for complete analysis\n");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// PROCESS
	// ============================================================================

	console.log("Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	// ============================================================================
	// DISPLAY SECTION RESULTS
	// ============================================================================

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("SECTION RESULTS (per review)");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((section, idx) => {
		const review = section.section.content;
		const sentimentResult = section.results.analyze_sentiment as DimensionResult<SentimentResult> | undefined;

		if (sentimentResult?.data) {
			const s = sentimentResult.data;
			const emoji = s.sentiment === "positive" ? "😊" : s.sentiment === "negative" ? "😞" : "😐";

			console.log(`${idx + 1}. "${review}"`);
			console.log(`   ${emoji} Sentiment: ${s.sentiment} (${s.score.toFixed(2)})\n`);
		}
	});

	// ============================================================================
	// DISPLAY GLOBAL RESULTS
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("GLOBAL RESULTS (across all reviews)");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	const overallResult = result.globalResults.overall_analysis as DimensionResult<OverallAnalysis> | undefined;

	if (overallResult?.data) {
		const analysis = overallResult.data;

		console.log(`📊 Total Reviews: ${analysis.total_reviews}`);
		console.log(`   ├─ 😊 Positive: ${analysis.positive_count}`);
		console.log(`   ├─ 😞 Negative: ${analysis.negative_count}`);
		console.log(`   └─ 😐 Neutral: ${analysis.neutral_count}\n`);

		console.log(`📈 Average Score: ${analysis.average_score.toFixed(2)}`);
		console.log(`🎯 Overall Sentiment: ${analysis.overall_sentiment}\n`);

		console.log(`💡 Recommendation:`);
		console.log(`   ${analysis.recommendation}\n`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// EXPLANATION
	// ============================================================================

	console.log("✨ What just happened?\n");

	console.log("1. SECTION dimension (analyze_sentiment):");
	console.log("   - Ran 5 times (once per review)");
	console.log("   - All 5 ran in PARALLEL");
	console.log("   - Each got ONE review to analyze");
	console.log("   - Results: 5 individual sentiments\n");

	console.log("2. dag-ai automatically aggregated:");
	console.log("   - Collected all 5 sentiment results");
	console.log("   - Packaged them for global dimension");
	console.log("   - Made available via ctx.dependencies\n");

	console.log("3. GLOBAL dimension (overall_analysis):");
	console.log("   - Ran 1 time (across all reviews)");
	console.log("   - Received ALL 5 sentiment results");
	console.log("   - Created cross-review analysis");
	console.log("   - Result: 1 overall analysis\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ Section dimensions run per-item (parallel)");
	console.log("✓ Global dimensions run across-all-items (sequential)");
	console.log("✓ dag-ai automatically aggregates section results");
	console.log("✓ Global dimensions receive aggregated data");
	console.log("✓ Use section for independent analysis");
	console.log("✓ Use global for cross-item synthesis\n");

	console.log("💡 Key insight:\n");
	console.log("This is THE killer feature.");
	console.log("Other frameworks treat everything the same.");
	console.log("dag-ai has TWO scopes = elegant workflows.\n");

	console.log("📊 When to use each:\n");
	console.log("SECTION scope:");
	console.log("  ✓ Sentiment analysis");
	console.log("  ✓ Topic extraction");
	console.log("  ✓ Entity recognition");
	console.log("  ✓ Classification");
	console.log("  ✓ Any independent per-item task\n");

	console.log("GLOBAL scope:");
	console.log("  ✓ Summary of all results");
	console.log("  ✓ Comparison across items");
	console.log("  ✓ Aggregation (counts, averages)");
	console.log("  ✓ Grouping/clustering");
	console.log("  ✓ Any cross-item synthesis\n");

	console.log("⏭️  Next: npm run guide:04 (transformations)\n");
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