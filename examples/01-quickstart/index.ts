/**
 * 00-quickstart - The Perfect First Example (Type-Safe)
 *
 * Shows: Customer review analysis with all dag-ai superpowers
 * Time: ~10 seconds
 * Cost: ~$0.02 (for demo with 12 reviews)
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
	type DimensionResult,
} from "../../src/index.js";
import { SAMPLE_REVIEWS } from "./data.js";
import type {
	GroupingResult,
	ReviewWithAnalysis,
	SectionDependencies,
	GlobalGroupingDependencies,
	GlobalSummaryDependencies,
} from "./types.js";

import { displayResults } from "./utils.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// PLUGIN
// ============================================================================

class ReviewAnalyzer extends Plugin {
	constructor() {
		super("review-analyzer", "Review Analyzer", "Analyze customer reviews");

		this.dimensions = [
			"filter_spam",
			"sentiment",
			"categorize",
			{ name: "group_by_category", scope: "global" },
			"analyze_category",
			{ name: "executive_summary", scope: "global" },
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			sentiment: ["filter_spam"],
			categorize: ["filter_spam"],
			group_by_category: ["sentiment", "categorize"],
			analyze_category: ["group_by_category"],
			executive_summary: ["analyze_category"],
		};
	}

	shouldSkipDimension(ctx: SectionDimensionContext): boolean {
		if (ctx.dimension === "sentiment" || ctx.dimension === "categorize") {
			const deps = ctx.dependencies as SectionDependencies;
			const isSpam = deps.filter_spam?.data?.is_spam;

			if (isSpam) {
				console.log(
					`⏭️  Skipped spam: "${ctx.section.content.slice(0, 30)}..."`,
				);
				return true;
			}
		}
		return false;
	}

	transformSections(ctx: TransformSectionsContext): SectionData[] {
		if (ctx.dimension === "group_by_category") {
			const result = ctx.result as DimensionResult<GroupingResult>;
			const categories = result.data?.categories || [];

			return categories.map((cat) => ({
				content: cat.reviews.join("\n\n---\n\n"),
				metadata: {
					category: cat.name,
					count: cat.reviews.length,
					avg_sentiment: cat.avg_sentiment,
				},
			}));
		}

		return ctx.currentSections;
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;
		const content = sections[0]?.content || "";

		switch (dimension) {
			case "filter_spam":
				return this.createSpamCheckPrompt(content);

			case "sentiment":
				return this.createSentimentPrompt(content);

			case "categorize":
				return this.createCategoryPrompt(content);

			case "group_by_category":
				return this.createGroupingPrompt(ctx);

			case "analyze_category":
				return this.createAnalysisPrompt(sections[0]);

			case "executive_summary":
				return this.createSummaryPrompt(
					dependencies as GlobalSummaryDependencies,
				);

			default:
				return "";
		}
	}

	selectProvider(dimension: string): ProviderSelection {
		// Use fast/cheap model for filtering
		if (dimension === "filter_spam") {
			return {
				provider: "anthropic",
				options: { model: "claude-3-5-haiku-20241022", temperature: 0.1 },
			};
		}

		// Use powerful model for analysis and synthesis
		if (dimension === "analyze_category" || dimension === "executive_summary") {
			return {
				provider: "anthropic",
				options: { model: "claude-3-5-sonnet-20241022", temperature: 0.3 },
			};
		}

		// Use fast model for everything else
		return {
			provider: "anthropic",
			options: { model: "claude-3-5-haiku-20241022", temperature: 0.2 },
		};
	}

	// ============================================================================
	// PROMPT BUILDERS
	// ============================================================================

	private createSpamCheckPrompt(content: string): string {
		return `Is this review spam/fake?

Review: "${content}"

Return JSON:
{
  "is_spam": true or false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;
	}

	private createSentimentPrompt(content: string): string {
		return `Analyze sentiment:

Review: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0
}`;
	}

	private createCategoryPrompt(content: string): string {
		return `Categorize this review into ONE category:

Review: "${content}"

Categories: pricing, support, features, ux, performance, other

Return JSON:
{
  "category": "one of the categories above"
}`;
	}

	private createGroupingPrompt(ctx: PromptContext): string {
		const deps = ctx.dependencies as GlobalGroupingDependencies;
		const sentiments = deps.sentiment?.data?.sections || [];
		const categories = deps.categorize?.data?.sections || [];

		const reviews: ReviewWithAnalysis[] = sentiments.map((s, idx) => ({
			sentiment: s?.data?.sentiment || "neutral",
			category: categories[idx]?.data?.category || "other",
			content: ctx.sections[idx]?.content || "",
		}));

		return `Group these reviews by category and calculate stats:

Reviews: ${JSON.stringify(reviews)}

Return JSON:
{
  "categories": [
    {
      "name": "category name",
      "reviews": ["review text 1", "review text 2"],
      "count": 2,
      "avg_sentiment": "positive" or "negative" or "neutral"
    }
  ]
}`;
	}

	private createAnalysisPrompt(section: SectionData | undefined): string {
		if (!section) return "";

		const category = (section.metadata?.category as string) || "unknown";
		const count = (section.metadata?.count as number) || 0;
		const content = section.content;

		return `Deep analysis of ${count} reviews in category: ${category}

Reviews:
${content}

Return JSON:
{
  "category": "${category}",
  "key_insight": "main finding in one sentence",
  "recommendation": "specific action to take",
  "impact": "high" or "medium" or "low",
  "top_quote": "most representative quote from reviews"
}`;
	}

	private createSummaryPrompt(deps: GlobalSummaryDependencies): string {
		const analyses = deps.analyze_category?.data?.sections || [];
		const analysisData = analyses.map((a) => a?.data).filter(Boolean);

		return `Create executive summary from category analyses:

Analyses: ${JSON.stringify(analysisData)}

Return JSON:
{
  "summary": "2-3 sentence overview",
  "top_priorities": ["priority 1", "priority 2", "priority 3"],
  "estimated_impact": "dollar amount or percentage improvement"
}`;
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n🚀 dag-ai Quickstart: Review Analysis\n");
	console.log(`📊 Analyzing ${SAMPLE_REVIEWS.length} customer reviews...\n`);

	const startTime = Date.now();

	const engine = new DagEngine({
		plugin: new ReviewAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
		},
		execution: {
			concurrency: 5,
			continueOnError: true,
		},
		pricing: {
			models: {
				"claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4.0 },
				"claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0 },
			},
		},
	});

	const result = await engine.process(SAMPLE_REVIEWS);

	const duration = Date.now() - startTime;

	displayResults(result, duration);
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});
