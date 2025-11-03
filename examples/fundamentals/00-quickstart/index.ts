/**
 * 00-quickstart - Customer Review Analysis Pipeline
 *
 * A complete example showing dagengine's core capabilities:
 * - Automatic spam filtering with skip logic
 * - Parallel sentiment and category analysis
 * - Dynamic section transformation (grouping)
 * - Multi-model orchestration (Haiku + Sonnet)
 * - Full cost tracking with token usage
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionDimensionContext,
	type TransformSectionsContext,
	type SectionData,
} from "@dagengine/core";
import { SAMPLE_REVIEWS } from "./data.js";
import type {
	GlobalGroupingDependencies,
	GlobalSummaryDependencies,
} from "./types.js";
import { isGroupingResult, isSpamCheckResult } from "./types.js";
import { PromptBuilder } from "./prompts.js";
import { MODELS, TEMPS, PRICING } from "./config.js";
import { displayResults } from "./utils.js";

// Load environment variables
config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// PLUGIN DEFINITION
// ============================================================================

/**
 * Review Analyzer Plugin
 *
 * Implements a multi-stage review analysis pipeline:
 * 1. Filter spam reviews (saves API costs)
 * 2. Analyze sentiment and categorize (parallel execution)
 * 3. Group reviews by category (transforms sections)
 * 4. Deep analysis per category (uses Sonnet for quality)
 * 5. Executive summary (synthesizes findings)
 */
class ReviewAnalyzer extends Plugin {
	constructor() {
		super("review-analyzer", "Review Analyzer", "Analyze customer reviews");

		// Define 6-stage workflow
		this.dimensions = [
			"filter_spam", // Section: Detect spam/fake reviews
			"sentiment", // Section: Positive/negative/neutral
			"categorize", // Section: pricing/support/features/ux/performance
			{ name: "group_by_category", scope: "global" }, // Global: Group reviews
			"analyze_category", // Section: Deep insights per category
			{ name: "executive_summary", scope: "global" }, // Global: Final summary
		];
	}

	/**
	 * Define dimension dependencies
	 *
	 * Creates an execution DAG that ensures proper ordering:
	 * - sentiment/categorize wait for filter_spam (skip logic)
	 * - group_by_category waits for sentiment + categorize
	 * - analyze_category waits for group_by_category (transformation)
	 * - executive_summary waits for analyze_category
	 */
	defineDependencies(): Record<string, string[]> {
		return {
			// Section dimensions depend on spam filter
			sentiment: ["filter_spam"],
			categorize: ["filter_spam"],

			// Global grouping needs both section results
			group_by_category: ["sentiment", "categorize"],

			// Category analysis needs grouping (creates new sections)
			analyze_category: ["group_by_category"],

			// Executive summary synthesizes category analyses
			executive_summary: ["analyze_category"],
		};
	}

	/**
	 * Skip logic: Don't analyze spam reviews
	 *
	 * Saves API costs by skipping sentiment/categorize for spam.
	 * This demonstrates conditional execution based on dependencies.
	 */
	shouldSkipSectionDimension(ctx: SectionDimensionContext): boolean {
		// Only check skip logic for sentiment and categorize
		if (ctx.dimension === "sentiment" || ctx.dimension === "categorize") {
			const filterResult = ctx.dependencies.filter_spam;

			// Validate we have spam detection result
			if (!filterResult?.data || !isSpamCheckResult(filterResult.data)) {
				return false;
			}

			// Skip if marked as spam
			if (filterResult.data.is_spam) {
				console.log(
					`⏭️  Skipped [${ctx.dimension}] for spam: "${ctx.section.content.slice(0, 30)}..."`,
				);
				return true;
			}
		}

		return false;
	}

	/**
	 * Transform sections after grouping
	 *
	 * Converts individual review sections into category group sections.
	 * This demonstrates dynamic section transformation.
	 */
	transformSections(ctx: TransformSectionsContext): SectionData[] {
		// Only transform after group_by_category dimension
		if (ctx.dimension === "group_by_category") {
			const result = ctx.result;

			// Validate grouping result
			if (!result.data || !isGroupingResult(result.data)) {
				console.warn("⚠️  Invalid grouping result, keeping original sections");
				return ctx.currentSections;
			}

			// Transform: create one section per category
			return result.data.categories.map((category) => ({
				content: category.reviews.join("\n\n---\n\n"), // Combine reviews
				metadata: {
					category: category.name,
					count: category.reviews.length,
					avg_sentiment: category.avg_sentiment,
				},
			}));
		}

		return ctx.currentSections;
	}

