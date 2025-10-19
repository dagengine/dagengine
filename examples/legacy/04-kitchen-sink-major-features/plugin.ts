import {
	Plugin,
	ProviderSelection,
	SectionDimensionContext,
	TransformSectionsContext,
	SectionData,
	DimensionResultContext,
	FailureContext,
	DimensionResult,
	PromptContext,
} from "../../../src";
import {
	SkipStats,
	QualityData,
	GroupingResult,
	SentimentData,
} from "./types";

import { PROVIDER_STRATEGIES } from "./config";
import { createPrompt } from "./prompts";

// ============================================================================
// PLUGIN
// ============================================================================

export class SmartReviewAnalyzer extends Plugin {
	private readonly cache = new Map<string, SkipStats>();
	public readonly stats: SkipStats = { skipped: 0, cached: 0, lowQuality: 0 };

	constructor() {
		super(
			"smart-review-analyzer",
			"Smart Review Analyzer",
			"Production-ready review analysis with intelligent cost optimization",
		);

		this.dimensions = [
			"quality_check",
			"sentiment",
			"topics",
			{ name: "group_by_sentiment", scope: "global" },
			"deep_analysis",
			{ name: "competitive_compare", scope: "global" },
			{ name: "executive_summary", scope: "global" },
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			sentiment: ["quality_check"],
			topics: ["quality_check"],
			group_by_sentiment: ["sentiment", "topics"],
			deep_analysis: ["group_by_sentiment"],
			competitive_compare: ["deep_analysis"],
			executive_summary: ["competitive_compare"],
		};
	}

	selectProvider(dimension: string): ProviderSelection {
		const strategy = PROVIDER_STRATEGIES[dimension];
		return strategy || PROVIDER_STRATEGIES["default"]!;
	}

	shouldSkipDimension(
		context: SectionDimensionContext,
	): boolean | { skip: true; result: DimensionResult } {
		const { dimension, section, dependencies } = context;

		if (dimension === "sentiment" || dimension === "topics") {
			const qualityData = dependencies["quality_check"]?.data as
				| QualityData
				| undefined;
			const quality = qualityData?.quality_score;

			if (quality !== undefined && quality < 5) {
				this.stats.lowQuality++;
				return true;
			}
		}

		if (dimension === "deep_analysis") {
			const sentimentData = dependencies["sentiment"]?.data as
				| SentimentData
				| undefined;
			const sentiment = sentimentData?.sentiment;

			if (sentiment === "negative" || sentiment === "neutral") {
				this.stats.skipped++;
				return true;
			}
		}

		const cacheKey = `${dimension}:${section.content.slice(0, 50)}`;
		const cached = this.cache.get(cacheKey) as DimensionResult;

		if (cached) {
			this.stats.cached++;
			return { skip: true, result: cached };
		}

		return false;
	}

	createPrompt(context: PromptContext): string {
		return createPrompt(context);
	}

	transformSections(context: TransformSectionsContext): SectionData[] {
		if (context.dimension !== "group_by_sentiment") {
			return context.currentSections;
		}

		const groups = context.result.data as GroupingResult;
		const sections: SectionData[] = [];

		const sentimentGroups: Array<[string, number[]]> = [
			["positive", groups.positive || []],
			["negative", groups.negative || []],
			["neutral", groups.neutral || []],
		];

		for (const [sentiment, ids] of sentimentGroups) {
			const reviews = ids
				.map((i) => context.currentSections[i])
				.filter((r): r is SectionData => r !== undefined);

			if (reviews.length > 0) {
				sections.push({
					content: reviews.map((r) => r.content).join("\n\n---\n\n"),
					metadata: {
						sentiment_group: sentiment,
						review_count: reviews.length,
						original_ids: ids,
					},
				});
			}
		}

		return sections;
	}

	afterDimensionExecute(context: DimensionResultContext): void {
		if (!context.result.error && !context.isGlobal) {
			const key = `${context.dimension}:${context.sections[0]?.content.slice(0, 50) || ""}`;
			this.cache.set(key, context.result as SkipStats);
		}
	}

	handleDimensionFailure(context: FailureContext): DimensionResult | undefined {
		if (context.dimension === "sentiment") {
			return {
				data: { sentiment: "neutral", score: 0.5, confidence: 0.3 },
				metadata: { fallback: true },
			};
		}
		return undefined;
	}
}
