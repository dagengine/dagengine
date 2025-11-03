/**
 * Fundamentals 03: Section vs Global
 *
 * Learn:
 * - Section dimensions (per-item, parallel)
 * - Global dimensions (cross-item, sequential)
 * - When to use each scope
 * - How data flows between scopes
 *
 * Run: npm run 03
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
	type ProcessResult,
} from "@dagengine/core";

import { printConcept } from './utils.js'

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

// Custom type for section results
interface SectionResult {
	section: SectionData;
	results: Record<string, DimensionResult<unknown>>;
}

// ============================================================================
// CONFIG
// ============================================================================

const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4.0 },
	"claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0 },
};

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * ReviewAnalyzer
 *
 * Demonstrates section vs global scope:
 *
 * SECTION: "analyze_sentiment" - Runs once per review (parallel)
 * GLOBAL: "overall_analysis" - Runs once across all reviews (sequential)
 */
class ReviewAnalyzer extends Plugin {
	constructor() {
		super(
			"review-analyzer",
			"Review Analyzer",
			"Section vs Global demonstration",
		);

		this.dimensions = [
			"analyze_sentiment", // Section (default)
			{ name: "overall_analysis", scope: "global" }, // Global (explicit)
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			overall_analysis: ["analyze_sentiment"],
		};
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;

		if (dimension === "analyze_sentiment") {
			// SECTION: ctx.sections contains ONE review
			const review = sections[0]?.content || "";

			return `Analyze sentiment: "${review}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0
}`;
		}

		if (dimension === "overall_analysis") {
			// GLOBAL: ctx.dependencies contains ALL sentiment results
			const sentimentData = dependencies.analyze_sentiment as
				| DimensionResult<AggregatedSentiments>
				| undefined;

			if (!sentimentData?.data?.aggregated) {
				return "Error: Expected aggregated sentiment data";
			}

			const allSentiments = sentimentData.data.sections.map(
				(sectionResult) => ({
					sentiment: sectionResult.data?.sentiment || "neutral",
					score: sectionResult.data?.score || 0,
				}),
			);

			return `Analyze ${allSentiments.length} reviews:

${JSON.stringify(allSentiments, null, 2)}

Return JSON:
{
  "total_reviews": ${allSentiments.length},
  "positive_count": number,
  "negative_count": number,
  "neutral_count": number,
  "average_score": number,
  "overall_sentiment": "positive|negative|neutral",
  "recommendation": "business recommendation"
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		// Fast model for simple task (sentiment)
		if (dimension === "analyze_sentiment") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",
					temperature: 0.1,
				},
			};
		}

		// Powerful model for complex task (analysis)
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-sonnet-20241022",
				temperature: 0.3,
			},
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 03: Section vs Global\n");
	console.log("THE killer feature of dag-engine.\n");

	// Setup
	const sections: SectionData[] = [
		{
			content: "Amazing product! Exceeded all expectations.",
			metadata: { id: 1 },
		},
		{
			content: "Good quality, fair price. Happy with purchase.",
			metadata: { id: 2 },
		},
		{ content: "Terrible. Broke after one day.", metadata: { id: 3 } },
		{ content: "It's okay. Nothing special.", metadata: { id: 4 } },
		{ content: "Love it! Best purchase this year.", metadata: { id: 5 } },
	];

	const engine = new DagEngine({
		plugin: new ReviewAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
		},
		pricing: { models: PRICING },
	});

	console.log(`✓ Created engine with ReviewAnalyzer`);
	console.log(`✓ Prepared ${sections.length} reviews\n`);

	// Explain concept
	printConcept(sections.length);

	// Process
	console.log("Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	// Display results
	printSectionResults(result);
	printGlobalResults(result, duration);
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function printSectionResults(result: ProcessResult): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("SECTION RESULTS (per review)");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach(
		(sectionResult: SectionResult, reviewIndex: number) => {
			const review = sectionResult.section.content;
			const sentiment = sectionResult.results.analyze_sentiment as
				| DimensionResult<SentimentResult>
				| undefined;

			if (sentiment?.data) {
				const sentimentData = sentiment.data;
				const emoji =
					sentimentData.sentiment === "positive"
						? "😊"
						: sentimentData.sentiment === "negative"
							? "😞"
							: "😐";

				console.log(`${reviewIndex + 1}. "${review}"`);
				console.log(
					`   ${emoji} Sentiment: ${sentimentData.sentiment} (${sentimentData.score.toFixed(2)})\n`,
				);
			}
		},
	);
}

function printGlobalResults(result: ProcessResult, duration: number): void {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("GLOBAL RESULTS (across all reviews)");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	const overall = result.globalResults.overall_analysis as
		| DimensionResult<OverallAnalysis>
		| undefined;

	if (overall?.data) {
		const overallData = overall.data;

		console.log(`📊 Total Reviews: ${overallData.total_reviews}`);
		console.log(`   ├─ 😊 Positive: ${overallData.positive_count}`);
		console.log(`   ├─ 😞 Negative: ${overallData.negative_count}`);
		console.log(`   └─ 😐 Neutral: ${overallData.neutral_count}\n`);

		console.log(`📈 Average Score: ${overallData.average_score.toFixed(2)}`);
		console.log(`🎯 Overall Sentiment: ${overallData.overall_sentiment}\n`);

		console.log(`💡 Recommendation:`);
		console.log(`   ${overallData.recommendation}\n`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
		console.log(`🎫 Tokens: ${result.costs.totalTokens.toLocaleString()}`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
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