	/**
	 * Create AI prompts for each dimension
	 *
	 * Uses PromptBuilder to generate sanitized, structured prompts
	 * that return JSON responses for type safety.
	 */
	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;
		const content = sections[0]?.content || "";

		switch (dimension) {
			case "filter_spam":
				return PromptBuilder.spamCheck(content);

			case "sentiment":
				return PromptBuilder.sentiment(content);

			case "categorize":
				return PromptBuilder.categorize(content);

			case "group_by_category":
				return PromptBuilder.groupByCategory(
					ctx.sections,
					dependencies as GlobalGroupingDependencies,
				);

			case "analyze_category":
				return PromptBuilder.analyzeCategory(sections[0]);

			case "executive_summary":
				return PromptBuilder.executiveSummary(
					dependencies as GlobalSummaryDependencies,
				);

			default:
				return "";
		}
	}

	/**
	 * Select AI model for each dimension
	 *
	 * Strategy:
	 * - Haiku (fast/cheap) for filtering and simple tasks
	 * - Sonnet (smart/expensive) for complex analysis and synthesis
	 */
	selectProvider(dimension: string): ProviderSelection {
		// Use Haiku for spam detection (fast + cheap)
		if (dimension === "filter_spam") {
			return {
				provider: "anthropic",
				options: { model: MODELS.FAST, temperature: TEMPS.DETERMINISTIC },
			};
		}

		// Use Sonnet for deep analysis and summary (quality matters)
		if (dimension === "analyze_category" || dimension === "executive_summary") {
			return {
				provider: "anthropic",
				options: { model: MODELS.SMART, temperature: TEMPS.CREATIVE },
			};
		}

		// Use Haiku for everything else (sentiment, categorize, grouping)
		return {
			provider: "anthropic",
			options: { model: MODELS.FAST, temperature: TEMPS.BALANCED },
		};
	}
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
	// Validate API key
	if (!process.env.ANTHROPIC_API_KEY) {
		console.error("\n❌ Missing ANTHROPIC_API_KEY");
		console.error("\n📋 Quick setup:");
		console.error("   1. Copy the example: cp .env.example .env");
		console.error("   2. Get your key: https://console.anthropic.com/");
		console.error("   3. Add to .env: ANTHROPIC_API_KEY=sk-ant-...\n");
		process.exit(1);
	}

	console.log("\n🚀 dagengine Quickstart: Review Analysis\n");
	console.log(`📊 Analyzing ${SAMPLE_REVIEWS.length} customer reviews...\n`);

	const startTime = Date.now();

	try {
		// Initialize DAG engine
		const engine = new DagEngine({
			plugin: new ReviewAnalyzer(),
			providers: {
				anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
			},
			execution: {
				concurrency: 5, // Process 5 dimensions/sections in parallel
				continueOnError: true, // Don't stop on first error
			},
			pricing: {
				models: PRICING, // Track costs per model
			},
		});

		// Execute pipeline
		const result = await engine.process(SAMPLE_REVIEWS);
		const duration = Date.now() - startTime;

		// Display results with metrics
		displayResults(result, duration);
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(
			"\n❌ Analysis failed after",
			(duration / 1000).toFixed(1),
			"seconds\n",
		);

		// Provide helpful error messages
		if (error instanceof Error) {
			if (error.message.includes("API key") || error.message.includes("401")) {
				console.error("💡 Your API key may be invalid or expired");
				console.error("   Get a new one: https://console.anthropic.com/\n");
			} else if (error.message.includes("rate limit")) {
				console.error("💡 Rate limit hit - try reducing concurrency:");
				console.error("   execution: { concurrency: 2 }\n");
			} else if (error.message.includes("timeout")) {
				console.error("💡 Timeout - try increasing timeout:");
				console.error("   execution: { timeout: 120000 }\n");
			} else {
				console.error("Error:", error.message);
				console.error("\n💡 If this persists, please report:");
				console.error("   https://github.com/dagengine/dag-engine/issues\n");
			}
		}

		process.exit(1);
	}
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Unexpected error:", error.message);
	process.exit(1);
});